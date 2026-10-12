// Módulos operacionais no banco (tabela tenant_records): vendas, cancelamento, upgrade, devolução com
// crédito, ordem de serviço, regras de acesso por perfil, numeração por loja e envio único dos
// registros antigos. Cada "aparelho" é o store carregado com o navegador vazio.
// Uso: sh scripts/qa/rodar.sh banco-operacional
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, TECH_EMAIL, PASSWORD } from './contas';
import { store, DocKind, DOC_KINDS } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { avisoHistorico } from './limpeza';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${!ok && extra ? ' — ' + extra : ''}`); };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const ce = console.error; const errors: string[] = []; console.error = (...a: unknown[]) => { errors.push(a.join(' ')); };
const errs = () => [...new Set(errors)].slice(-3).join(' | ');
const STARTED_AT = new Date().toISOString();
const TAG = 'QA' + String(Date.now()).slice(-6);

let T = '';
const stateKey = () => `controlphone_state_v1_real_${T}`;
const numbersKey = () => `controlphone_numbers_v1_${T}`;
const signIn = async (email: string) => {
  await wait(1500); // envios em segundo plano do aparelho anterior
  await supabase.auth.signOut({ scope: 'local' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  const r = await loadRealIdentity(data.user!.id);
  if (!r.ok) throw new Error(r.error);
  return { identity: r.identity, userId: data.user!.id };
};
// fresh = navegador vazio (outro aparelho); false = o mesmo navegador sendo reaberto
const enter = async (email: string, fresh = true) => {
  const { identity, userId } = await signIn(email);
  if (fresh && T) { localStorage.removeItem(stateKey()); localStorage.removeItem(numbersKey()); }
  store.enterRealMode(identity);
  const me = store.profiles.find(p => p.id === userId)!;
  T = me.tenant_id!;
  const ok = await syncTenantRecords(T, me.role);
  return { me, ok };
};
const flush = async () => { await wait(200); return store.pushUnsynced(); };
const mine = <K extends DocKind>(kind: K) => (store[kind] as { id: string; tenant_id: string }[]).filter(r => r.tenant_id === T) as (typeof store)[K];
const dbDoc = async (kind: DocKind, id: string) =>
  (await supabase.from('tenant_records').select('data, updated_at, updated_by').eq('tenant_id', T).eq('kind', kind).eq('id', id).maybeSingle()).data as
    { data: Record<string, any>; updated_at: string; updated_by: string } | null;
const dbCount = async (kind: DocKind) =>
  (await supabase.from('tenant_records').select('id', { count: 'exact', head: true }).eq('tenant_id', T).eq('kind', kind)).count;
const imei = (n: number) => '9' + String(Date.now()).slice(-13) + n;
const sell = (sellerId: string, customerId: string, deviceId: string, payments: { paymentMethod: any; amount: number; installments: number }[]) =>
  store.finalizeSale({ tenantId: T, sellerId, customerId, salesOrigin: 'Outro', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0,
    items: [{ itemType: 'device', deviceId, quantity: 1, unitCost: 0, unitPrice: 3000, discount: 0, totalPrice: 0 }], payments, gifts: [] });
const pix = (amount: number) => [{ paymentMethod: 'pix' as const, amount, installments: 1 }];

// ============================================================================
// 1. REGISTROS ANTIGOS: o que só existia em um navegador sobe uma única vez
// ============================================================================
let { me, ok } = await enter(ADMIN_EMAIL);
check('admin entra e sincroniza', ok, errs());
const ADMIN_ID = me.id;
const now = new Date().toISOString();
const legacyExpense = { id: `exp-${TAG}-antiga`, tenant_id: T, category: 'other', description: `${TAG} despesa antiga`, amount: 150, due_date: now.slice(0, 10), status: 'pending', created_by: ADMIN_ID, created_at: now };
const legacyGoal = { id: `goal-${TAG}-antiga`, tenant_id: T, seller_id: ADMIN_ID, month_year: '2020-01', target_device_count: 7 };
const legacyMove = { id: `mov-${TAG}-antiga`, tenant_id: T, imei: imei(0), movement_type: 'stock_entry', description: `${TAG} movimentação antiga`, created_at: now };
const legacyOwnLog = { id: `log-${TAG}-minha`, tenant_id: T, user_id: ADMIN_ID, user_role: 'admin', action: 'QA_TESTE', module: 'QA', details: { tag: TAG }, created_at: now };
const legacyOtherLog = { id: `log-${TAG}-alheia`, tenant_id: T, user_id: '00000000-0000-4000-8000-000000000000', user_role: 'seller', action: 'QA_TESTE', module: 'QA', details: { tag: TAG }, created_at: now };
// estado gravado por uma versão anterior do sistema: não tem a lista do que já foi enviado
await wait(1500);
localStorage.setItem(stateKey(), JSON.stringify({ expenses: [legacyExpense], goals: [legacyGoal], deviceMovements: [legacyMove], auditLogs: [legacyOwnLog, legacyOtherLog] }));
({ me, ok } = await enter(ADMIN_EMAIL, false));
const upExpense = await dbDoc('expenses', legacyExpense.id);
check('registros antigos do navegador sobem na primeira sincronização (despesa, meta, movimentação)',
  ok && upExpense?.data.description === legacyExpense.description && Boolean(await dbDoc('goals', legacyGoal.id)) && Boolean(await dbDoc('deviceMovements', legacyMove.id)), errs());
check('servidor registra quem gravou e quando (não o navegador)', upExpense?.updated_by === ADMIN_ID && Boolean(upExpense?.updated_at));
check('histórico antigo: sobe o que o próprio usuário gerou; o de outra pessoa fica aguardando',
  Boolean(await dbDoc('auditLogs', legacyOwnLog.id)) && !(await dbDoc('auditLogs', legacyOtherLog.id)) && store.legacyPending.auditLogs.join() === legacyOtherLog.id && !store.hasUnsynced, JSON.stringify(store.legacyPending));
check('nada mais fica marcado como antigo', DOC_KINDS.filter(k => k !== 'auditLogs').every(k => store.legacyPending[k].length === 0));
// outro aparelho altera a despesa; o navegador antigo é reaberto e não pode sobrescrever
const edited = await supabase.from('tenant_records').update({ data: { ...legacyExpense, description: `${TAG} editada em outro aparelho` } }).eq('tenant_id', T).eq('kind', 'expenses').eq('id', legacyExpense.id).select('updated_at');
({ me, ok } = await enter(ADMIN_EMAIL, false));
await flush();
const afterReopen = await dbDoc('expenses', legacyExpense.id);
check('reabrir o mesmo navegador não reenvia os registros antigos (a edição feita em outro aparelho permanece)',
  ok && afterReopen?.updated_at === edited.data?.[0]?.updated_at && afterReopen?.data.description.endsWith('outro aparelho') && mine('expenses').find(e => e.id === legacyExpense.id)?.description.endsWith('outro aparelho') === true, errs());

// ============================================================================
// 2. ESTOQUE E CLIENTE DE TESTE (admin)
// ============================================================================
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000' } }).data!;
const devIds = [1, 2, 3, 4, 5].map(n => {
  const id = crypto.randomUUID();
  store.devices.unshift({ id, tenant_id: T, imei: imei(n), brand: 'Apple', model: `${TAG} iPhone ${n}`, storage_capacity: '128GB', color: 'Azul', origin: 'purchase', acquisition_cost: 2000, accumulated_repair_cost: 0, suggested_price: 3000, status: 'available', entry_date: now, created_at: now });
  return id;
});
const [d1, d2, d3, d4, d5] = devIds;
store.saveToStorage();
check('admin cadastra cliente e 5 aparelhos de teste', await flush() && !store.hasUnsynced, errs());

// ============================================================================
// 3. VENDA DO VENDEDOR APARECE PARA O ADMIN EM OUTRO APARELHO
// ============================================================================
({ me, ok } = await enter(SELLER_EMAIL));
const SELLER_ID = me.id;
check('vendedor entra em um aparelho vazio e recebe estoque e cliente', ok && store.devices.some(d => d.id === d1) && store.customers.some(c => c.id === cust.id), errs());
check('vendedor não recebe despesas nem histórico de atividades', mine('expenses').length === 0 && mine('auditLogs').length === 0);
check('vendedor recebe a meta (somente leitura)', mine('goals').some(g => g.id === legacyGoal.id));
let r = await supabase.from('tenant_records').select('id').eq('tenant_id', T).in('kind', ['expenses', 'auditLogs']);
check('banco: vendedor não lê despesas nem histórico de atividades', !r.error && (r.data || []).length === 0, r.error?.message);
r = await supabase.from('tenant_records').insert({ tenant_id: T, kind: 'expenses', id: `exp-${TAG}-vendedor`, data: { description: 'não deveria' } }).select('id');
check('banco: vendedor não grava despesa', Boolean(r.error), 'gravou');
r = await supabase.from('tenant_records').update({ data: { ...legacyGoal, target_device_count: 99 } }).eq('tenant_id', T).eq('kind', 'goals').eq('id', legacyGoal.id).select('id');
check('banco: vendedor não altera meta', (r.data || []).length === 0);
r = await supabase.from('tenant_records').insert({ tenant_id: T, kind: 'auditLogs', id: `log-${TAG}-falsa`, data: { user_id: ADMIN_ID, action: 'FALSO' } }).select('id');
check('banco: vendedor não registra histórico em nome de outra pessoa', Boolean(r.error), 'gravou');

const sale1 = sell(SELLER_ID, cust.id, d1, pix(3000));
let pushed = await flush();
check('venda do vendedor é enviada (venda, garantia, movimentação e o próprio histórico)', pushed && !store.hasUnsynced, errs() + ' ' + JSON.stringify(store.unsynced));
r = await supabase.from('tenant_records').delete().eq('tenant_id', T).eq('kind', 'sales').eq('id', sale1.id).select('id');
check('banco: vendedor não apaga venda', (r.data || []).length === 0);

({ me, ok } = await enter(ADMIN_EMAIL));
let s1 = mine('sales').find(s => s.id === sale1.id);
check('admin, em outro aparelho, recebe a venda com número, itens e pagamento', ok && s1?.sale_number === sale1.sale_number && s1?.items?.[0]?.device_id === d1 && s1?.payments?.[0]?.amount === 3000 && s1?.seller_id === SELLER_ID, errs());
check('admin recebe a garantia e a movimentação da venda', mine('warranties').some(w => w.sale_id === sale1.id && w.status === 'active') && mine('deviceMovements').some(m => m.device_id === d1 && m.movement_type === 'sold'));
check('admin lê o histórico de atividades gerado pelo vendedor', mine('auditLogs').some(l => l.record_id === sale1.id && l.action === 'VENDA_FINALIZADA' && l.user_id === SELLER_ID));
check('aparelho vendido chega como "vendido"', store.devices.find(d => d.id === d1)?.status === 'sold');
const someLog = mine('auditLogs').find(l => l.record_id === sale1.id)!;
r = await supabase.from('tenant_records').update({ data: { ...someLog, action: 'ALTERADO' } }).eq('tenant_id', T).eq('kind', 'auditLogs').eq('id', someLog.id).select('id');
const delLog = await supabase.from('tenant_records').delete().eq('tenant_id', T).eq('kind', 'auditLogs').eq('id', someLog.id).select('id');
check('banco: nem o admin altera ou apaga o histórico de atividades', (r.data || []).length === 0 && (delLog.data || []).length === 0);
r = await supabase.from('tenant_records').insert({ tenant_id: crypto.randomUUID(), kind: 'sales', id: `sale-${TAG}-outra-loja`, data: {} }).select('id');
check('banco: admin não grava em outra loja', Boolean(r.error), 'gravou');

// ============================================================================
// 4. CANCELAMENTO, UPGRADE, DEVOLUÇÃO COM CRÉDITO E USO DO CRÉDITO
// ============================================================================
const cancel = store.cancelSale(sale1.id, T, ADMIN_ID, 'teste de cancelamento');
pushed = await flush();
check('admin cancela a venda', cancel.ok && pushed, cancel.error || errs());

({ me, ok } = await enter(SELLER_EMAIL));
s1 = mine('sales').find(s => s.id === sale1.id);
check('cancelamento chega ao aparelho do vendedor (venda cancelada, garantia cancelada, aparelho disponível)',
  ok && s1?.status === 'cancelled' && s1?.cancellation_reason === 'teste de cancelamento' && mine('warranties').find(w => w.sale_id === sale1.id)?.status === 'cancelled' && store.devices.find(d => d.id === d1)?.status === 'available', errs());
const receivedImei = imei(9);
const trade = store.processTradeIn({ tenantId: T, customerId: cust.id, sellerId: SELLER_ID, soldDeviceId: d2, soldDevicePrice: 3000, receivedImei, receivedBrand: 'Apple', receivedModel: `${TAG} iPhone usado`, receivedStorage: '64GB', receivedColor: 'Roxo', appraisalValue: 1000, paymentMethod: 'pix', salesOrigin: 'Outro' });
const sale3 = sell(SELLER_ID, cust.id, d3, pix(3000));
const req = store.createReturnRequest({ tenantId: T, saleId: sale3.id, saleItemId: sale3.items![0].id, userId: SELLER_ID, userRole: 'seller', reason: 'Insatisfação', resolution: 'credit' });
pushed = await flush();
check('vendedor faz um upgrade, uma venda e abre uma devolução', pushed && req.ok && !store.hasUnsynced, req.error || errs());

({ me, ok } = await enter(ADMIN_EMAIL));
const t1 = mine('tradeIns').find(t => t.id === trade.id);
const upSale = mine('sales').find(s => s.trade_in_id === trade.id);
check('upgrade chega ao admin: registro do upgrade, venda vinculada com os dois pagamentos e aparelho recebido no estoque',
  ok && t1?.appraisal_value === 1000 && upSale?.payments?.length === 2 && upSale?.payments?.some(p => p.payment_method === 'trade_in_credit' && p.amount === 1000) === true && store.devices.find(d => d.id === trade.received_device_id)?.origin === 'trade_in', errs());
check('números de venda diferentes para a venda, o upgrade e a segunda venda', new Set([sale1.sale_number, upSale?.sale_number, sale3.sale_number]).size === 3, `${sale1.sale_number}, ${upSale?.sale_number}, ${sale3.sale_number}`);
const req1 = mine('returnRequests').find(x => x.id === req.data!.id);
check('solicitação de devolução chega ao admin', req1?.status === 'open' && req1?.resolution === 'credit');
const approved = store.updateReturnStatus({ tenantId: T, requestId: req.data!.id, userId: ADMIN_ID, userRole: 'admin', newStatus: 'approved' });
const completed = store.completeReturn({ tenantId: T, requestId: req.data!.id, userId: ADMIN_ID, userRole: 'admin', creditAmount: 3000 });
const resolved = store.resolveReturnedDevice({ tenantId: T, requestId: req.data!.id, userId: ADMIN_ID, userRole: 'admin', destination: 'stock' });
pushed = await flush();
check('admin aprova e conclui a devolução com crédito', approved.ok && completed.ok && resolved.ok && pushed, [approved.error, completed.error, resolved.error, errs()].join(' '));

({ me, ok } = await enter(SELLER_EMAIL));
check('devolução com crédito chega ao vendedor (solicitação concluída, crédito de R$ 3.000, aparelho de volta)',
  ok && mine('returnRequests').find(x => x.id === req.data!.id)?.status === 'completed' && store.getCustomerCreditBalance(T, cust.id) === 3000 && store.devices.find(d => d.id === d3)?.status === 'available', `saldo ${store.getCustomerCreditBalance(T, cust.id)} ${errs()}`);
const sale4 = sell(SELLER_ID, cust.id, d3, [{ paymentMethod: 'store_credit', amount: 2000, installments: 1 }, { paymentMethod: 'pix', amount: 1000, installments: 1 }]);
pushed = await flush();
check('vendedor usa parte do crédito em nova venda', pushed && store.getCustomerCreditBalance(T, cust.id) === 1000, errs());

({ me, ok } = await enter(ADMIN_EMAIL));
const credit = mine('customerCredits').find(c => c.customer_id === cust.id);
check('uso do crédito chega ao admin (saldo R$ 1.000 e o uso apontando para a venda)', ok && store.getCustomerCreditBalance(T, cust.id) === 1000 && credit?.usages.length === 1 && credit?.usages[0].sale_id === sale4.id, errs());

// ============================================================================
// 5. ORDEM DE SERVIÇO: VENDEDOR ABRE, TÉCNICO DIAGNOSTICA, ADMIN ORÇA
// ============================================================================
({ me, ok } = await enter(SELLER_EMAIL));
const opened = store.createServiceOrder({ tenantId: T, customerId: cust.id, sellerId: SELLER_ID, brand: 'Apple', model: `${TAG} iPhone 12`, imei: imei(8), reportedDefect: 'Não carrega' });
pushed = await flush();
const osId = opened.order!.id;
check('vendedor abre a ordem de serviço', opened.ok && pushed, opened.error || errs());

({ me, ok } = await enter(TECH_EMAIL));
const TECH_ID = me.id;
let os = mine('serviceOrders').find(o => o.id === osId);
check('técnico, em outro aparelho, recebe a OS aguardando diagnóstico', ok && os?.status === 'waiting_diagnosis' && os?.os_number === opened.order!.os_number, `${os?.status} ${errs()}`);
check('técnico não recebe vendas, upgrades, devoluções, crédito, despesas, metas nem histórico',
  (['sales', 'tradeIns', 'returnRequests', 'customerCredits', 'expenses', 'goals', 'auditLogs'] as DocKind[]).every(k => mine(k).length === 0));
r = await supabase.from('tenant_records').select('id').eq('tenant_id', T).in('kind', ['sales', 'expenses', 'customerCredits', 'tradeIns', 'returnRequests', 'goals', 'auditLogs']);
check('banco: técnico não lê vendas, despesas, crédito, upgrades, devoluções, metas nem histórico', !r.error && (r.data || []).length === 0, r.error?.message);
r = await supabase.from('tenant_records').insert({ tenant_id: T, kind: 'sales', id: `sale-${TAG}-tecnico`, data: { sale_number: 1 } }).select('id');
check('banco: técnico não grava venda', Boolean(r.error), 'gravou');
const reserve = await supabase.rpc('reserve_record_numbers', { p_kind: 'sales', p_count: 1, p_tenant_id: T });
check('banco: técnico não reserva número de venda', Boolean(reserve.error), 'reservou');
const diagnosed = store.updateServiceOrderDiagnosis({ tenantId: T, osId, technicianId: TECH_ID, diagnosis: 'Conector de carga danificado', partsCost: 100, serviceCost: 50 });
pushed = await flush();
check('técnico lança o diagnóstico e envia (OS, movimentação e o próprio histórico)', Boolean(diagnosed) && pushed && !store.hasUnsynced, errs() + ' ' + JSON.stringify(store.unsynced));

({ me, ok } = await enter(ADMIN_EMAIL));
os = mine('serviceOrders').find(o => o.id === osId);
check('admin recebe a OS aguardando orçamento, com diagnóstico e custos do técnico',
  ok && os?.status === 'quote_pending_admin' && os?.technician_diagnosis === 'Conector de carga danificado' && os?.technician_parts_cost === 100 && os?.technician_service_cost === 50, `${os?.status} ${errs()}`);
check('admin lê o histórico gerado pelo técnico', mine('auditLogs').some(l => l.user_id === TECH_ID && l.record_id === osId));
const quoted = store.adminSetServiceOrderQuote({ tenantId: T, osId, adminId: ADMIN_ID, clientQuoteAmount: 400 });
pushed = await flush();
check('admin define o orçamento', Boolean(quoted) && pushed, errs());

({ me, ok } = await enter(SELLER_EMAIL));
os = mine('serviceOrders').find(o => o.id === osId);
check('vendedor vê a OS com orçamento definido (R$ 400)', ok && os?.status === 'quote_ready' && os?.client_quote_amount === 400 && os?.technician_diagnosis === 'Conector de carga danificado', `${os?.status} ${errs()}`);
({ me, ok } = await enter(TECH_EMAIL));
os = mine('serviceOrders').find(o => o.id === osId);
check('técnico vê o mesmo estado, com as 3 movimentações da OS em ordem',
  ok && os?.status === 'quote_ready' && os?.technician_parts_cost === 100 && store.getOrderMovements(os!).length === 3 && store.getOrderMovements(os!)[0].movement_type === 'external_received', `${os?.status} ${os && store.getOrderMovements(os).length} ${errs()}`);

// ============================================================================
// 6. NUMERAÇÃO: DOIS APARELHOS QUE NÃO SE ENXERGAM RECEBEM NÚMEROS DIFERENTES
// ============================================================================
({ me, ok } = await enter(SELLER_EMAIL));
const reservedBySeller = JSON.parse(localStorage.getItem(numbersKey()) || '{}').sales?.[0];
const sellerDevice = { state: localStorage.getItem(stateKey())!, numbers: localStorage.getItem(numbersKey())! };
check('aparelho do vendedor tem um número de venda reservado no servidor', Number.isInteger(reservedBySeller), String(reservedBySeller));

({ me, ok } = await enter(ADMIN_EMAIL));
const sale5 = sell(ADMIN_ID, cust.id, d4, pix(3000));
pushed = await flush();
check('admin vende em outro aparelho', pushed, errs());
// volta o aparelho do vendedor exatamente como estava: ele ainda não sabe da venda do admin
const sellerLogin = await signIn(SELLER_EMAIL);
localStorage.setItem(stateKey(), sellerDevice.state);
localStorage.setItem(numbersKey(), sellerDevice.numbers);
store.enterRealMode(sellerLogin.identity);
store.syncRole = 'seller';
store.syncUserId = SELLER_ID;
const knewAdminSale = mine('sales').some(s => s.id === sale5.id);
const sale6 = sell(SELLER_ID, cust.id, d5, pix(3000));
ok = await syncTenantRecords(T, 'seller');
check('vendedor vende sem conhecer a venda do admin e recebe outro número',
  !knewAdminSale && sale6.sale_number === reservedBySeller && sale6.sale_number !== sale5.sale_number, `admin #${sale5.sale_number}, vendedor #${sale6.sale_number}`);
const n5 = (await dbDoc('sales', sale5.id))?.data.sale_number, n6 = (await dbDoc('sales', sale6.id))?.data.sale_number;
check('as duas vendas estão no banco com números diferentes', ok && n5 === sale5.sale_number && n6 === sale6.sale_number && n5 !== n6, `${n5} / ${n6} ${errs()}`);
check('fila de envio vazia no final', !store.hasUnsynced, JSON.stringify(store.unsynced));

// ============================================================================
// 7. LIMPEZA (admin): apaga do banco tudo o que este teste criou
// ============================================================================
({ me, ok } = await enter(ADMIN_EMAIL));
const testDevices = new Set([...devIds, trade.received_device_id]);
const saleIds = new Set(mine('sales').filter(s => s.customer_id === cust.id).map(s => s.id));
const osIds = new Set(mine('serviceOrders').filter(o => o.customer_id === cust.id).map(o => o.id));
const created: Record<string, string[]> = {
  sales: [...saleIds],
  tradeIns: mine('tradeIns').filter(t => t.customer_id === cust.id).map(t => t.id),
  warranties: mine('warranties').filter(w => w.customer_id === cust.id).map(w => w.id),
  returnRequests: mine('returnRequests').filter(x => x.customer_id === cust.id).map(x => x.id),
  customerCredits: mine('customerCredits').filter(c => c.customer_id === cust.id).map(c => c.id),
  serviceOrders: [...osIds],
  deviceMovements: mine('deviceMovements').filter(m => (m.device_id && testDevices.has(m.device_id)) || (m.service_order_id && osIds.has(m.service_order_id)) || m.id === legacyMove.id).map(m => m.id),
  expenses: [legacyExpense.id],
  goals: [legacyGoal.id]
};
let deleted = 0, expected = 0, cleanupError = '';
for (const [kind, ids] of Object.entries(created)) {
  expected += ids.length;
  if (ids.length === 0) continue;
  const res = await supabase.from('tenant_records').delete().eq('tenant_id', T).eq('kind', kind).in('id', ids).select('id');
  deleted += res.data?.length || 0;
  if (res.error) cleanupError = res.error.message;
}
const delDev = await supabase.from('devices').delete().in('id', [...testDevices]).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
check(`limpeza: ${expected} documentos, 6 aparelhos e 1 cliente de teste apagados do banco`, deleted === expected && delDev.data?.length === 6 && delCust.data?.length === 1, `documentos ${deleted}/${expected}, aparelhos ${delDev.data?.length}, cliente ${delCust.data?.length} ${cleanupError}`);
const leftovers = await supabase.from('tenant_records').select('kind, id').eq('tenant_id', T).neq('kind', 'auditLogs').gte('updated_at', STARTED_AT);
check('limpeza: nenhum documento criado durante o teste ficou no banco (fora o histórico de atividades)', (leftovers.data || []).length === 0, JSON.stringify(leftovers.data));
const logs = await dbCount('auditLogs');

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(`\nHistórico de atividades na loja de teste: ${logs} registros.`);
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
