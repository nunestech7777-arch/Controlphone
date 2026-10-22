// Origem do cliente e da venda: orgânico x anúncio pago (migration 23). Grava a origem do cliente no
// banco, as vendas chegam a outro aparelho com a origem exata e o relatório separa cada origem.
// Uso: sh scripts/qa/rodar.sh banco-origens   (precisa da migration 23)
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { salesByOrigin, isPaidOrigin } from '../../src/lib/salesOrigins';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';
import { vistoriaCompleta } from './vistoria';
import { Device } from '../../src/types';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${!ok && extra ? ' — ' + extra : ''}`); };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const ce = console.error; const errors: string[] = []; console.error = (...a: unknown[]) => { errors.push(a.join(' ')); };
const errs = () => [...new Set(errors)].slice(-3).join(' | ');
const STARTED_AT = new Date().toISOString();
const TAG = 'QA' + String(Date.now()).slice(-6);

let T = '';
const enter = async (email: string) => {
  await wait(1500);
  if (T) { localStorage.removeItem(`controlphone_state_v1_real_${T}`); localStorage.removeItem(`controlphone_numbers_v1_${T}`); }
  await supabase.auth.signOut({ scope: 'local' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const r = await loadRealIdentity(data.user!.id);
  if (!r.ok) throw new Error(r.error);
  store.enterRealMode(r.identity);
  const me = store.profiles.find(p => p.id === data.user!.id)!;
  T = me.tenant_id!;
  const ok = await syncTenantRecords(T, me.role);
  return { me, ok };
};
const flush = async () => { await wait(200); return store.pushUnsynced(); };
const now = new Date().toISOString();

check('origem paga só com "Ads": WhatsApp é orgânico, WhatsApp Ads é anúncio', !isPaidOrigin('WhatsApp') && isPaidOrigin('WhatsApp Ads') && isPaidOrigin('Instagram Ads') && !isPaidOrigin('Instagram'));

// ---- admin: cliente com origem e aparelhos para as vendas
let { me, ok } = await enter(ADMIN_EMAIL);
const ADMIN_ID = me.id;
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000', origin: 'Instagram Ads' } }).data!;
const devices: Device[] = [1, 2, 3, 4, 5, 6].map(n => {
  const dev: Device = { id: crypto.randomUUID(), tenant_id: T, imei: '6' + String(Date.now()).slice(-13) + n, brand: 'Apple', model: `${TAG} iPhone ${n}`, storage_capacity: '128GB', color: 'Azul', device_type: 'seminovo', origin: 'purchase', acquisition_cost: 1000, accumulated_repair_cost: 0, suggested_price: 2000, status: 'available', entry_date: now, created_at: now };
  store.devices.unshift(dev);
  return dev;
});
store.saveToStorage();
check('admin cadastra cliente com origem e aparelhos de teste', ok && await flush() && !store.hasUnsynced, errs());
const dbCust = (await supabase.from('customers').select('origin').eq('id', cust.id).maybeSingle()).data;
check('banco: origem do cliente gravada ("Instagram Ads")', dbCust?.origin === 'Instagram Ads', JSON.stringify(dbCust));
let r = await supabase.from('customers').update({ origin: 'instagram pago' }).eq('id', cust.id).select('id');
check('banco: só aceita as origens da lista', Boolean(r.error), 'aceitou origem fora da lista');

// ---- vendedor, outro aparelho: vê a origem do cliente e vende com origens diferentes
({ me, ok } = await enter(SELLER_EMAIL));
check('vendedor recebe a origem do cliente', ok && store.customers.find(c => c.id === cust.id)?.origin === 'Instagram Ads', errs());
const plan: [string, number][] = [['Instagram', 2000], ['Instagram Ads', 2500], ['Instagram Ads', 3000], ['WhatsApp', 2200], ['WhatsApp Ads', 2400], ['Passou em frente à loja', 1800]];
const saleIds = plan.map(([origin, price], i) => store.finalizeSale({
  tenantId: T, sellerId: me.id, customerId: cust.id, salesOrigin: origin, subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0,
  items: [{ itemType: 'device', deviceId: devices[i].id, quantity: 1, unitCost: 0, unitPrice: price, discount: 0, totalPrice: 0, inspection: vistoriaCompleta() }],
  payments: [{ paymentMethod: 'pix', amount: price, installments: 1 }], gifts: []
}).id);
check('vendas enviadas ao banco', await flush() && !store.hasUnsynced, errs());

// ---- admin, outro aparelho: relatório por origem
({ me, ok } = await enter(ADMIN_EMAIL));
const mine = store.sales.filter(s => saleIds.includes(s.id));
check('admin recebe as 6 vendas com a origem exata de cada uma', ok && mine.length === 6 && plan.every(([origin], i) => mine.find(s => s.id === saleIds[i])?.sales_origin === origin), JSON.stringify(mine.map(s => s.sales_origin)));
const report = salesByOrigin(mine);
const row = (origin: string) => report.find(x => x.origin === origin);
check('relatório: Instagram Ads com 2 vendas e R$ 5.500,00, separado de Instagram (1 venda, R$ 2.000,00)',
  row('Instagram Ads')?.count === 2 && row('Instagram Ads')?.revenue === 5500 && row('Instagram')?.count === 1 && row('Instagram')?.revenue === 2000, JSON.stringify(report));
check('relatório: WhatsApp e WhatsApp Ads em linhas separadas, cada uma com sua venda',
  row('WhatsApp')?.count === 1 && row('WhatsApp')?.revenue === 2200 && row('WhatsApp Ads')?.count === 1 && row('WhatsApp Ads')?.revenue === 2400);
check('relatório: origem antiga ("Passou em frente à loja") preservada como está, sem conversão', row('Passou em frente à loja')?.count === 1 && !row('Loja física'));
check('relatório: anúncio pago identificado só nas origens com "Ads"', report.filter(x => x.paid).map(x => x.origin).sort().join() === 'Instagram Ads,WhatsApp Ads');
check('relatório: total de vendas igual à soma das linhas', report.reduce((n, x) => n + x.count, 0) === 6);

// ---- limpeza
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...devices.map(d => d.id), cust.id, TAG]);
const delDev = await supabase.from('devices').delete().in('id', devices.map(d => d.id)).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
check('limpeza: vendas, garantias, movimentações, 6 aparelhos e 1 cliente de teste apagados',
  docs.deleted === docs.found && delDev.data?.length === 6 && delCust.data?.length === 1, `documentos ${docs.deleted}/${docs.found}, aparelhos ${delDev.data?.length}, cliente ${delCust.data?.length}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
