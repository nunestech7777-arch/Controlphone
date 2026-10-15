// Edição de acessório e brinde: corrigir a quantidade (40 -> 45), custo, preço e fornecedor chega ao
// banco e aos outros aparelhos; a compra do cadastro no histórico do fornecedor é corrigida junto.
// Uso: sh scripts/qa/rodar.sh banco-editar-acessorio
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { activityText } from '../../src/lib/activityLabels';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';
import { Accessory, Gift } from '../../src/types';

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

// ---- admin cadastra com 40 unidades (como a tela de cadastro faz)
let { me, ok } = await enter(ADMIN_EMAIL);
const ADMIN_ID = me.id;
const supplier = store.saveSupplier({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Fornecedor`, phone: '(11) 3000-0000' } }).data!;
const supplier2 = store.saveSupplier({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Outro Fornecedor`, phone: '(11) 3000-0001' } }).data!;
const acc: Accessory = { id: crypto.randomUUID(), tenant_id: T, name: `${TAG} Capa`, category: 'Capas', quantity: 40, unit_cost: 10, sale_price: 50, supplier_id: supplier.id, created_at: now };
store.accessories.unshift(acc);
store.recordSupplierPurchase({ tenant_id: T, supplier_id: supplier.id, item_type: 'accessory', item_id: acc.id, description: acc.name, quantity: 40, unit_cost: 10, purchased_at: now });
const gift: Gift = { id: crypto.randomUUID(), tenant_id: T, name: `${TAG} Película`, category: 'Brindes', quantity: 3, unit_cost: 5, created_at: now };
store.gifts.unshift(gift);
store.saveToStorage();
check('admin cadastra acessório com 40 unidades e um brinde', ok && await flush() && !store.hasUnsynced, errs());

// ---- correção: eram 45
let result = store.updateStockItem({ tenantId: T, userId: ADMIN_ID, userRole: 'admin', kind: 'accessory', itemId: acc.id,
  data: { name: `${TAG} Capa`, category: 'Capas', quantity: 45, unitCost: 10, salePrice: 55, supplierId: supplier.id } });
check('admin corrige o acessório para 45 unidades e preço R$ 55,00', result.ok && await flush(), result.error || errs());
const dbAcc = (await supabase.from('accessories').select('quantity, sale_price, unit_cost').eq('id', acc.id).maybeSingle()).data;
check('banco: quantidade 45 e preço 55 gravados', dbAcc?.quantity === 45 && Number(dbAcc?.sale_price) === 55, JSON.stringify(dbAcc));
let purchases = (await supabase.from('supplier_purchases').select('quantity, total_cost, supplier_id').eq('item_id', acc.id)).data || [];
check('banco: compra do cadastro no fornecedor corrigida (45 un., R$ 450,00)', purchases.length === 1 && purchases[0].quantity === 45 && Number(purchases[0].total_cost) === 450, JSON.stringify(purchases));

// troca de fornecedor e de custo: a mesma compra acompanha
result = store.updateStockItem({ tenantId: T, userId: ADMIN_ID, userRole: 'admin', kind: 'accessory', itemId: acc.id,
  data: { name: `${TAG} Capa`, category: 'Capas', quantity: 45, unitCost: 12, salePrice: 55, supplierId: supplier2.id } });
await flush();
purchases = (await supabase.from('supplier_purchases').select('quantity, total_cost, supplier_id').eq('item_id', acc.id)).data || [];
check('trocar fornecedor e custo corrige a compra (outro fornecedor, R$ 540,00)', result.ok && purchases.length === 1 && purchases[0].supplier_id === supplier2.id && Number(purchases[0].total_cost) === 540, JSON.stringify(purchases));

// brinde
result = store.updateStockItem({ tenantId: T, userId: ADMIN_ID, userRole: 'admin', kind: 'gift', itemId: gift.id,
  data: { name: `${TAG} Película 9D`, category: 'Brindes', quantity: 7, unitCost: 4 } });
await flush();
const dbGift = (await supabase.from('gifts').select('name, quantity, unit_cost').eq('id', gift.id).maybeSingle()).data;
check('brinde corrigido no banco (nome, 7 unidades, custo R$ 4,00)', result.ok && dbGift?.quantity === 7 && dbGift?.name === `${TAG} Película 9D` && Number(dbGift?.unit_cost) === 4, JSON.stringify(dbGift));

// validações
const bad = store.updateStockItem({ tenantId: T, userId: ADMIN_ID, userRole: 'admin', kind: 'accessory', itemId: acc.id,
  data: { name: `${TAG} Capa`, category: 'Capas', quantity: -1, unitCost: 10, salePrice: 55, supplierId: supplier2.id } });
check('quantidade negativa é recusada', !bad.ok && store.accessories.find(a => a.id === acc.id)?.quantity === 45, bad.error);
check('histórico registra "Alterou um acessório."', store.auditLogs.some(l => l.action === 'ACESSORIO_EDITADO' && l.record_id === acc.id && activityText(l) === 'Alterou um acessório.'));

// ---- vendedor em outro aparelho vê a correção e não consegue editar
({ me, ok } = await enter(SELLER_EMAIL));
check('vendedor, em outro aparelho, vê 45 unidades', ok && store.accessories.find(a => a.id === acc.id)?.quantity === 45, errs());
const denied = store.updateStockItem({ tenantId: T, userId: me.id, userRole: 'seller', kind: 'accessory', itemId: acc.id,
  data: { name: 'x', category: 'x', quantity: 1, unitCost: 1, salePrice: 1 } });
check('vendedor não edita o estoque', !denied.ok);

// ---- limpeza (admin)
({ me, ok } = await enter(ADMIN_EMAIL));
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [acc.id, gift.id, TAG]);
await supabase.from('supplier_purchases').delete().eq('item_id', acc.id);
const d1 = await supabase.from('accessories').delete().eq('id', acc.id).select('id');
const d2 = await supabase.from('gifts').delete().eq('id', gift.id).select('id');
const d3 = await supabase.from('suppliers').delete().in('id', [supplier.id, supplier2.id]).select('id');
check('limpeza: acessório, brinde, compras e fornecedores de teste apagados', docs.deleted === docs.found && d1.data?.length === 1 && d2.data?.length === 1 && d3.data?.length === 2,
  `acessório ${d1.data?.length}, brinde ${d2.data?.length}, fornecedores ${d3.data?.length}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
