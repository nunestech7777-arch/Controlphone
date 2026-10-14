// Todas as migrations aplicam do zero e as que prometem "pode ser rodada mais de uma vez"
// (19 e 20) rodam de novo sem erro e sem perder dados.
import fs from 'node:fs';
import { boot } from './banco-local';

const db = await boot();
let fail = 0;
const T = '11111111-1111-1111-1111-111111111111';
await db.exec(`INSERT INTO tenants (id, name, trade_name, email, phone) VALUES ('${T}', 'A', 'A', 'a@a', '1');
  INSERT INTO tenant_settings (tenant_id, wholesale) VALUES ('${T}', true);
  INSERT INTO wholesale_products (tenant_id, name) VALUES ('${T}', 'Cabo');`);
await db.query(`select backup_run_due(5)`);
for (const file of ['19_wholesale_module.sql', '20_tenant_backups.sql']) {
  try {
    await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
    console.log(`OK   ${file} roda pela segunda vez`);
  } catch (e: any) { fail++; console.log(`FALHOU ${file} pela segunda vez — ${e.message}`); }
}
const kept = (await db.query(`select (select count(*) from wholesale_products)::int p, (select count(*) from tenant_backups)::int b,
  (select wholesale from tenant_settings where tenant_id = '${T}') w`)).rows[0] as any;
const ok = kept.p === 1 && kept.b === 1 && kept.w === true;
if (!ok) fail++;
console.log(`${ok ? 'OK  ' : 'FALHOU'} rodar de novo não apaga dados nem desliga módulo — ${JSON.stringify(kept)}`);
const conf = (await db.query(`SELECT count(*)::int n FROM pg_policies WHERE tablename LIKE 'wholesale\\_%'`)).rows[0] as any;
console.log(`${conf.n === 12 ? 'OK  ' : 'FALHOU'} 12 regras do Atacado (conferência da migration 19) — ${conf.n}`);
if (conf.n !== 12) fail++;
process.exit(fail ? 1 : 0);
