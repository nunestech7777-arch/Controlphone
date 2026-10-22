// Exclusão e inativação de aparelhos (migration 22): exclusão real no banco, estoque e compra
// automática do fornecedor corrigidos na mesma transação, bloqueios por vínculo, falha sem alteração
// parcial, isolamento, permissões, exclusão simultânea e histórico de atividades.
// Uso: sh scripts/qa/rodar.sh banco-exclusao-aparelho   (precisa da migration 22)
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, TECH_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { computeStockMetrics } from '../../src/lib/stockMetrics';
import { loadRemovalCheck, removeDevice, deactivateDevice } from '../../src/lib/deviceRemoval';
import { deleteDeviceOnServer } from '../../src/lib/realSync';
import { activityModule, activityText } from '../../src/lib/activityLabels';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';
import { vistoriaCompleta } from './vistoria';
import { Device, UserRole } from '../../src/types';

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
const imei = (n: number) => '7' + String(Date.now()).slice(-13) + n;
const created: string[] = [];
const addDevice = (n: number, cost: number, supplierId?: string) => {
  const dev: Device = { id: crypto.randomUUID(), tenant_id: T, imei: imei(n), brand: 'Apple', model: `${TAG} iPhone ${n}`, storage_capacity: '128GB', color: 'Preto', device_type: 'seminovo', supplier_id: supplierId, origin: 'purchase', acquisition_cost: cost, accumulated_repair_cost: 0, suggested_price: cost + 1000, status: 'available', entry_date: now, created_at: now };
  store.devices.unshift(dev);
  store.recordMovement({ tenant_id: T, device_id: dev.id, imei: dev.imei, movement_type: 'stock_entry', description: 'Aparelho cadastrado no estoque', to_status: 'available', cost, user_id: ADMIN_ID });
  store.syncDevicePurchase(dev);
  created.push(dev.id);
  return dev;
};
const dbDevice = async (id: string) => (await supabase.from('devices').select('id, status').eq('id', id).maybeSingle()).data;
const dbPurchases = async (deviceId: string) => (await supabase.from('supplier_purchases').select('id, total_cost').eq('item_id', deviceId)).data || [];
const dbExpenses = async () => (await supabase.from('tenant_records').select('id', { count: 'exact', head: true }).eq('tenant_id', T).eq('kind', 'expenses')).count;
const remove = (deviceId: string, role: UserRole = 'admin') => removeDevice({ deviceId, tenantId: T, userId: ADMIN_ID, userRole: role });
let ADMIN_ID = '';

// ---- preparação (admin)
let { me, ok } = await enter(ADMIN_EMAIL);
ADMIN_ID = me.id;
check('admin entra e sincroniza', ok, errs());
const supplier = store.saveSupplier({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Fornecedor`, phone: '(11) 3000-0000' } }).data!;
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000' } }).data!;
const devA = addDevice(1, 2500);                 // sem fornecedor, sem lançamento
const devB = addDevice(2, 1800, supplier.id);    // com compra automática no fornecedor
const devC = addDevice(3, 2000);                 // será vendido
const devD = addDevice(4, 2000);                 // vendido no upgrade
const devE = addDevice(5, 2000);                 // vai para a assistência interna
const devF = addDevice(6, 1500, supplier.id);    // falha simulada
const devG = addDevice(7, 1000);                 // exclusão simultânea
store.saveToStorage();
check('aparelhos de teste cadastrados no banco', await flush() && !store.hasUnsynced, errs());
const expensesBefore = await dbExpenses();

// ---- TESTE 1 e 2: aparelho sem movimentações sai do estoque e o valor diminui
let metrics = computeStockMetrics(T);
let result = await remove(devA.id);
let after = computeStockMetrics(T);
check('T1: aparelho sem movimentações é excluído e some do estoque e do banco', result.ok && !store.devices.some(d => d.id === devA.id) && !(await dbDevice(devA.id)), result.ok ? '' : result.error);
check('T2: quantidade cai 1 e o capital investido cai R$ 2.500,00', after.availableCount === metrics.availableCount - 1 && Math.round((metrics.investedCapital - after.investedCapital) * 100) === 250000,
  `${metrics.investedCapital} → ${after.investedCapital}`);

// ---- TESTE 3: compra automática do fornecedor sai junto
const impact = await loadRemovalCheck(devB.id);
check('T3: o impacto mostra a compra automática do fornecedor (R$ 1.800,00)', !('error' in impact) && impact.canDelete && impact.purchasesCount === 1 && impact.purchasesTotal === 1800, JSON.stringify(impact));
check('T3: compra registrada no banco antes da exclusão', (await dbPurchases(devB.id)).length === 1);
result = await remove(devB.id);
check('T3: aparelho e compra automática excluídos juntos (estoque e fornecedor corrigidos)', result.ok && !(await dbDevice(devB.id)) && (await dbPurchases(devB.id)).length === 0 && !store.supplierPurchases.some(p => p.item_id === devB.id), result.ok ? '' : result.error);

// ---- TESTE 4: sem lançamento financeiro, nada financeiro é criado
check('T4: nenhuma despesa criada ou apagada pelas exclusões', (await dbExpenses()) === expensesBefore && store.expenses.filter(e => e.tenant_id === T).length === expensesBefore, `${expensesBefore} → ${await dbExpenses()}`);

// ---- TESTE 5 e 7: aparelho vendido (com pagamento real) é bloqueado
const sale = store.finalizeSale({ tenantId: T, sellerId: ADMIN_ID, customerId: cust.id, salesOrigin: 'Outro', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0,
  items: [{ itemType: 'device', deviceId: devC.id, quantity: 1, unitCost: 0, unitPrice: 3000, discount: 0, totalPrice: 0, inspection: vistoriaCompleta() }], payments: [{ paymentMethod: 'pix', amount: 3000, installments: 1 }], gifts: [] });
await flush();
let blockedCheck = await loadRemovalCheck(devC.id);
result = await remove(devC.id);
check('T5/T7: aparelho vendido com pagamento: exclusão bloqueada e o motivo aparece',
  !result.ok && result.error === 'Não foi possível excluir este aparelho porque ele possui movimentações vinculadas.' && (result.blockers || []).includes('Aparelho vendido') && (result.blockers || []).includes('Venda vinculada') && Boolean(await dbDevice(devC.id)),
  JSON.stringify(result));
check('T5: venda e pagamento preservados', Boolean((await supabase.from('tenant_records').select('id').eq('tenant_id', T).eq('kind', 'sales').eq('id', sale.id).maybeSingle()).data) && !('error' in blockedCheck) && !blockedCheck.canDeactivate);

// ---- TESTE 6: aparelho do upgrade é bloqueado e pode ser inativado
const trade = store.processTradeIn({ tenantId: T, customerId: cust.id, sellerId: ADMIN_ID, soldDeviceId: devD.id, soldDevicePrice: 3000, receivedImei: imei(8), receivedBrand: 'Apple', receivedModel: `${TAG} iPhone recebido`, receivedStorage: '64GB', receivedColor: 'Branco', appraisalValue: 1000, paymentMethod: 'pix', salesOrigin: 'Outro', soldDeviceInspection: vistoriaCompleta() });
created.push(trade.received_device_id);
await flush();
result = await remove(trade.received_device_id);
check('T6: aparelho recebido em upgrade: exclusão bloqueada', !result.ok && (result.blockers || []).includes('Aparelho recebido em upgrade') && Boolean(await dbDevice(trade.received_device_id)), JSON.stringify(result));
result = await remove(devD.id);
check('T6: aparelho vendido no upgrade: exclusão bloqueada', !result.ok && (result.blockers || []).includes('Upgrade vinculado'), JSON.stringify(result));
let deact = await deactivateDevice({ deviceId: trade.received_device_id, tenantId: T, userId: ADMIN_ID, userRole: 'admin', reason: '' });
check('inativação exige motivo', !deact.ok && deact.error === 'Informe o motivo da inativação.');
deact = await deactivateDevice({ deviceId: trade.received_device_id, tenantId: T, userId: ADMIN_ID, userRole: 'admin', reason: `${TAG} cadastro com defeito` });
await wait(1500);
check('T6: inativação tira o aparelho do estoque disponível e preserva o upgrade',
  deact.ok && (await dbDevice(trade.received_device_id))?.status === 'decommissioned' && !computeStockMetrics(T).availableCount.toString().includes('NaN') &&
  Boolean((await supabase.from('tenant_records').select('id').eq('tenant_id', T).eq('kind', 'tradeIns').eq('id', trade.id).maybeSingle()).data), deact.ok ? '' : deact.error);

// ---- assistência: aparelho com OS é bloqueado
const sent = store.sendDeviceToAssistance({ tenantId: T, deviceId: devE.id, userId: ADMIN_ID, userRole: 'admin', defect: 'bateria' });
await flush();
result = await remove(devE.id);
check('aparelho com ordem de serviço: exclusão bloqueada', sent.ok && !result.ok && (result.blockers || []).some(b => b.includes('manutenção') || b.includes('Ordem de serviço')), JSON.stringify(result));

// ---- TESTE 8: falha no meio não deixa nada pela metade
const failed = await deleteDeviceOnServer(devF.id, true);
const logsF = await supabase.from('tenant_records').select('id').eq('tenant_id', T).eq('kind', 'auditLogs').eq('data->>record_id', devF.id);
const movF = await supabase.from('tenant_records').select('id').eq('tenant_id', T).eq('kind', 'deviceMovements').eq('data->>device_id', devF.id);
check('T8: falha simulada: aparelho, compra do fornecedor, entrada no estoque e histórico continuam como estavam',
  !failed.ok && Boolean(await dbDevice(devF.id)) && (await dbPurchases(devF.id)).length === 1 && (movF.data || []).length === 1 && (logsF.data || []).length === 0,
  JSON.stringify({ failed, purchases: (await dbPurchases(devF.id)).length, mov: movF.data?.length, logs: logsF.data?.length }));

// ---- TESTE 9: outra loja / aparelho inexistente
result = await remove(crypto.randomUUID());
check('T9: aparelho que não é desta loja: operação negada', !result.ok && result.error.startsWith('Este aparelho não foi encontrado nesta loja'), JSON.stringify(result));

// ---- exclusão simultânea
const [first, second] = await Promise.all([deleteDeviceOnServer(devG.id), deleteDeviceOnServer(devG.id)]);
check('exclusão simultânea: uma conclui e a outra recebe "não encontrado"', [first, second].filter(r => r.ok).length === 1 && [first, second].some(r => !r.ok && r.error.startsWith('Este aparelho não foi encontrado')), JSON.stringify([first, second]));
store.forgetDeletedDevice(devG.id);

// ---- TESTE 10: recarregar (navegador vazio) mantém tudo correto
const deleted = [devA.id, devB.id, devG.id];
({ me, ok } = await enter(ADMIN_EMAIL));
const dbAvailable = (await supabase.from('devices').select('id', { count: 'exact', head: true }).eq('tenant_id', T).eq('status', 'available')).count;
check('T10: depois de recarregar, os excluídos continuam fora e o estoque bate com o banco',
  ok && !store.devices.some(d => deleted.includes(d.id)) && computeStockMetrics(T).availableCount === dbAvailable && store.devices.find(d => d.id === trade.received_device_id)?.status === 'decommissioned',
  `tela ${computeStockMetrics(T).availableCount} x banco ${dbAvailable}`);

// ---- TESTE 11: histórico de atividades
const log = store.auditLogs.find(l => l.tenant_id === T && l.action === 'APARELHO_EXCLUIDO' && l.record_id === devB.id);
check('T11: histórico registra a exclusão com usuário, ação, módulo e data (e os detalhes internos)',
  Boolean(log) && log!.user_id === ADMIN_ID && activityText(log!) === 'Excluiu um aparelho.' && activityModule(log!) === 'Estoque' && Boolean(log!.created_at) && log!.details?.imei === devB.imei && Number(log!.details?.valor_das_compras_removidas) === 1800,
  JSON.stringify(log));
check('T11: inativação também aparece no histórico', store.auditLogs.some(l => l.action === 'APARELHO_INATIVADO' && l.record_id === trade.received_device_id));

// ---- PERMISSÕES: vendedor e técnico não excluem nem inativam (conferido no banco)
for (const [email, role] of [[SELLER_EMAIL, 'seller'], [TECH_EMAIL, 'technician']] as const) {
  ({ me, ok } = await enter(email));
  const r1 = await deleteDeviceOnServer(devF.id);
  const r2 = await supabase.rpc('deactivate_device', { p_device_id: devF.id, p_reason: 'x' });
  const r3 = await supabase.rpc('device_removal_check', { p_device_id: devF.id });
  check(`banco: ${role === 'seller' ? 'vendedor' : 'técnico'} não exclui, não inativa nem consulta o impacto`,
    !r1.ok && r1.error.startsWith('Somente o administrador') && Boolean(r2.error) && Boolean(r3.error), JSON.stringify([r1, r2.error?.message, r3.error?.message]));
}

// ---- limpeza (admin)
({ me, ok } = await enter(ADMIN_EMAIL));
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...created, cust.id, supplier.id, TAG]);
await supabase.from('supplier_purchases').delete().in('item_id', created);
const delDev = await supabase.from('devices').delete().in('id', created).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
const delSup = await supabase.from('suppliers').delete().eq('id', supplier.id).select('id');
const left = (await supabase.from('devices').select('id').in('id', created)).data || [];
check('limpeza: aparelhos, vendas, upgrade, OS, movimentações, cliente e fornecedor de teste apagados',
  docs.deleted === docs.found && left.length === 0 && delCust.data?.length === 1 && delSup.data?.length === 1,
  `documentos ${docs.deleted}/${docs.found}, aparelhos restantes ${left.length}, apagados agora ${delDev.data?.length}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
