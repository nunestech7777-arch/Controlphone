// Lixeira de vendas (migration 26): só vendas canceladas, só administrador; mover, restaurar (continua
// cancelada) e excluir definitivamente da interface, sem mexer em estoque, financeiro ou metas, com a
// auditoria preservada e proteção no banco.
// Uso: sh scripts/qa/rodar.sh banco-lixeira
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { periodFinance } from '../../src/lib/saleFinance';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';
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
const created: string[] = [];
const addDevice = (n: number) => {
  const dev: Device = { id: crypto.randomUUID(), tenant_id: T, imei: '4' + String(Date.now()).slice(-13) + n, brand: 'Apple', model: `${TAG} iPhone ${n}`, storage_capacity: '128GB', color: 'Preto', device_type: 'lacrado', origin: 'purchase', acquisition_cost: 1000, accumulated_repair_cost: 0, suggested_price: 2000, status: 'available', entry_date: now, created_at: now };
  store.devices.unshift(dev);
  created.push(dev.id);
  return dev;
};
const sale = (id: string) => store.sales.find(s => s.id === id)!;
const dbSale = async (id: string) => (await supabase.from('tenant_records').select('data').eq('kind', 'sales').eq('id', id).single()).data?.data as Record<string, unknown> | undefined;
const mainList = () => store.sales.filter(s => s.tenant_id === T && !s.deleted_at && !s.trashed_at);
const trashList = () => store.sales.filter(s => s.tenant_id === T && s.trashed_at && !s.purged_at && !s.deleted_at);
const snapshot = (devId: string) => {
  const valid = store.sales.filter(s => s.tenant_id === T && s.status === 'completed');
  return JSON.stringify({ dev: store.devices.find(d => d.id === devId)?.status, fin: periodFinance(valid), count: valid.length, movs: store.deviceMovements.filter(m => m.device_id === devId).length });
};

let { me, ok } = await enter(ADMIN_EMAIL);
const ADMIN_ID = me.id;
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000' } }).data!;
const dA = addDevice(1), dB = addDevice(2);
store.saveToStorage();
const sell = (d: Device) => store.finalizeSale({ tenantId: T, sellerId: ADMIN_ID, customerId: cust.id, salesOrigin: 'Instagram', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0, gifts: [],
  items: [{ itemType: 'device', deviceId: d.id, quantity: 1, unitCost: 1000, unitPrice: 2000, discount: 0, totalPrice: 2000 }],
  payments: [{ paymentMethod: 'pix', amount: 2000, installments: 1 }] });
const sA = sell(dA), sB = sell(dB);
check('duas vendas de teste gravadas', ok && await flush() && !store.hasUnsynced, errs());

// 1. cancelar
const cancel = store.cancelSale(sA.id, T, ADMIN_ID, 'Cliente desistiu');
await flush();
check('1. venda cancelada (aparelho volta ao estoque, sai dos indicadores)', cancel.ok && sale(sA.id).status === 'cancelled' && store.devices.find(d => d.id === dA.id)?.status === 'available', cancel.error);
const before = snapshot(dA.id);

// venda ativa não vai direto para a lixeira
const active = store.moveSaleToTrash(sB.id, T, ADMIN_ID);
check('venda ativa não pode ir para a lixeira (precisa cancelar antes)', !active.ok && !sale(sB.id).trashed_at, active.error);

// 2 e 3. enviar para a lixeira e sumir do histórico
const moved = store.moveSaleToTrash(sA.id, T, ADMIN_ID);
check('2. venda cancelada enviada para a lixeira', moved.ok && Boolean(sale(sA.id).trashed_at) && sale(sA.id).trashed_by === ADMIN_ID, moved.error);
check('3. some do histórico principal e aparece na lixeira', !mainList().some(s => s.id === sA.id) && trashList().some(s => s.id === sA.id));
check('mover para a lixeira não mexe em estoque, financeiro nem metas', snapshot(dA.id) === before, `${before} → ${snapshot(dA.id)}`);
await flush();

// 4. restaurar: volta cancelada
({ me, ok } = await enter(ADMIN_EMAIL));
check('banco: lixeira gravada (outra sessão vê a venda na lixeira)', ok && trashList().some(s => s.id === sA.id));
const restored = store.restoreSaleFromTrash(sA.id, T, ADMIN_ID);
await flush();
check('4. restaurada: volta ao histórico e continua cancelada, sem reativar nem mexer no estoque',
  restored.ok && mainList().some(s => s.id === sA.id) && sale(sA.id).status === 'cancelled' && !sale(sA.id).trashed_at && snapshot(dA.id) === before, restored.error);
const dbRestored = await dbSale(sA.id);
check('banco: restauração gravada (sem marca de lixeira, status cancelado)', dbRestored?.status === 'cancelled' && !dbRestored?.trashed_at, JSON.stringify(dbRestored?.trashed_at));

// 5 e 6. lixeira de novo e exclusão definitiva
const again = store.moveSaleToTrash(sA.id, T, ADMIN_ID);
const purged = store.purgeSaleFromTrash(sA.id, T, ADMIN_ID);
await flush();
check('5/6. enviada de novo e excluída definitivamente: some do histórico e da lixeira',
  again.ok && purged.ok && !mainList().some(s => s.id === sA.id) && !trashList().some(s => s.id === sA.id), `${again.error} ${purged.error}`);
check('excluída definitivamente não pode ser restaurada', !store.restoreSaleFromTrash(sA.id, T, ADMIN_ID).ok);

// 7. consistência e auditoria
({ me, ok } = await enter(ADMIN_EMAIL));
const dbPurged = await dbSale(sA.id);
check('7. banco: a venda continua gravada (pagamento e itens) com a marca de exclusão definitiva',
  ok && Boolean(dbPurged?.purged_at) && dbPurged?.status === 'cancelled' && Array.isArray(dbPurged?.payments) && (dbPurged?.payments as unknown[]).length === 1);
check('7. estoque, financeiro e metas iguais aos de logo após o cancelamento', snapshot(dA.id) === before, `${before} → ${snapshot(dA.id)}`);
check('7. histórico de atividades registra mover, restaurar e excluir definitivamente',
  ['VENDA_LIXEIRA', 'VENDA_RESTAURADA_LIXEIRA', 'VENDA_EXCLUIDA_DEFINITIVAMENTE'].every(a => store.auditLogs.some(l => l.action === a && l.record_id === sA.id)));

// número não é reutilizado
const dC = addDevice(3);
store.saveToStorage();
const sC = sell(dC);
await flush();
check('número de venda não é reutilizado', sC.sale_number > sA.sale_number && sC.sale_number !== sA.sale_number);
const cancelC = store.cancelSale(sC.id, T, ADMIN_ID, 'teste');
await flush();

// banco: administrador não manda venda ativa para a lixeira nem desfaz exclusão definitiva por requisição direta
const rowB = await dbSale(sB.id);
const directActive = await supabase.from('tenant_records').update({ data: { ...rowB, trashed_at: now, trashed_by: ADMIN_ID } }).eq('kind', 'sales').eq('id', sB.id);
const rowA = await dbSale(sA.id);
const copyA = { ...rowA } as Record<string, unknown>;
delete copyA.purged_at; delete copyA.purged_by; delete copyA.trashed_at;
await supabase.from('tenant_records').update({ data: copyA }).eq('kind', 'sales').eq('id', sA.id);
const rowA2 = await dbSale(sA.id);
check('banco: venda ativa recusada na lixeira e exclusão definitiva não pode ser desfeita (migration 26)',
  Boolean(directActive.error) && Boolean(rowA2?.purged_at) && Boolean(rowA2?.trashed_at), JSON.stringify({ err: directActive.error?.message, purged: rowA2?.purged_at }));

// vendedor: bloqueado na tela e no banco
({ me, ok } = await enter(SELLER_EMAIL));
const sellerTry = store.moveSaleToTrash(sC.id, T, me.id);
const rowC = await dbSale(sC.id);
await supabase.from('tenant_records').update({ data: { ...rowC, trashed_at: now, trashed_by: me.id } }).eq('kind', 'sales').eq('id', sC.id);
({ me, ok } = await enter(ADMIN_EMAIL));
const rowC2 = await dbSale(sC.id);
check('vendedor não usa a lixeira (tela e requisição direta ao banco)', cancelC.ok && !sellerTry.ok && !rowC2?.trashed_at, JSON.stringify({ e: sellerTry.error, t: rowC2?.trashed_at }));

// ---- limpeza
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...created, cust.id, TAG]);
const delDev = await supabase.from('devices').delete().in('id', created).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
check('limpeza: vendas, aparelhos e cliente de teste apagados',
  docs.deleted === docs.found && delDev.data?.length === created.length && delCust.data?.length === 1, `documentos ${docs.deleted}/${docs.found}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
