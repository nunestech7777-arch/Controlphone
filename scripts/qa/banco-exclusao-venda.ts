// "Excluir Venda" (exclusão lógica): venda some da listagem e dos indicadores, estoque conforme
// a situação do aparelho, estorno registrado à parte, auditoria, e proteção no banco (migration 24).
// Uso: sh scripts/qa/rodar.sh banco-exclusao-venda
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { periodFinance, saleInterest, saleRevenue } from '../../src/lib/saleFinance';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';
import { vistoriaCompleta } from './vistoria';
import { Device, DeviceType } from '../../src/types';

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
const created: string[] = [];
const addDevice = (n: number, type: DeviceType, cost: number, price: number) => {
  const dev: Device = { id: crypto.randomUUID(), tenant_id: T, imei: '4' + String(Date.now()).slice(-13) + n, brand: 'Apple', model: `${TAG} iPhone ${n}`, storage_capacity: '256GB', color: 'Preto', device_type: type, origin: 'purchase', acquisition_cost: cost, accumulated_repair_cost: 0, suggested_price: price, status: 'available', entry_date: now, created_at: now };
  store.devices.unshift(dev);
  created.push(dev.id);
  return dev;
};
const dev = (id: string) => store.devices.find(d => d.id === id)!;

let { me, ok } = await enter(ADMIN_EMAIL);
const ADMIN_ID = me.id;
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000' } }).data!;
const dA = addDevice(1, 'seminovo', 6500, 8000);   // venda do exemplo (nunca saiu da loja)
const dB = addDevice(2, 'lacrado', 3000, 4000);    // entregue ao cliente
const dC = addDevice(3, 'lacrado', 2000, 3000);    // voltou e precisa de avaliação
const dD = addDevice(4, 'lacrado', 1000, 2000);    // validações de estorno
const dE = addDevice(5, 'lacrado', 500, 1000);    // vendedor exclui a própria venda
const dF = addDevice(6, 'lacrado', 700, 1500);    // venda de outro usuário: vendedor não pode excluir
store.saveToStorage();
check('aparelhos de teste cadastrados', ok && await flush() && !store.hasUnsynced, errs());

({ me, ok } = await enter(SELLER_EMAIL));
const SELLER_ID = me.id;
const base = { tenantId: T, sellerId: SELLER_ID, customerId: cust.id, salesOrigin: 'Instagram', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0, gifts: [] };
const sell = (d: Device, cost: number, price: number, interest = 0, seminovo = false) => store.finalizeSale({ ...base,
  items: [{ itemType: 'device', deviceId: d.id, quantity: 1, unitCost: cost, unitPrice: price, discount: 0, totalPrice: price, ...(seminovo ? { inspection: vistoriaCompleta() } : {}) }],
  payments: [{ paymentMethod: 'credit_card', amount: price, installments: 1, interest }] });
const saleA = sell(dA, 6500, 8000, 200, true);
const saleB = sell(dB, 3000, 4000);
const saleC = sell(dC, 2000, 3000);
const saleD = sell(dD, 1000, 2000);
const saleE = sell(dE, 500, 1000);
check('4 vendas feitas (a primeira: R$ 8.000 + R$ 200 de juros = R$ 8.200)', saleRevenue(saleA) === 8200 && saleInterest(saleA) === 200);
check('vendas enviadas ao banco', await flush() && !store.hasUnsynced, errs());


// ---- admin
({ me, ok } = await enter(ADMIN_EMAIL));
// venda feita pelo próprio administrador (para provar que o vendedor não exclui venda alheia)
const saleF = store.finalizeSale({ ...base, sellerId: ADMIN_ID,
  items: [{ itemType: 'device', deviceId: dF.id, quantity: 1, unitCost: 700, unitPrice: 1500, discount: 0, totalPrice: 1500 }],
  payments: [{ paymentMethod: 'pix', amount: 1500, installments: 1 }] });
await flush();
const before = periodFinance([saleA, saleB, saleC, saleD].map(s => store.sales.find(x => x.id === s.id)!).filter(s => s.status === 'completed'));
const warrantiesA = store.warranties.filter(w => w.sale_id === saleA.id);

// TESTE 1 + 2: venda por engano, aparelho nunca saiu da loja
let res = store.deleteSale(saleA.id, T, ADMIN_ID, { reason: 'Venda cadastrada por engano', deviceSituation: 'in_store', refundStatus: 'pending' });
check('admin exclui a venda de R$ 8.200', res.ok, res.error);
await flush();
const delA = store.sales.find(s => s.id === saleA.id)!;
const valid = [saleA, saleB, saleC, saleD].map(s => store.sales.find(x => x.id === s.id)!).filter(s => s.status === 'completed');
const after = periodFinance(valid);
check('faturamento válido cai R$ 8.200, juros caem R$ 200 e lucro cai R$ 1.500',
  Math.round((before.revenue - after.revenue) * 100) === 820000 && before.interest - after.interest === 200 && Math.round((before.grossProfit - after.grossProfit) * 100) === 150000,
  JSON.stringify({ before, after }));
check('venda excluída fica marcada (deleted_at, deleted_by, motivo) e some da listagem normal',
  Boolean(delA.deleted_at) && delA.deleted_by === ADMIN_ID && delA.deletion_reason === 'Venda cadastrada por engano' && store.sales.filter(s => s.tenant_id === T && !s.deleted_at).every(s => s.id !== saleA.id));
check('mesmo IMEI volta ao estoque disponível, sem duplicar cadastro',
  dev(dA.id).status === 'available' && store.devices.filter(d => d.imei === dA.imei).length === 1 && dev(dA.id).acquisition_cost === 6500);
check('garantia da venda excluída é invalidada (histórico preservado)',
  warrantiesA.length > 0 && store.warranties.filter(w => w.sale_id === saleA.id).every(w => w.status === 'cancelled' && w.history.length > 0));
check('pagamento da venda excluída continua registrado (não é apagado) e o estorno fica pendente',
  (delA.payments || []).length === 1 && delA.refund_status === 'pending');
check('auditoria registra a exclusão com motivo e administrador',
  store.auditLogs.some(l => l.action === 'VENDA_EXCLUIDA' && l.record_id === saleA.id && l.user_id === ADMIN_ID && l.details?.motivo === 'Venda cadastrada por engano'));
const again = store.deleteSale(saleA.id, T, ADMIN_ID, { reason: 'x', deviceSituation: 'in_store', refundStatus: 'pending' });
check('excluir duas vezes é recusado', !again.ok);

// TESTE 6: registro persiste no banco para auditoria (outra sessão)
({ me, ok } = await enter(ADMIN_EMAIL));
const persisted = store.sales.find(s => s.id === saleA.id);
check('banco: venda excluída permanece registrada com motivo, data e responsável',
  ok && Boolean(persisted?.deleted_at) && persisted?.deleted_by === ADMIN_ID && persisted?.deletion_reason === 'Venda cadastrada por engano' && persisted.status === 'cancelled');

// venda excluída não volta por atualização de tela desatualizada (migration 24)
const row = await supabase.from('tenant_records').select('data').eq('kind', 'sales').eq('id', saleA.id).single();
if (row.data) {
  const stale = { ...row.data.data, status: 'completed' } as Record<string, unknown>;
  delete stale.deleted_at; delete stale.deleted_by; delete stale.deletion_reason;
  await supabase.from('tenant_records').update({ data: stale }).eq('id', saleA.id).eq('kind', 'sales');
}
const reread = await supabase.from('tenant_records').select('data').eq('kind', 'sales').eq('id', saleA.id).single();
check('banco: atualização desatualizada não ressuscita a venda excluída (migration 24)',
  reread.data?.data?.status === 'cancelled' && Boolean(reread.data?.data?.deleted_at), JSON.stringify(reread.data?.data?.status));

// TESTE 3: aparelho entregue ao cliente não volta sozinho
res = store.deleteSale(saleB.id, T, ADMIN_ID, { reason: 'Dados incorretos', deviceSituation: 'with_customer', refundStatus: 'pending' });
check('venda com aparelho entregue excluída', res.ok, res.error);
const delB = store.sales.find(s => s.id === saleB.id)!;
check('aparelho entregue NÃO volta ao estoque e fica com retorno pendente',
  dev(dB.id).status === 'sold' && delB.deletion_return_pending === true && saleB.id !== '');
check('venda com aparelho entregue também sai dos indicadores', periodFinance(store.sales.filter(s => s.id === saleB.id && s.status === 'completed')).revenue === 0);
const confirm = store.confirmDeletedSaleReturn(saleB.id, T, ADMIN_ID, 'available');
check('conferência do retorno físico devolve o mesmo IMEI ao estoque',
  confirm.ok && dev(dB.id).status === 'available' && delB.deletion_return_pending === false && store.devices.filter(d => d.imei === dB.imei).length === 1, confirm.error);
check('conferir de novo é recusado', !store.confirmDeletedSaleReturn(saleB.id, T, ADMIN_ID, 'available').ok);

// aparelho voltou, mas precisa de avaliação
res = store.deleteSale(saleC.id, T, ADMIN_ID, { reason: 'Erro no pagamento', deviceSituation: 'awaiting_evaluation', refundStatus: 'not_needed', refundNote: 'Cliente não pagou' });
check('aparelho que voltou para avaliação fica bloqueado para venda', res.ok && dev(dC.id).status === 'awaiting_evaluation', res.error);

// estorno: validações
const bad1 = store.deleteSale(saleD.id, T, ADMIN_ID, { reason: 'Venda duplicada', deviceSituation: 'in_store', refundStatus: 'done' });
const bad2 = store.deleteSale(saleD.id, T, ADMIN_ID, { reason: 'Venda duplicada', deviceSituation: 'in_store', refundStatus: 'partial', refundConfirmed: true });
const bad3 = store.deleteSale(saleD.id, T, ADMIN_ID, { reason: 'Venda duplicada', deviceSituation: 'in_store', refundStatus: 'not_needed' });
const bad4 = store.deleteSale(saleD.id, T, ADMIN_ID, { reason: '   ', deviceSituation: 'in_store', refundStatus: 'pending' });
check('estorno concluído sem confirmação, parcial sem valor, "não necessário" sem explicação e motivo vazio são recusados',
  !bad1.ok && !bad2.ok && !bad3.ok && !bad4.ok && store.sales.find(s => s.id === saleD.id)!.status === 'completed', [bad1, bad2, bad3, bad4].map(x => x.error).join(' | '));
res = store.deleteSale(saleD.id, T, ADMIN_ID, { reason: 'Venda duplicada', deviceSituation: 'in_store', refundStatus: 'pending' });
const upd = store.updateDeletedSaleRefund(saleD.id, T, ADMIN_ID, { status: 'done', confirmed: false });
const upd2 = store.updateDeletedSaleRefund(saleD.id, T, ADMIN_ID, { status: 'done', confirmed: true, note: 'Pix de devolução' });
check('estorno só vira concluído com confirmação e fica registrado',
  res.ok && !upd.ok && upd2.ok && store.sales.find(s => s.id === saleD.id)!.refund_status === 'done');
const asSellerRefund = store.updateDeletedSaleRefund(saleD.id, T, SELLER_ID, { status: 'pending' });
check('vendedor não altera estorno', !asSellerRefund.ok);
await flush();
check('tudo enviado ao banco', !store.hasUnsynced, errs());

// ---- vendedor: exclui a própria venda, não a dos outros (regra do sistema e do banco)
({ me, ok } = await enter(SELLER_EMAIL));
const others = store.deleteSale(saleF.id, T, SELLER_ID, { reason: 'Venda duplicada', deviceSituation: 'in_store', refundStatus: 'pending' });
check('vendedor não consegue excluir venda de outro usuário', !others.ok && store.sales.find(s => s.id === saleF.id)?.status === 'completed', others.error);
const refundDone = store.deleteSale(saleE.id, T, SELLER_ID, { reason: 'Dados incorretos', deviceSituation: 'in_store', refundStatus: 'done', refundConfirmed: true });
check('vendedor não marca estorno como concluído', !refundDone.ok && store.sales.find(s => s.id === saleE.id)?.status === 'completed', refundDone.error);
const own = store.deleteSale(saleE.id, T, SELLER_ID, { reason: 'Venda cadastrada por engano', deviceSituation: 'in_store', refundStatus: 'pending' });
check('vendedor exclui a venda que ele mesmo realizou', own.ok && Boolean(store.sales.find(s => s.id === saleE.id)?.deleted_at), own.error);
check('vendedor: aparelho da venda excluída volta ao estoque', dev(dE.id).status === 'available');
check('venda do vendedor enviada ao banco', await flush() && !store.hasUnsynced, errs());
const directF = await supabase.from('tenant_records').select('data').eq('kind', 'sales').eq('id', saleF.id).single();
const attack = directF.data
  ? await supabase.from('tenant_records').update({ data: { ...directF.data.data, status: 'cancelled', deleted_at: new Date().toISOString(), deleted_by: SELLER_ID, deletion_reason: 'manual' } }).eq('id', saleF.id).eq('kind', 'sales')
  : { error: { message: 'linha não lida' } };
const afterAttack = await supabase.from('tenant_records').select('data').eq('kind', 'sales').eq('id', saleF.id).single();
check('banco: vendedor não exclui venda de outro por requisição direta (migration 24)',
  Boolean(attack.error) && afterAttack.data?.data?.status === 'completed' && !afterAttack.data?.data?.deleted_at,
  'o banco aceitou — rode a migration 24 no SQL Editor');
({ me, ok } = await enter(ADMIN_EMAIL));
const seenE = store.sales.find(s => s.id === saleE.id);
check('banco: administrador vê a exclusão feita pelo vendedor na área Vendas Excluídas (autor, motivo, estorno pendente)',
  ok && seenE?.deleted_by === SELLER_ID && seenE.deletion_reason === 'Venda cadastrada por engano' && seenE.refund_status === 'pending');

// ---- limpeza
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...created, cust.id, TAG]);
const delDev = await supabase.from('devices').delete().in('id', created).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
check('limpeza: vendas, garantias, aparelhos e cliente de teste apagados',
  docs.deleted === docs.found && delDev.data?.length === created.length && delCust.data?.length === 1, `documentos ${docs.deleted}/${docs.found}, aparelhos ${delDev.data?.length}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
