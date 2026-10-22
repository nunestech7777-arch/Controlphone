// Juros da maquininha no cartão de crédito: entram no faturamento, ficam fora do lucro dos produtos.
// Venda do exemplo (R$ 8.000 + R$ 200 de juros, custo R$ 6.500), pagamento misto (Pix + crédito com
// juros), comprovante, resumo do período, cancelamento e devolução.
// Uso: sh scripts/qa/rodar.sh banco-juros
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { periodFinance, saleInterest, saleRevenue } from '../../src/lib/saleFinance';
import { getSaleContext, SALE_DOCUMENTS } from '../../src/lib/pdf/saleDocuments';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';
import { vistoriaCompleta } from './vistoria';
import { Device, DeviceType, Sale } from '../../src/types';

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
const attempt = <R,>(fn: () => R): { ok: true; v: R } | { ok: false; e: string } => {
  try { return { ok: true, v: fn() }; } catch (e) { return { ok: false, e: (e as Error).message }; }
};
const now = new Date().toISOString();
const created: string[] = [];
const addDevice = (n: number, type: DeviceType, cost: number, price: number) => {
  const dev: Device = { id: crypto.randomUUID(), tenant_id: T, imei: '4' + String(Date.now()).slice(-13) + n, brand: 'Apple', model: `${TAG} iPhone ${n}`, storage_capacity: '256GB', color: 'Preto', device_type: type, origin: 'purchase', acquisition_cost: cost, accumulated_repair_cost: 0, suggested_price: price, status: 'available', entry_date: now, created_at: now };
  store.devices.unshift(dev);
  created.push(dev.id);
  return dev;
};
const pdfText = (sale: Sale, docId: string) => {
  const ctx = getSaleContext(sale, store.tenants.find(t => t.id === T)!, store.themes[T]);
  const raw = Buffer.from(SALE_DOCUMENTS.find(d => d.id === docId)!.build(ctx).doc.output('arraybuffer')).toString('latin1');
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(m => m[1]).join(' ').replace(/\s+/g, ' ');
};
const cents = (v: number) => Math.round(v * 100);

// ---- preparação
let { me, ok } = await enter(ADMIN_EMAIL);
const ADMIN_ID = me.id;
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000' } }).data!;
const devA = addDevice(1, 'seminovo', 6500, 8000);
const devB = addDevice(2, 'lacrado', 6000, 8000);
const devC = addDevice(3, 'lacrado', 1000, 2000);
store.saveToStorage();
check('aparelhos de teste cadastrados (custo R$ 6.500 e preço R$ 8.000)', ok && await flush() && !store.hasUnsynced, errs());

// ---- vendedor: venda do exemplo
({ me, ok } = await enter(SELLER_EMAIL));
const SELLER_ID = me.id;
const base = { tenantId: T, sellerId: SELLER_ID, customerId: cust.id, salesOrigin: 'Instagram', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0, gifts: [] };
let r = attempt(() => store.finalizeSale({ ...base, items: [{ itemType: 'device', deviceId: devC.id, quantity: 1, unitCost: 1000, unitPrice: 2000, discount: 0, totalPrice: 2000 }],
  payments: [{ paymentMethod: 'pix', amount: 2000, installments: 1, interest: 50 }] }));
check('juros no Pix são recusados', !r.ok && r.e.includes('cartão de crédito'), r.ok ? 'aceitou' : r.e);
r = attempt(() => store.finalizeSale({ ...base, items: [{ itemType: 'device', deviceId: devC.id, quantity: 1, unitCost: 1000, unitPrice: 2000, discount: 0, totalPrice: 2000 }],
  payments: [{ paymentMethod: 'credit_card', amount: 2000, installments: 1, interest: -10 }] }));
check('juros negativos são recusados', !r.ok, r.ok ? 'aceitou' : '');

const sale1 = store.finalizeSale({ ...base,
  items: [{ itemType: 'device', deviceId: devA.id, quantity: 1, unitCost: 6500, unitPrice: 8000, discount: 0, totalPrice: 8000, inspection: vistoriaCompleta() }],
  payments: [{ paymentMethod: 'credit_card', amount: 8000, installments: 1, interest: 200 }] });
check('venda de R$ 8.000 no crédito com R$ 200 de juros concluída', sale1.total_amount === 8000 && saleInterest(sale1) === 200 && saleRevenue(sale1) === 8200);

// pagamento misto: Pix R$ 3.000 + crédito R$ 5.000 com R$ 150 de juros
const sale2 = store.finalizeSale({ ...base,
  items: [{ itemType: 'device', deviceId: devB.id, quantity: 1, unitCost: 6000, unitPrice: 8000, discount: 0, totalPrice: 8000 }],
  payments: [{ paymentMethod: 'pix', amount: 3000, installments: 1 }, { paymentMethod: 'credit_card', amount: 5000, installments: 1, interest: 150 }] });
const pix = sale2.payments!.find(p => p.payment_method === 'pix')!, credit = sale2.payments!.find(p => p.payment_method === 'credit_card')!;
check('pagamento misto: juros só no crédito; pagamentos somam R$ 8.150,00',
  pix.amount === 3000 && !pix.interest && credit.amount === 5150 && credit.interest === 150 && cents(sale2.payments!.reduce((a, p) => a + p.amount, 0)) === 815000 && saleRevenue(sale2) === 8150);
check('vendas enviadas ao banco', await flush() && !store.hasUnsynced, errs());

// ---- admin, outro aparelho: valores lidos do banco
({ me, ok } = await enter(ADMIN_EMAIL));
const s1 = store.sales.find(s => s.id === sale1.id)!, s2 = store.sales.find(s => s.id === sale2.id)!;
check('banco: faturamento R$ 8.200, juros R$ 200 e lucro bruto R$ 1.500 (juros fora do lucro)',
  ok && saleRevenue(s1) === 8200 && saleInterest(s1) === 200 && s1.gross_profit === 1500 && s1.total_cost === 6500, JSON.stringify({ rev: s1 && saleRevenue(s1), gp: s1?.gross_profit }));
check('banco: pagamento no crédito registra R$ 8.200 cobrados, com R$ 200 de juros',
  s1.payments?.length === 1 && s1.payments[0].amount === 8200 && s1.payments[0].interest === 200);
let fin = periodFinance([s1]);
check('resumo do período só com a venda do exemplo: faturamento 8.200, juros 200, lucro bruto 1.500',
  fin.revenue === 8200 && fin.interest === 200 && fin.grossProfit === 1500, JSON.stringify(fin));
fin = periodFinance([s1, s2]);
check('resumo com as duas vendas: faturamento 16.350, juros 350, lucro bruto 3.500 (sem somar juros ao lucro)',
  fin.revenue === 16350 && fin.interest === 350 && fin.grossProfit === 3500, JSON.stringify(fin));

const receipt = pdfText(s1, 'receipt');
check('comprovante: valor dos produtos, juros e VALOR TOTAL PAGO de R$ 8.200,00',
  receipt.includes('Valor dos produtos: R$') && receipt.includes('8.000,00') && receipt.includes('Juros da maquininha: R$') && receipt.includes('200,00') && /VALOR TOTAL PAGO: R\$.?8\.200,00/.test(receipt), receipt.slice(0, 300));
check('comprovante: sem custo nem lucro', !receipt.includes('6.500') && !receipt.includes('1.500,00'));
const sealed = pdfText(s2, 'receipt-sealed');
check('comprovante de lacrado (misto): juros separados e total pago de R$ 8.150,00',
  sealed.includes('Juros da maquininha: R$') && sealed.includes('150,00') && /VALOR TOTAL PAGO: R\$.?8\.150,00/.test(sealed) && sealed.includes('inclui'), sealed.slice(-500));

// ---- cancelamento: a venda sai inteira (com os juros) e o histórico registra
const cancel = store.cancelSale(s2.id, T, ADMIN_ID, 'teste de juros');
await flush();
const completed = store.sales.filter(s => [s1.id, s2.id].includes(s.id) && s.status === 'completed');
fin = periodFinance(completed);
const cancelLog = store.auditLogs.find(l => l.action === 'VENDA_CANCELADA' && l.record_id === s2.id);
check('cancelamento: venda sai do faturamento com os juros e o histórico registra os juros estornados',
  cancel.ok && fin.revenue === 8200 && fin.interest === 200 && cancelLog?.details?.juros_maquininha_estornados === 150, JSON.stringify({ fin, d: cancelLog?.details }));

// ---- devolução com crédito: só os produtos são devolvidos; o tratamento dos juros fica registrado
const req = store.createReturnRequest({ tenantId: T, saleId: s1.id, saleItemId: s1.items![0].id, userId: ADMIN_ID, userRole: 'admin', reason: 'Teste', resolution: 'credit' });
store.updateReturnStatus({ tenantId: T, requestId: req.data!.id, userId: ADMIN_ID, userRole: 'admin', newStatus: 'approved' });
const done = store.completeReturn({ tenantId: T, requestId: req.data!.id, userId: ADMIN_ID, userRole: 'admin', creditAmount: 8000 });
await flush();
const r1 = store.returnRequests.find(x => x.id === req.data!.id)!;
check('devolução: valor da solicitação é o do produto (R$ 8.000) e o histórico explica os juros',
  done.ok && r1.item_paid_amount === 8000 && r1.history.some(h => h.description.includes('Juros da maquininha')), done.error || JSON.stringify(r1.history.map(h => h.description)));
check('devolução: juros continuam registrados na venda original, sem duplicar', saleInterest(store.sales.find(s => s.id === s1.id)!) === 200);

// ---- limpeza
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...created, cust.id, TAG]);
const delDev = await supabase.from('devices').delete().in('id', created).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
check('limpeza: vendas, garantias, devolução, crédito, aparelhos e cliente de teste apagados',
  docs.deleted === docs.found && delDev.data?.length === created.length && delCust.data?.length === 1, `documentos ${docs.deleted}/${docs.found}, aparelhos ${delDev.data?.length}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
