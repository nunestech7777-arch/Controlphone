import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, TECH_EMAIL, PASSWORD } from './contas';
import { store, isUuid } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${extra ? ' — ' + extra : ''}`); };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const ce = console.error; const errors: string[] = []; console.error = (...a: unknown[]) => { errors.push(a.join(' ')); };
let T = '';
const enter = async (email: string, fresh = true) => {
  await wait(1500); // envios em segundo plano do aparelho anterior
  if (fresh && T) localStorage.removeItem(`controlphone_state_v1_real_${T}`);
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
const TAG = 'QA' + String(Date.now()).slice(-6);
const STARTED_AT = new Date().toISOString();
const imeiA = '9' + String(Date.now()).slice(-13) + '1', imeiB = '9' + String(Date.now()).slice(-13) + '2', imeiC = '9' + String(Date.now()).slice(-13) + '3';
const dbDev = async (id: string) => (await supabase.from('devices').select('*').eq('id', id).maybeSingle()).data;

// ---- ADMIN, aparelho A: estoque antigo (só no navegador) + cadastros novos
let { me, ok } = await enter(ADMIN_EMAIL);
check('admin entra e sincroniza', ok, errors.join(' | '));
const now = new Date().toISOString();
store.suppliers.unshift({ id: 'sup-old', tenant_id: T, name: `${TAG} Fornecedor`, phone: '(11) 3000-0000', created_at: now });
store.customers.unshift({ id: 'cust-old', tenant_id: T, name: `${TAG} Cliente`, phone: '(11) 90000-0000', created_at: now });
store.devices.unshift({ id: 'dev-old', tenant_id: T, imei: imeiA, brand: 'Apple', model: `${TAG} iPhone 13`, storage_capacity: '128GB', color: 'Azul', supplier_id: 'sup-old', origin: 'purchase', acquisition_cost: 2000, accumulated_repair_cost: 0, suggested_price: 3000, status: 'available', entry_date: now, created_at: now });
store.accessories.unshift({ id: 'acc-old', tenant_id: T, name: `${TAG} Capa`, category: 'Capas', quantity: 5, unit_cost: 10, sale_price: 50, supplier_id: 'sup-old', created_at: now });
store.gifts.unshift({ id: 'gift-old', tenant_id: T, name: `${TAG} Película`, category: 'Brindes', quantity: 3, unit_cost: 5, created_at: now });
store.supplierPurchases.unshift({ id: 'pur-old', tenant_id: T, supplier_id: 'sup-old', item_type: 'device', item_id: 'dev-old', description: 'compra antiga', quantity: 1, unit_cost: 2000, total_cost: 2000, purchased_at: now, created_at: now });
store.deviceMovements.unshift({ id: 'mov-old', tenant_id: T, device_id: 'dev-old', imei: imeiA, movement_type: 'stock_entry', description: 'entrada', created_at: now });
store.saveToStorage();
ok = await syncTenantRecords(T, 'admin');
const dev = store.devices.find(d => d.imei === imeiA)!;
const acc = store.accessories.find(a => a.name === `${TAG} Capa`)!;
const gift = store.gifts.find(g => g.name === `${TAG} Película`)!;
const sup = store.suppliers.find(s => s.name === `${TAG} Fornecedor`)!;
const cust = store.customers.find(c => c.name === `${TAG} Cliente`)!;
const pur = store.supplierPurchases.find(p => p.description === 'compra antiga')!;
check('estoque antigo sincronizado sem erro', ok && !store.hasUnsynced, errors.join(' | '));
check('aparelho, acessório, brinde e compra antigos ganharam identificador do banco', [dev, acc, gift, pur, sup].every(r => isUuid(r.id)));
check('referências ajustadas (fornecedor do aparelho, item da compra, movimentação)', dev.supplier_id === sup.id && pur.item_id === dev.id && pur.supplier_id === sup.id && store.deviceMovements.find(m => m.id === 'mov-old')!.device_id === dev.id);
let row = await dbDev(dev.id);
check('aparelho gravado no banco com custo, preço e fornecedor', row?.imei === imeiA && Number(row?.acquisition_cost) === 2000 && Number(row?.suggested_price) === 3000 && row?.supplier_id === sup.id && row?.status === 'available');
const accRow = (await supabase.from('accessories').select('*').eq('id', acc.id).maybeSingle()).data;
const giftRow = (await supabase.from('gifts').select('*').eq('id', gift.id).maybeSingle()).data;
const purRow = (await supabase.from('supplier_purchases').select('*').eq('id', pur.id).maybeSingle()).data;
check('acessório, brinde e histórico de compra gravados no banco', accRow?.quantity === 5 && giftRow?.quantity === 3 && Number(purRow?.total_cost) === 2000);

// venda pelo admin: baixa de estoque chega ao banco sem código próprio
const sale = store.finalizeSale({ tenantId: T, sellerId: me.id, customerId: cust.id, salesOrigin: 'Outro', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0,
  items: [{ itemType: 'device', deviceId: dev.id, quantity: 1, unitCost: 0, unitPrice: 3000, discount: 0, totalPrice: 0 }, { itemType: 'accessory', accessoryId: acc.id, quantity: 2, unitCost: 0, unitPrice: 50, discount: 0, totalPrice: 0 }],
  payments: [{ paymentMethod: 'pix', amount: 3100, installments: 1 }], gifts: [{ giftId: gift.id, quantity: 1, unitCost: 0 }] });
await flush();
row = await dbDev(dev.id);
check('venda: aparelho fica "vendido" no banco', row?.status === 'sold' && Boolean(row?.sold_at));
check('venda: quantidade de acessório e brinde baixada no banco', (await supabase.from('accessories').select('quantity').eq('id', acc.id).single()).data?.quantity === 3 && (await supabase.from('gifts').select('quantity').eq('id', gift.id).single()).data?.quantity === 2);
store.cancelSale(sale.id, T, me.id, 'teste');
await flush();
row = await dbDev(dev.id);
check('cancelamento: aparelho volta a "disponível" no banco e as quantidades voltam', row?.status === 'available' && row?.sold_at === null && (await supabase.from('accessories').select('quantity').eq('id', acc.id).single()).data?.quantity === 5);

// ---- VENDEDOR, outro aparelho (navegador vazio)
({ me, ok } = await enter(SELLER_EMAIL));
const sDev = store.devices.find(d => d.id === dev.id);
check('vendedor recebe o estoque do banco', ok && Boolean(sDev) && sDev!.status === 'available' && store.accessories.some(a => a.id === acc.id) && store.gifts.some(g => g.id === gift.id), errors.join(' | '));
check('vendedor não recebe fornecedores nem histórico de compras', store.suppliers.length === 0 && store.supplierPurchases.filter(p => p.tenant_id === T).length === 0);
const sale2 = store.finalizeSale({ tenantId: T, sellerId: me.id, customerId: cust.id, salesOrigin: 'Outro', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0,
  items: [{ itemType: 'device', deviceId: dev.id, quantity: 1, unitCost: 0, unitPrice: 3000, discount: 0, totalPrice: 0 }, { itemType: 'accessory', accessoryId: acc.id, quantity: 1, unitCost: 0, unitPrice: 50, discount: 0, totalPrice: 0 }],
  payments: [{ paymentMethod: 'pix', amount: 3050, installments: 1 }], gifts: [] });
let pushed = await flush();
row = await dbDev(dev.id);
check('venda do vendedor baixa aparelho e acessório no banco', pushed && row?.status === 'sold' && (await supabase.from('accessories').select('quantity').eq('id', acc.id).single()).data?.quantity === 4, errors.join(' | '));
// upgrade pelo vendedor: aparelho usado entra no estoque do banco
store.devices.unshift({ id: crypto.randomUUID(), tenant_id: T, imei: imeiB, brand: 'Apple', model: `${TAG} iPhone 14`, storage_capacity: '128GB', color: 'Preto', origin: 'purchase', acquisition_cost: 3000, accumulated_repair_cost: 0, suggested_price: 4500, status: 'available', entry_date: now, created_at: now });
const dev2 = store.devices[0];
const trade = store.processTradeIn({ tenantId: T, customerId: cust.id, sellerId: me.id, soldDeviceId: dev2.id, soldDevicePrice: 4500, receivedImei: imeiC, receivedBrand: 'Apple', receivedModel: `${TAG} iPhone 11`, receivedStorage: '64GB', receivedColor: 'Roxo', appraisalValue: 1000, paymentMethod: 'pix', salesOrigin: 'Outro' });
pushed = await flush();
row = await dbDev(trade.received_device_id);
check('upgrade: aparelho recebido entra no banco com origem "trade_in" e custo da avaliação', pushed && row?.origin === 'trade_in' && Number(row?.acquisition_cost) === 1000 && row?.status === 'available', errors.join(' | '));

// ---- TÉCNICO, outro aparelho: manutenção interna soma custo
({ me, ok } = await enter(TECH_EMAIL));
const rec = store.devices.find(d => d.id === trade.received_device_id)!;
check('técnico recebe o aparelho que o vendedor acabou de receber no upgrade', ok && Boolean(rec) && rec.status === 'available');
const rep = store.createInternalRepair({ tenantId: T, deviceId: rec.id, technicianId: me.id, issueDescription: 'bateria' });
await flush();
check('manutenção interna: aparelho fica "em manutenção" no banco', rep.ok && (await dbDev(rec.id))?.status === 'in_maintenance');
store.completeInternalRepair({ tenantId: T, repairId: store.internalRepairs[0].id, technicianId: me.id, diagnosis: 'troca', partsUsed: 'bateria', repairCost: 150 });
await flush();
row = await dbDev(rec.id);
check('conclusão: volta a "disponível" com o custo do reparo somado no banco', row?.status === 'available' && Number(row?.accumulated_repair_cost) === 150, errors.join(' | '));

// ---- ADMIN de volta em um aparelho novo: vê tudo o que os outros fizeram
({ me, ok } = await enter(ADMIN_EMAIL));
check('admin recebe o estado final: iPhone 13 vendido, iPhone 11 com custo de reparo, acessório com 4', ok && store.devices.find(d => d.id === dev.id)?.status === 'sold' && Number(store.devices.find(d => d.id === rec.id)?.accumulated_repair_cost) === 150 && store.accessories.find(a => a.id === acc.id)?.quantity === 4);
check('admin recebe o histórico de compras do fornecedor', store.supplierPurchases.some(p => p.id === pur.id && p.item_id === dev.id));
// edição de aparelho: histórico de compra é recriado (o antigo sai do banco)
const editable = store.devices.find(d => d.id === rec.id)!;
editable.supplier_id = sup.id; editable.acquisition_cost = 1100;
store.syncDevicePurchase(editable);
store.saveToStorage();
await flush();
const purs = (await supabase.from('supplier_purchases').select('id, unit_cost').eq('item_id', editable.id)).data || [];
check('editar aparelho atualiza custo e registra a compra no fornecedor', Number((await dbDev(editable.id))?.acquisition_cost) === 1100 && purs.length === 1 && Number(purs[0].unit_cost) === 1100, errors.join(' | '));
// excluir fornecedor: some do banco e desvincula os aparelhos
store.deleteSupplier(sup.id);
store.saveToStorage();
await flush();
const supGone = (await supabase.from('suppliers').select('id').eq('id', sup.id).maybeSingle()).data;
check('excluir fornecedor: some do banco, compras somem e aparelho fica sem fornecedor', !supGone && ((await supabase.from('supplier_purchases').select('id').eq('supplier_id', sup.id)).data || []).length === 0 && (await dbDev(dev.id))?.supplier_id === null);
check('fila de envio vazia no final', !store.hasUnsynced, JSON.stringify(store.unsynced));

// ---- limpeza
const ids = store.devices.filter(d => d.tenant_id === T && d.model.startsWith(TAG)).map(d => d.id);
const d1 = await supabase.from('devices').delete().in('id', ids).select('id');
const d2 = await supabase.from('accessories').delete().eq('id', acc.id).select('id');
const d3 = await supabase.from('gifts').delete().eq('id', gift.id).select('id');
const d4 = await supabase.from('customers').delete().eq('id', cust.id).select('id');
// vendas, garantias, upgrade, manutenção e movimentações que o teste gerou também saem do banco
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...ids, acc.id, gift.id, cust.id, 'mov-old', TAG]);
check('limpeza dos registros de teste', d1.data?.length === 3 && d2.data?.length === 1 && d3.data?.length === 1 && d4.data?.length === 1 && docs.deleted === docs.found, `aparelhos ${d1.data?.length}/3 ${d1.error?.message || ''} documentos ${docs.deleted}/${docs.found}`);
console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
