import { boot, as } from './banco-local';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { belongsToTenant, buildBackupFile, readBackupFile, countBackup, backupFileName, backupHealth, BackupFileError } from '../../src/lib/backupFormat';
const db = await boot(20);
const q = async (sql: string, p?: any[]): Promise<any[]> => (await db.query(sql, p)).rows;
let pass = 0, fail = 0;
const check = (id: string, desc: string, ok: boolean, extra: any = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'OK  ' : 'FALHOU'} [${id}] ${desc}${extra ? ' — ' + extra : ''}`); };
const rejects = async (fn: () => Promise<any>): Promise<string | null> => { try { await fn(); return null; } catch (e: any) { return e.message; } };

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const SUPER = 'aaaaaaaa-0000-0000-0000-000000000001', ADM_A = 'aaaaaaaa-0000-0000-0000-00000000000a', SEL_A = 'aaaaaaaa-0000-0000-0000-00000000000b', ADM_B = 'aaaaaaaa-0000-0000-0000-00000000000c';

await db.exec(`
  INSERT INTO tenants (id, name, trade_name, email, phone, status, plan) VALUES
    ('${A}', 'Loja A LTDA', 'Loja A', 'a@a.com', '11', 'active', 'starter'), ('${B}', 'Loja B LTDA', 'Loja B', 'b@b.com', '22', 'active', 'starter');
  INSERT INTO profiles (id, tenant_id, role, full_name, email) VALUES
    ('${SUPER}', NULL, 'super_admin', 'Super', 's@s.com'), ('${ADM_A}', '${A}', 'admin', 'Admin A', 'adm@a.com'),
    ('${SEL_A}', '${A}', 'seller', 'Vendedor A', 'sel@a.com'), ('${ADM_B}', '${B}', 'admin', 'Admin B', 'adm@b.com');
  INSERT INTO tenant_themes (tenant_id, display_name, primary_color, secondary_color, logo_url) VALUES ('${A}', 'Loja A', '#111111', '#222222', 'data:image/png;base64,AAAA'), ('${B}', 'Loja B', '#333333', '#444444', NULL);
  INSERT INTO tenant_settings (tenant_id, wholesale, gifts) VALUES ('${A}', true, false), ('${B}', true, true);
  INSERT INTO tenant_internal_notes (tenant_id, notes) VALUES ('${A}', 'nota A');
  INSERT INTO suppliers (id, tenant_id, name, phone) VALUES ('5a000000-0000-0000-0000-000000000001', '${A}', 'Forn A', '1'), ('5b000000-0000-0000-0000-000000000001', '${B}', 'Forn B', '2');
  INSERT INTO customers (id, tenant_id, name, phone) VALUES
    ('ca000000-0000-0000-0000-000000000001', '${A}', 'Cliente A1', '1'), ('ca000000-0000-0000-0000-000000000002', '${A}', 'Cliente A2', '2'),
    ('cb000000-0000-0000-0000-000000000001', '${B}', 'Cliente B1', '3');
  INSERT INTO devices (id, tenant_id, imei, brand, model, storage_capacity, color, supplier_id) VALUES
    ('da000000-0000-0000-0000-000000000001', '${A}', '111', 'Apple', 'iPhone 13', '128', 'Azul', '5a000000-0000-0000-0000-000000000001'),
    ('da000000-0000-0000-0000-000000000002', '${A}', '112', 'Apple', 'iPhone 14', '128', 'Preto', NULL),
    ('db000000-0000-0000-0000-000000000001', '${B}', '111', 'Apple', 'iPhone 13', '128', 'Azul', NULL);
  INSERT INTO accessories (id, tenant_id, name, category, quantity) VALUES ('ac000000-0000-0000-0000-000000000001', '${A}', 'Capa', 'Capas', 10);
  -- tabelas antigas com a referência circular vendas <-> upgrades
  INSERT INTO sales (id, tenant_id, seller_id, customer_id, sales_origin) VALUES ('5e000000-0000-0000-0000-000000000001', '${A}', '${SEL_A}', 'ca000000-0000-0000-0000-000000000001', 'Loja');
  INSERT INTO trade_ins (id, tenant_id, customer_id, seller_id, sold_device_id, received_device_id, appraisal_value, sold_device_price, difference_amount, payment_method, sale_id)
    VALUES ('7e000000-0000-0000-0000-000000000001', '${A}', 'ca000000-0000-0000-0000-000000000001', '${SEL_A}', 'da000000-0000-0000-0000-000000000001', 'da000000-0000-0000-0000-000000000002', 100, 200, 100, 'pix', '5e000000-0000-0000-0000-000000000001');
  UPDATE sales SET trade_in_id = '7e000000-0000-0000-0000-000000000001' WHERE id = '5e000000-0000-0000-0000-000000000001';
  INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES
    ('${A}', 'sales', 'sale-1', '{"sale_number":"1001","total":500}'), ('${A}', 'sales', 'sale-2', '{"sale_number":"1002","total":900}'),
    ('${A}', 'serviceOrders', 'os-1', '{"os_number":"501"}'), ('${A}', 'warranties', 'w-1', '{}'), ('${A}', 'expenses', 'e-1', '{"amount":50}'),
    ('${A}', 'auditLogs', 'log-1', '{"action":"X","user_id":"${ADM_A}"}'),
    ('${B}', 'sales', 'sale-1', '{"sale_number":"1001","total":777}');
  INSERT INTO wholesale_customers (id, tenant_id, name) VALUES ('fc000000-0000-0000-0000-000000000001', '${A}', 'Atacado A');
  INSERT INTO wholesale_products (id, tenant_id, name, quantity, cost_price, sale_price) VALUES ('fd000000-0000-0000-0000-000000000001', '${A}', 'Cabo', 100, 10, 25);
  INSERT INTO audit_logs (id, tenant_id, user_id, action, module) VALUES ('a0000000-0000-0000-0000-000000000001', '${A}', '${SUPER}', 'LOJA_CRIADA', 'Super Admin');
`);

// estado da loja inteira, para comparar antes/depois (sem colunas de data de gravação)
const state = async (tenant: string) => {
  const order = (await q(`select backup_table_order() o`))[0].o;
  const out: any = {};
  for (const t of order) {
    const rows = await q(`select to_jsonb(x) - 'updated_at' - 'updated_by' as r from public."${t}" x where tenant_id = $1 ${t === 'tenant_records' ? "and kind <> 'auditLogs'" : ''} order by 1`, [tenant]);
    if (rows.length) out[t] = rows.map(r => r.r);
  }
  out.tenants = (await q(`select to_jsonb(x) - 'updated_at' as r from tenants x where id = $1`, [tenant]))[0].r;
  out.profiles = (await q(`select to_jsonb(x) - 'updated_at' as r from profiles x where tenant_id = $1 order by id`, [tenant])).map(r => r.r);
  return JSON.stringify(out);
};
const beforeA = await state(A), beforeB = await state(B);

// ---- Permissões
let e = await rejects(() => as(db, ADM_A, () => q(`select create_tenant_backup($1)`, [A])));
check('P1', 'administrador da loja não cria backup', !!e && /Super Administrador/.test(e), e);
e = await rejects(() => as(db, null, () => q(`select create_tenant_backup($1)`, [A])));
check('P2', 'sem login não cria backup', !!e);
e = await rejects(() => as(db, SUPER, () => q(`select backup_perform($1, 'manual')`, [A])));
check('P3', 'função interna não é chamável pela API', !!e && /permission denied/.test(e), e);
e = await rejects(() => as(db, SUPER, () => q(`select * from tenant_backup_payloads`)));
check('P4', 'conteúdo do backup não é legível direto pela API', !!e && /permission denied/.test(e), e);

// ---- Criar
const id1 = (await as(db, SUPER, () => q(`select create_tenant_backup($1) id`, [A])))[0].id;
const row = (await q(`select * from tenant_backups where id = $1`, [id1]))[0];
check('C1', 'backup manual criado e completo', row.type === 'manual' && row.status === 'completed' && Number(row.size_bytes) > 0 && row.created_by_name === 'Super');
check('C2', 'resumo confere', JSON.stringify(row.counts) === JSON.stringify({ sales: 3, users: 2, products: 3, customers: 2, financial: 1, warranties: 1, service_orders: 1 }), JSON.stringify(row.counts));
const payload = (await as(db, SUPER, () => q(`select get_tenant_backup($1) p`, [id1])))[0].p;
const text = JSON.stringify(payload);
check('C3', 'backup não contém nada da outra loja', !text.includes(B) && !text.includes('Cliente B1') && !text.includes('Forn B') && !text.includes('Admin B'));
check('C4', 'contém identidade visual (logo), módulos, observações e Atacado',
  payload.tables.tenant_themes[0].logo_url.startsWith('data:image') && payload.tables.tenant_settings[0].wholesale === true
  && payload.tables.tenant_internal_notes[0].notes === 'nota A' && payload.tables.wholesale_products.length === 1);
check('C5', 'não contém o super admin nem os próprios backups', !text.includes(SUPER.slice(0, 0) + 's@s.com') && !('tenant_backups' in payload.tables));
e = await rejects(() => as(db, ADM_A, () => q(`select get_tenant_backup($1)`, [id1])));
check('C6', 'administrador da loja não baixa', !!e);
const seen = await as(db, ADM_A, () => q(`select * from tenant_backups`));
check('C7', 'administrador da loja não lista o histórico', seen.length === 0);
const last = (await as(db, ADM_A, () => q(`select my_tenant_last_backup() d`)))[0].d;
const lastSeller = (await as(db, SEL_A, () => q(`select my_tenant_last_backup() d`)))[0].d;
const lastB = (await as(db, ADM_B, () => q(`select my_tenant_last_backup() d`)))[0].d;
check('C8', 'administrador vê só a data do último backup da própria loja', !!last && lastSeller === null && lastB === null);

// ---- Estraga a loja A (e mexe na B, que não pode voltar atrás)
await db.exec(`
  UPDATE sales SET trade_in_id = NULL WHERE tenant_id = '${A}';
  DELETE FROM trade_ins WHERE tenant_id = '${A}'; DELETE FROM sales WHERE tenant_id = '${A}';
  DELETE FROM devices WHERE id = 'da000000-0000-0000-0000-000000000002';
  UPDATE customers SET name = 'ALTERADO' WHERE tenant_id = '${A}';
  INSERT INTO customers (id, tenant_id, name, phone) VALUES ('ca000000-0000-0000-0000-000000000099', '${A}', 'Criado depois', '9');
  DELETE FROM tenant_records WHERE tenant_id = '${A}' AND kind = 'sales' AND id = 'sale-2';
  INSERT INTO tenant_records (tenant_id, kind, id, data) VALUES ('${A}', 'sales', 'sale-9', '{"sale_number":"1009"}'), ('${A}', 'auditLogs', 'log-depois', '{"action":"DEPOIS","user_id":"${ADM_A}"}');
  UPDATE tenant_themes SET logo_url = NULL, primary_color = '#999999' WHERE tenant_id = '${A}';
  UPDATE tenant_settings SET wholesale = false, gifts = true WHERE tenant_id = '${A}';
  UPDATE wholesale_products SET quantity = 1 WHERE tenant_id = '${A}';
  UPDATE profiles SET full_name = 'Nome Trocado', role = 'technician', is_active = false WHERE id = '${SEL_A}';
  UPDATE tenants SET trade_name = 'Nome Novo', status = 'suspended', plan = 'enterprise' WHERE id = '${A}';
  UPDATE customers SET name = 'B alterado depois do backup' WHERE tenant_id = '${B}';
`);
const midB = await state(B);

// ---- Restauração bloqueada
e = await rejects(() => as(db, ADM_A, () => q(`select restore_tenant_backup($1, $2)`, [A, id1])));
check('R1', 'administrador da loja não restaura', !!e && /Super Administrador/.test(e));
e = await rejects(() => as(db, SUPER, () => q(`select restore_tenant_backup($1, NULL, $2::jsonb)`, [B, JSON.stringify(payload)])));
check('R2', 'backup de outra loja é bloqueado', !!e && /pertence a outra loja/.test(e), e);
e = await rejects(() => as(db, SUPER, () => q(`select restore_tenant_backup($1, $2)`, [B, id1])));
check('R3', 'backup guardado de outra loja também é bloqueado', !!e && /pertence a outra loja/.test(e));
for (const [name, bad] of [['sem formato', { tables: {}, tenant_id: A }], ['texto solto', 'oi'], ['versão futura', { ...payload, version: 2 }], ['sem tabelas', { format: 'controlphone-backup', version: 1, tenant_id: A }]]) {
  e = await rejects(() => as(db, SUPER, () => q(`select restore_tenant_backup($1, NULL, $2::jsonb)`, [A, JSON.stringify(bad)])));
  check('R4', `arquivo inválido é recusado (${name})`, !!e, e);
}
check('R5', 'recusas não alteraram nada', (await state(B)) === midB && (await q(`select count(*)::int n from tenant_backups`))[0].n === 1);

// ---- Restaura do servidor
const res = (await as(db, SUPER, () => q(`select restore_tenant_backup($1, $2) r`, [A, id1])))[0].r;
const afterA = await state(A);
const expected = JSON.parse(beforeA); const got = JSON.parse(afterA);
// situação e plano da loja são da plataforma: ficam como estavam na hora da restauração
check('R6', 'situação e plano da loja NÃO voltam', got.tenants.status === 'suspended' && got.tenants.plan === 'enterprise');
expected.tenants.status = 'suspended'; expected.tenants.plan = 'enterprise';
check('R7', 'loja A voltou exatamente ao estado do backup', JSON.stringify(expected) === JSON.stringify(got),
  Object.keys(expected).filter(k => JSON.stringify(expected[k]) !== JSON.stringify(got[k])).join(','));
check('R8', 'referência circular vendas <-> upgrades restaurada', (await q(`select trade_in_id from sales where tenant_id = $1`, [A]))[0].trade_in_id === '7e000000-0000-0000-0000-000000000001');
check('R9', 'loja B intacta', (await state(B)) === midB);
const logs = await q(`select id, data->>'action' a from tenant_records where tenant_id = $1 and kind = 'auditLogs' order by 2`, [A]);
const actions = logs.map(l => l.a);
check('R10', 'histórico nunca é apagado e registra tudo', ['X', 'DEPOIS', 'BACKUP_CRIADO', 'BACKUP_BAIXADO', 'BACKUP_DE_SEGURANCA', 'BACKUP_RESTAURADO'].every(a => actions.includes(a)), actions.join(','));
const restoreLog = (await q(`select data from tenant_records where tenant_id = $1 and kind='auditLogs' and data->>'action'='BACKUP_RESTAURADO'`, [A]))[0].data;
check('R11', 'registro da restauração: quem, qual backup, quando', restoreLog.user_id === SUPER && restoreLog.details.backup_utilizado === id1 && restoreLog.details.responsavel === 'Super' && !!restoreLog.created_at, JSON.stringify(restoreLog.details));
const safety = (await q(`select * from tenant_backups where id = $1`, [res.safety_backup_id]))[0];
check('R12', 'backup de segurança do estado anterior foi guardado', safety.type === 'pre_restore' && safety.tenant_id === A);

// ---- Desfaz a restauração usando o backup de segurança
await as(db, SUPER, () => q(`select restore_tenant_backup($1, $2)`, [A, res.safety_backup_id]));
check('R13', 'restauração pode ser desfeita pelo backup de segurança',
  (await q(`select name from customers where id='ca000000-0000-0000-0000-000000000099'`))[0]?.name === 'Criado depois'
  && (await q(`select full_name from profiles where id=$1`, [SEL_A]))[0].full_name === 'Nome Trocado'
  && (await q(`select count(*)::int n from sales where tenant_id=$1`, [A]))[0].n === 0);

// ---- Restaura de ARQUIVO adulterado: linhas apontando para a loja B
const forged = JSON.parse(JSON.stringify(payload));
forged.tables.customers.push({ ...forged.tables.customers[0], id: 'ca000000-0000-0000-0000-0000000000ff', tenant_id: B, name: 'INJETADO' });
forged.tables.profiles.push({ id: ADM_B, tenant_id: B, role: 'super_admin', full_name: 'HACK', email: 'x@x.com', is_active: true });
forged.tables.profiles[0].role = 'super_admin';
forged.tables.tenant_backups = [{ id: id1, tenant_id: B }];
await as(db, SUPER, () => q(`select restore_tenant_backup($1, NULL, $2::jsonb)`, [A, JSON.stringify(forged)]));
const inj = (await q(`select tenant_id from customers where id='ca000000-0000-0000-0000-0000000000ff'`))[0];
check('S1', 'linha com tenant_id de outra loja é gravada na loja restaurada, não na outra', inj.tenant_id === A && (await state(B)) === midB);
const roles = await q(`select id, role, full_name from profiles order by id`);
check('S2', 'arquivo não cria super admin nem mexe em usuário de outra loja',
  roles.filter(r => r.role === 'super_admin').length === 1 && roles.find(r => r.id === ADM_B).full_name === 'Admin B' && roles.find(r => r.id === ADM_A).role === 'admin');
check('S3', 'tabela fora da lista (backups) é ignorada', (await q(`select tenant_id from tenant_backups where id=$1`, [id1]))[0].tenant_id === A);

// arquivo que colide com id de outra loja: tudo é desfeito
const clash = JSON.parse(JSON.stringify(payload));
clash.tables.customers.push({ ...clash.tables.customers[0], id: 'cb000000-0000-0000-0000-000000000001', name: 'ROUBO' });
const preClash = await state(A);
e = await rejects(() => as(db, SUPER, () => q(`select restore_tenant_backup($1, NULL, $2::jsonb)`, [A, JSON.stringify(clash)])));
check('S4', 'arquivo que tenta sobrescrever registro de outra loja falha e nada muda', !!e && (await state(A)) === preClash && (await state(B)) === midB, e);

// ---- Arquivo .controlphone (o que o Super Admin baixa e depois envia para restaurar)
const sorted = (o: any) => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const file = await buildBackupFile(payload);
check('F1', 'nome do arquivo: NomeDaLoja_AAAA-MM-DD_HH-MM.controlphone', /^LojaA_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.controlphone$/.test(file.name), file.name);
check('F1', 'nome sem acentos nem símbolos', /^AcaiCelularesCia_/.test(backupFileName('Açaí Celulares & Cia.', payload.created_at)), backupFileName('Açaí Celulares & Cia.', payload.created_at));
const zipped = unzipSync(file.bytes);
check('F2', 'arquivo compactado com manifesto e dados', Object.keys(zipped).sort().join() === 'dados.json,manifesto.json' && file.bytes.length < JSON.stringify(payload).length);
const parsed = await readBackupFile(file.bytes);
check('F3', 'arquivo lido devolve exatamente o conteúdo do servidor', JSON.stringify(parsed.payload) === JSON.stringify(payload));
check('F4', 'resumo calculado no aplicativo é igual ao do servidor', sorted(countBackup(parsed.payload)) === sorted(row.counts) && sorted(parsed.manifest.counts) === sorted(row.counts), JSON.stringify(parsed.manifest.counts));
check('F5', 'reconhece de qual loja é', belongsToTenant(parsed.payload, A) && !belongsToTenant(parsed.payload, B) && parsed.manifest.tenant_name === 'Loja A');
const readFails = async (bytes: Uint8Array) => { try { await readBackupFile(bytes); return ''; } catch (err: any) { return err instanceof BackupFileError ? err.message : 'ERRO INESPERADO: ' + err.message; } };
const cut = file.bytes.slice(0, Math.floor(file.bytes.length / 2));
check('F6', 'arquivo cortado é recusado', /Controlphone|corrompido/.test(await readFails(cut)), await readFails(cut));
check('F6', 'arquivo que não é backup é recusado', /não é um backup/.test(await readFails(strToU8('isto não é um backup'))));
check('F6', 'zip qualquer é recusado', /não é um backup/.test(await readFails(zipSync({ 'foto.txt': strToU8('oi') }))));
const edited = JSON.parse(JSON.stringify(payload)); edited.tables.customers[0].name = 'Editado na mão';
const tampered = zipSync({ 'manifesto.json': zipped['manifesto.json'], 'dados.json': strToU8(JSON.stringify(edited)) });
check('F7', 'conteúdo alterado depois de gerado é detectado', /alterado ou está corrompido/.test(await readFails(tampered)), await readFails(tampered));
const swapped = JSON.parse(JSON.stringify(payload)); swapped.tenant_id = B;
const otherStore = await buildBackupFile(swapped);
check('F8', 'arquivo de outra loja: o aplicativo bloqueia antes de enviar', !belongsToTenant((await readBackupFile(otherStore.bytes)).payload, A));
e = await rejects(() => as(db, SUPER, () => q(`select restore_tenant_backup($1, NULL, $2::jsonb)`, [A, JSON.stringify(swapped)])));
check('F8', '…e o servidor bloqueia mesmo que o aplicativo fosse burlado', !!e && /pertence a outra loja/.test(e));
await as(db, SUPER, () => q(`select restore_tenant_backup($1, NULL, $2::jsonb)`, [A, JSON.stringify(parsed.payload)]));
check('F9', 'restaurar a partir do arquivo devolve a loja ao estado do backup', (await state(A)) === JSON.stringify(expected) && (await state(B)) === midB);
const fileLog = (await q(`select data from tenant_records where tenant_id = $1 and kind='auditLogs' and data->>'action'='BACKUP_RESTAURADO' order by updated_at desc limit 1`, [A]))[0].data;
check('F10', 'restauração por arquivo fica registrada com a origem', fileLog.details.origem === 'arquivo' && fileLog.details.backup_utilizado === id1);

// ---- Indicador "Status do Backup"
const now = new Date('2026-10-13T12:00:00Z');
const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
check('H1', 'há 2 dias = Atualizado', backupHealth(ago(2), now).label === 'Atualizado' && backupHealth(ago(2), now).text === 'Backup realizado há 2 dias', backupHealth(ago(2), now).text);
check('H2', 'há 11 dias = Atenção', backupHealth(ago(11), now).label === 'Atenção' && backupHealth(ago(11), now).text === 'Último backup há 11 dias');
check('H3', 'nenhum = Sem Backup', backupHealth(null, now).label === 'Sem Backup' && backupHealth(undefined, now).text === 'Nenhum backup encontrado');
check('H4', 'limite: 5 dias ainda em dia, 6 já pede atenção', backupHealth(ago(5), now).health === 'updated' && backupHealth(ago(6), now).health === 'attention');

// ---- Excluir
e = await rejects(() => as(db, ADM_A, () => q(`select delete_tenant_backup($1)`, [id1])));
check('D1', 'administrador da loja não exclui', !!e);
await as(db, SUPER, () => q(`select delete_tenant_backup($1)`, [id1]));
check('D2', 'excluir remove ficha e conteúdo', (await q(`select count(*)::int n from tenant_backups where id=$1`, [id1]))[0].n === 0 && (await q(`select count(*)::int n from tenant_backup_payloads where backup_id=$1`, [id1]))[0].n === 0);

// ---- Automático
e = await rejects(() => as(db, SUPER, () => q(`select backup_run_due(10)`)));
check('A1', 'rotina automática não é chamável direto pela API', !!e);
let n = (await q(`select backup_run_due(10) n`))[0].n;
check('A2', 'primeira rodada faz backup das 2 lojas', n === 2);
n = (await q(`select backup_run_due(10) n`))[0].n;
check('A3', 'rodada seguinte não repete (menos de 4 dias)', n === 0);
await db.exec(`UPDATE tenant_backups SET created_at = now() - interval '5 days' WHERE type='automatic' AND tenant_id='${A}'`);
n = (await as(db, SUPER, () => q(`select run_due_tenant_backups() n`)))[0].n;
check('A4', 'depois de 4 dias a loja atrasada recebe novo backup', n === 1);
const sys = await q(`select created_by, created_by_name from tenant_backups where type='automatic'`);
const sysLogs = await q(`select data from tenant_records where kind='auditLogs' and data->>'action'='BACKUP_AUTOMATICO'`);
check('A5', 'automático fica em nome do sistema, mesmo quando o painel do Super Admin dispara', sys.length === 3
  && sys.every(b => b.created_by === null && b.created_by_name === 'Sistema (automático)')
  && sysLogs.length === 3 && sysLogs.every(l => l.data.user_role === 'system' && l.data.details.responsavel === 'Sistema (automático)'));

// retenção: 35 automáticos antigos + manuais antigos
await db.exec(`
  INSERT INTO tenant_backups (tenant_id, type, status, created_at) SELECT '${A}', 'automatic', 'completed', now() - (g || ' days')::interval FROM generate_series(10, 44) g;
  INSERT INTO tenant_backups (tenant_id, type, status, created_at) SELECT '${A}', 'manual', 'completed', now() - (g || ' days')::interval FROM generate_series(100, 139) g;
  UPDATE tenant_backups SET created_at = now() - interval '5 days' WHERE type='automatic' AND tenant_id='${A}' AND created_at > now() - interval '4 days';
`);
await q(`select backup_run_due(10)`);
const kept = (await q(`select type, count(*)::int n, min(created_at) oldest from tenant_backups where tenant_id=$1 and status='completed' group by 1`, [A]));
const auto = kept.find(k => k.type === 'automatic'), man = kept.find(k => k.type === 'manual');
check('A6', 'ficam só os 30 automáticos mais recentes', auto.n === 30, String(auto.n));
check('A7', 'manuais nunca são apagados automaticamente', man.n === 40, String(man.n));
const ov = await as(db, SUPER, () => q(`select * from tenant_backup_overview() order by tenant_id`));
check('O1', 'indicador por loja traz o último backup de cada uma', ov.length === 2 && ov[0].tenant_id === A && ov[0].last_type === 'automatic');
e = await rejects(() => as(db, ADM_A, () => q(`select * from tenant_backup_overview()`)));
check('O2', 'indicador geral é só do super admin', !!e);

// loja com erro não trava as outras
await db.exec(`UPDATE tenant_backups SET created_at = now() - interval '9 days' WHERE type='automatic';
  CREATE OR REPLACE FUNCTION backup_counts(p_payload JSONB) RETURNS JSONB AS $$ BEGIN IF p_payload->>'tenant_id' = '${A}' THEN RAISE EXCEPTION 'falha simulada'; END IF; RETURN '{}'::jsonb; END $$ LANGUAGE plpgsql;`);
n = (await q(`select backup_run_due(10) n`))[0].n;
const failed = await q(`select tenant_id, error from tenant_backups where status='failed'`);
check('A8', 'loja com erro fica registrada como falha e a outra é feita', n === 1 && failed.length === 1 && failed[0].tenant_id === A && /falha simulada/.test(failed[0].error));
n = (await q(`select backup_run_due(10) n`))[0].n;
check('A9', 'loja que falhou não é tentada de novo em seguida', n === 0);

console.log(`\n${pass} ok, ${fail} falharam`);
process.exit(fail ? 1 : 0);
