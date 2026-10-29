// Migration 28 (comprovante de garantia com rubrica) num Postgres local com todas as migrations:
// roda duas vezes, quem lê o registro e o PDF assinado (mesmas regras das vendas), ninguém grava
// pela tela, um registro por venda, confirmação única e registro confirmado travado até para a
// chave de serviço.
// Uso: sh scripts/qa/rodar.sh assinatura-garantia-banco-local
import fs from 'node:fs';
import { boot, as } from './banco-local';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${!ok && extra ? ' — ' + extra : ''}`); };

const db = await boot();
// no Supabase o papel authenticated tem acesso à tabela de arquivos e só o RLS decide (como aqui)
await db.exec(`GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated`);
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[];
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch { return true; } };

// roda de novo: não pode falhar nem perder dados
const migration = fs.readFileSync('supabase/migrations/28_warranty_signatures.sql', 'utf8');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const SUPER = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN = 'aaaaaaaa-0000-0000-0000-000000000002';
const SELLER = 'aaaaaaaa-0000-0000-0000-000000000003';
const TECH = 'aaaaaaaa-0000-0000-0000-000000000005';
const ADMIN_B = 'aaaaaaaa-0000-0000-0000-000000000004';
await db.exec(`
  INSERT INTO tenants (id, name, trade_name, email, phone) VALUES
    ('${A}', 'Loja A LTDA', 'Loja Alfa', 'a@a', '1'), ('${B}', 'Loja B LTDA', 'Loja Beta', 'b@b', '2');
  INSERT INTO profiles (id, tenant_id, role, full_name, email) VALUES
    ('${SUPER}', NULL, 'super_admin', 'Super', 's@x'), ('${ADMIN}', '${A}', 'admin', 'Dono A', 'admin@a'),
    ('${SELLER}', '${A}', 'seller', 'Vendedor A', 'seller@a'), ('${TECH}', '${A}', 'technician', 'Técnico A', 'tech@a'),
    ('${ADMIN_B}', '${B}', 'admin', 'Dono B', 'admin@b');
`);

// a função edge grava com a chave de serviço (aqui: o dono do banco, que ignora o RLS)
const insert = (tenant: string, sale: string, hash: string) => q(`
  INSERT INTO warranty_signatures (tenant_id, sale_id, sale_number, customer_id, token_hash, snapshot, original_pdf_path, original_pdf_sha256)
  VALUES ($1::uuid, $2, 1001, 'cust-1', $3, '{"store":{"name":"Loja"}}', $1::text || '/' || $2 || '/original.pdf', 'abc') RETURNING id`, [tenant, sale, hash]);
const [{ id: rowA }] = await insert(A, 'sale-A-1', 'hash-a1');
await insert(B, 'sale-B-1', 'hash-b1');
await q(`INSERT INTO storage.objects (bucket_id, name) VALUES ('warranty-receipts', $1), ('warranty-receipts', $2)`,
  [`${A}/sale-A-1/comprovante-assinado-1.pdf`, `${B}/sale-B-1/comprovante-assinado-1.pdf`]);

await db.exec(migration);
check('migration 28 roda de novo sem erro e sem perder dados', (await q(`SELECT count(*)::int n FROM warranty_signatures`))[0].n === 2);
check('bucket privado criado', (await q(`SELECT public FROM storage.buckets WHERE id = 'warranty-receipts'`))[0]?.public === false);

// ---- leitura: mesmas regras das vendas
const sees = async (user: string | null) => as(db, user, () => q(`SELECT sale_id FROM warranty_signatures ORDER BY sale_id`));
check('administrador lê só o da própria loja', JSON.stringify((await sees(ADMIN)).map(r => r.sale_id)) === '["sale-A-1"]');
check('vendedor lê o da própria loja', (await sees(SELLER)).length === 1);
check('técnico não lê (não lê vendas)', (await sees(TECH)).length === 0);
check('outra loja não lê', JSON.stringify((await sees(ADMIN_B)).map(r => r.sale_id)) === '["sale-B-1"]');
check('Super Admin lê todas', (await sees(SUPER)).length === 2);
check('sem login: nada', await fails(() => db.exec(`SET ROLE anon; SELECT * FROM warranty_signatures; RESET ROLE;`)).finally(() => db.exec('RESET ROLE')));

// ---- gravação: ninguém pela tela
check('administrador não insere', await fails(() => as(db, ADMIN, () => q(`INSERT INTO warranty_signatures (tenant_id, sale_id, token_hash, snapshot, original_pdf_path, original_pdf_sha256) VALUES ($1, 'x', 'h', '{}', 'p', 's')`, [A]))));
const upd = await as(db, ADMIN, async () => { try { return (await q(`UPDATE warranty_signatures SET status = 'signed' RETURNING id`)).length; } catch { return -1; } });
check('administrador não altera status', upd <= 0 && (await q(`SELECT status FROM warranty_signatures WHERE id = $1`, [rowA]))[0].status === 'pending');
check('administrador não exclui', await as(db, ADMIN, async () => { try { return (await q(`DELETE FROM warranty_signatures RETURNING id`)).length === 0; } catch { return true; } }));

// ---- um registro por venda e token único
check('segundo registro para a mesma venda: recusado', await fails(() => insert(A, 'sale-A-1', 'hash-outro')));
check('token repetido: recusado', await fails(() => insert(A, 'sale-A-2', 'hash-a1')));

// ---- confirmação única: só uma atualização "pending -> signing" pega o registro
const claim = () => q(`UPDATE warranty_signatures SET status = 'signing' WHERE token_hash = 'hash-a1' AND status = 'pending' RETURNING id`);
check('primeira confirmação trava o registro', (await claim()).length === 1);
check('segunda confirmação não pega o registro', (await claim()).length === 0);
check('confirmado sem PDF/rubrica/data: recusado pelo banco', await fails(() => q(`UPDATE warranty_signatures SET status = 'signed' WHERE id = $1`, [rowA])));
await q(`UPDATE warranty_signatures SET status = 'signed', signed_at = now(), signature_path = 'r.png', signed_pdf_path = $2, signed_pdf_sha256 = 'h' WHERE id = $1`,
  [rowA, `${A}/sale-A-1/comprovante-assinado-1.pdf`]);
check('confirmado gravado', (await q(`SELECT status FROM warranty_signatures WHERE id = $1`, [rowA]))[0].status === 'signed');

// ---- registro histórico: nem a chave de serviço altera ou exclui
check('confirmado não pode ser alterado (nem pela função)', await fails(() => q(`UPDATE warranty_signatures SET signed_pdf_path = 'outro.pdf' WHERE id = $1`, [rowA])));
check('confirmado não volta a aguardar', await fails(() => q(`UPDATE warranty_signatures SET status = 'pending' WHERE id = $1`, [rowA])));
check('confirmado não pode ser excluído', await fails(() => q(`DELETE FROM warranty_signatures WHERE id = $1`, [rowA])));
check('aguardando pode ter o link trocado (reenvio)', (await q(`UPDATE warranty_signatures SET token_hash = 'hash-b2' WHERE sale_id = 'sale-B-1' RETURNING id`)).length === 1);

// ---- arquivos: leitura com as regras das vendas; gravação nunca pela tela
const files = (user: string) => as(db, user, () => q(`SELECT name FROM storage.objects WHERE bucket_id = 'warranty-receipts'`));
check('administrador baixa o PDF da própria loja', (await files(ADMIN)).length === 1 && (await files(ADMIN))[0].name.startsWith(A));
check('vendedor baixa o PDF da própria loja', (await files(SELLER)).length === 1);
check('técnico não baixa', (await files(TECH)).length === 0);
check('outra loja não baixa', (await files(ADMIN_B)).every(f => f.name.startsWith(B)));
check('usuário não grava arquivo no bucket', await fails(() => as(db, ADMIN, () => q(`INSERT INTO storage.objects (bucket_id, name) VALUES ('warranty-receipts', $1)`, [`${A}/x.pdf`]))));
check('usuário não apaga o PDF assinado', await as(db, ADMIN, async () => { try { return (await q(`DELETE FROM storage.objects WHERE bucket_id = 'warranty-receipts' RETURNING id`)).length === 0; } catch { return true; } }));

console.log(`\n${pass} OK, ${failN} falharam`);
if (failN) process.exit(1);
