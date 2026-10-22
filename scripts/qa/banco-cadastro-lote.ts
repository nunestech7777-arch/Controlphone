// Cadastro em lote de aparelhos (migration 25): vários aparelhos do mesmo modelo, um registro por IMEI,
// custo individual preservado, tudo ou nada no banco, sem grade estética e sem conversão de moeda.
// Uso: sh scripts/qa/rodar.sh banco-cadastro-lote
import './shim';
import { readFileSync } from 'node:fs';
import { ADMIN_EMAIL, SELLER_EMAIL, PASSWORD } from './contas';
import { store, newUuid } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { registerDevicesBatchOnServer } from '../../src/lib/realSync';
import { BatchUnit, parseBRL, parseImeiList } from '../../src/lib/deviceBatch';
import { formatBRL } from '../../src/lib/stockMetrics';
import { apagarDocumentosDoTeste, avisoHistorico } from './limpeza';

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

// IMEIs de teste com 15 dígitos, únicos nesta execução
let seq = 0;
const base = String(Date.now()).slice(-9);
const imei = () => `35${base}${String(++seq).padStart(4, '0')}`;
const unit = (cost: string, price: string, extra: Partial<BatchUnit> = {}): BatchUnit =>
  ({ id: newUuid(), purchaseId: newUuid(), imei: imei(), color: 'Azul', battery: '', cost, price, ...extra });
const created: string[] = [];
const dbDevices = async (ids: string[]) => (await supabase.from('devices').select('*').in('id', ids)).data || [];
const byImeis = async (imeis: string[]) => (await supabase.from('devices').select('id').eq('tenant_id', T).in('imei', imeis)).data || [];

let { me, ok } = await enter(ADMIN_EMAIL);
const ADMIN_ID = me.id;
const sup = store.saveSupplier({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Fornecedor`, phone: '(11) 3222-2222' } }).data!;
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000' } }).data!;
check('fornecedor e cliente de teste gravados', ok && await flush() && !store.hasUnsynced, errs());
const batchArgs = { tenantId: T, userId: ADMIN_ID, userRole: 'admin', brand: 'Apple', model: `${TAG} iPhone 14 Plus`, storage: '128GB', supplierId: sup.id, origin: 'purchase' as const, entryDate: new Date().toISOString() };

// TESTE 1, 2 e 6: 3 aparelhos, custos diferentes, valores em reais
const lot1 = [unit('1.865,00', '2.000,00', { color: 'Azul', battery: '89' }), unit('1.900,00', '2.100,00', { color: 'Preto', battery: '94' }), unit('1.850,00', '2.000,00', { color: 'Branco', battery: '87' })];
const res1 = await store.registerDeviceBatch({ ...batchArgs, batchId: newUuid(), deviceType: 'seminovo', units: lot1 });
check('lote de 3 iPhones 14 Plus 128GB cadastrado (banco confirmou)', res1.ok, res1.error);
lot1.forEach(u => created.push(u.id));
await flush();
check('nada ficou pendente de envio (a cópia local veio do banco, sem reenvio)', !store.hasUnsynced, errs());

({ me, ok } = await enter(ADMIN_EMAIL));
const rows1 = await dbDevices(lot1.map(u => u.id));
check('banco: 3 aparelhos individuais, cada um com IMEI, cor e bateria próprios',
  rows1.length === 3 && new Set(rows1.map(r => r.imei)).size === 3 &&
  lot1.every(u => { const r = rows1.find(x => x.id === u.id); return r && r.imei === u.imei && r.color === u.color && r.battery_health === Number(u.battery); }),
  JSON.stringify(rows1.map(r => [r.imei, r.color, r.battery_health])));
check('banco: custo individual preservado (1.865 / 1.900 / 1.850) e preço de cada um',
  [1865, 1900, 1850].every((c, i) => Number(rows1.find(r => r.id === lot1[i].id)?.acquisition_cost) === c) &&
  [2000, 2100, 2000].every((p, i) => Number(rows1.find(r => r.id === lot1[i].id)?.suggested_price) === p),
  JSON.stringify(rows1.map(r => [r.acquisition_cost, r.suggested_price])));
check('banco: modelo, armazenamento, condição, fornecedor, origem, custo acumulado 0, status disponível',
  rows1.length === 3 && rows1.every(r => r.model === batchArgs.model && r.storage_capacity === '128GB' && r.device_type === 'seminovo' && r.supplier_id === sup.id &&
    r.origin === 'purchase' && Number(r.accumulated_repair_cost) === 0 && r.status === 'available' && r.entry_date));
check('R$ 1.865,00 salvo como 1865 e exibido em reais, sem conversão de moeda',
  parseBRL('1.865,00') === 1865 && Number(rows1.find(r => r.id === lot1[0].id)?.acquisition_cost) === 1865 && formatBRL(1865).replace(/\s/g, ' ') === 'R$ 1.865,00', formatBRL(1865));
const purchases = (await supabase.from('supplier_purchases').select('item_id, unit_cost, supplier_id').in('item_id', lot1.map(u => u.id))).data || [];
check('banco: uma compra por aparelho no histórico do fornecedor, com o custo de cada um',
  purchases.length === 3 && [1865, 1900, 1850].every((c, i) => Number(purchases.find(p => p.item_id === lot1[i].id)?.unit_cost) === c));
check('banco: entrada no estoque registrada para cada aparelho',
  lot1.every(u => store.deviceMovements.some(m => m.device_id === u.id && m.movement_type === 'stock_entry')));
check('histórico de atividades registra o lote', store.auditLogs.some(l => l.action === 'APARELHOS_CADASTRADOS_LOTE' && String(l.details?.imeis || '').includes(lot1[0].imei)));
const rowKeys = Object.keys(rows1[0] || {});
check('nenhum campo de grade estética no registro', rowKeys.length > 0 && !rowKeys.some(k => /grade|grading|condition$/.test(k)), rowKeys.join(','));

// TESTE 3: IMEI duplicado → nada é gravado
const dupInside = [unit('1000', '1500'), unit('1000', '1500')];
dupInside[1].imei = dupInside[0].imei;
const r3a = await store.registerDeviceBatch({ ...batchArgs, batchId: newUuid(), deviceType: 'lacrado', units: dupInside });
check('IMEI repetido dentro do lote: cadastro bloqueado na tela', !r3a.ok && /repetido/i.test(r3a.error || ''), r3a.error);
const mixed = [unit('1000', '1500'), { ...unit('1000', '1500'), imei: lot1[0].imei }];
const r3b = await store.registerDeviceBatch({ ...batchArgs, batchId: newUuid(), deviceType: 'lacrado', units: mixed });
check('IMEI já cadastrado na loja: cadastro bloqueado na tela', !r3b.ok && /já cadastrado/i.test(r3b.error || ''), r3b.error);
// o banco também barra, mesmo que alguém pule a tela
const raw = (units: BatchUnit[]) => ({ devices: units.map(u => ({
  device: { id: u.id, imei: u.imei, brand: 'Apple', model: batchArgs.model, storage_capacity: '128GB', color: u.color, device_type: 'lacrado', origin: 'purchase', acquisition_cost: 1000, suggested_price: 1500, entry_date: new Date().toISOString(), created_at: new Date().toISOString() },
  movement: { id: `mov-lote-${u.id}`, description: 'teste', created_at: new Date().toISOString() }
})) });
const s3a = await registerDevicesBatchOnServer(raw(dupInside), T);
const s3b = await registerDevicesBatchOnServer(raw(mixed), T);
const leaked = await byImeis([...dupInside, ...mixed].map(u => u.imei).filter(i => i !== lot1[0].imei));
check('banco: IMEI repetido no lote ou já existente é recusado e nenhum aparelho do lote fica gravado',
  !s3a.ok && !s3b.ok && /repetido/.test(s3a.ok ? '' : s3a.error) && /já cadastrado/.test(s3b.ok ? '' : s3b.error) && leaked.length === 0,
  JSON.stringify({ s3a, s3b, leaked: leaked.length }));
// falha no meio da gravação: nada fica pela metade
const failLot = [unit('900', '1200'), unit('900', '1200')];
const failRes = await store.registerDeviceBatch({ ...batchArgs, batchId: newUuid(), deviceType: 'lacrado', units: failLot, simulateFailure: true });
const failLeak = await byImeis(failLot.map(u => u.imei));
const failPurch = (await supabase.from('supplier_purchases').select('id').in('item_id', failLot.map(u => u.id))).data || [];
check('banco: falha no meio do lote desfaz tudo (nenhum aparelho, compra ou movimentação)',
  !failRes.ok && failLeak.length === 0 && failPurch.length === 0 && !store.devices.some(d => failLot.some(u => u.id === d.id)), failRes.error);

// reenvio (clique duplo / resposta perdida): mesmos identificadores não duplicam
const again = await registerDevicesBatchOnServer({ ...raw(lot1), devices: raw(lot1).devices.map((x, i) => ({ ...x, device: { ...x.device, imei: lot1[i].imei } })) }, T);
const after = await byImeis(lot1.map(u => u.imei));
check('banco: reenviar o mesmo lote responde "já cadastrado" sem duplicar', again.ok && again.already && after.length === 3, JSON.stringify(again));

// TESTE 4: colar 10 IMEIs (quebra de linha, vírgula e tabulação)
const ten = Array.from({ length: 10 }, () => imei());
const pasted = parseImeiList(`${ten.slice(0, 4).join('\n')}\n${ten.slice(4, 7).join(', ')}\t${ten.slice(7).join('\t')}`);
check('colar 10 IMEIs separados por linha, vírgula e tabulação gera 10 entradas', pasted.length === 10 && pasted.every((x, i) => x === ten[i]));

// TESTE 5: 5 unidades, vende 1 → 4 disponíveis
const lot5 = ten.slice(0, 5).map(x => ({ ...unit('1.865,00', '2.000,00'), imei: x }));
const res5 = await store.registerDeviceBatch({ ...batchArgs, model: `${TAG} iPhone 15`, batchId: newUuid(), deviceType: 'lacrado', units: lot5 });
lot5.forEach(u => created.push(u.id));
check('lote de 5 lacrados sem bateria informada (bateria não é exigida nem vira 100%)',
  res5.ok && lot5.every(u => store.devices.find(d => d.id === u.id)?.battery_health === undefined), res5.error);
let sale: { id: string } | undefined;
if (res5.ok) sale = store.finalizeSale({ tenantId: T, sellerId: ADMIN_ID, customerId: cust.id, salesOrigin: 'Instagram', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0, gifts: [],
  items: [{ itemType: 'device', deviceId: lot5[2].id, quantity: 1, unitCost: 1865, unitPrice: 2000, discount: 0, totalPrice: 2000 }],
  payments: [{ paymentMethod: 'pix', amount: 2000, installments: 1 }] });
await flush();
({ me, ok } = await enter(ADMIN_EMAIL));
const avail = store.devices.filter(d => d.tenant_id === T && d.model === `${TAG} iPhone 15` && d.status === 'available');
check('vendendo 1 das 5 unidades, ficam 4 disponíveis e só aquele IMEI sai do estoque',
  Boolean(sale?.id) && avail.length === 4 && store.devices.find(d => d.id === lot5[2].id)?.status === 'sold' && !avail.some(d => d.imei === lot5[2].imei), `disponíveis ${avail.length}`);

// validações de linha
const badBattery = await store.registerDeviceBatch({ ...batchArgs, batchId: newUuid(), deviceType: 'seminovo', units: [unit('100', '200', { battery: '0' })] });
const badImei = await store.registerDeviceBatch({ ...batchArgs, batchId: newUuid(), deviceType: 'seminovo', units: [unit('100', '200', { imei: '12345' })] });
const noColor = await store.registerDeviceBatch({ ...batchArgs, batchId: newUuid(), deviceType: 'seminovo', units: [unit('100', '200', { color: '' })] });
const noType = await store.registerDeviceBatch({ ...batchArgs, batchId: newUuid(), deviceType: '' as never, units: [unit('100', '200')] });
check('bateria 0%, IMEI curto, cor vazia e condição ausente são recusados',
  !badBattery.ok && !badImei.ok && !noColor.ok && !noType.ok, [badBattery, badImei, noColor, noType].map(r => r.error).join(' | '));

// permissão: vendedor não cadastra (tela e banco)
({ me, ok } = await enter(SELLER_EMAIL));
const sellerLot = [unit('100', '200')];
const sRes = await store.registerDeviceBatch({ ...batchArgs, userId: me.id, userRole: 'seller', batchId: newUuid(), deviceType: 'lacrado', units: sellerLot });
const sRaw = await registerDevicesBatchOnServer(raw(sellerLot), T);
check('vendedor não cadastra lote (tela e banco)', !sRes.ok && !sRaw.ok && (await byImeis([sellerLot[0].imei])).length === 0, sRaw.ok ? 'banco aceitou' : sRaw.error);

// TESTE 7: o formulário não tem grade estética
const form = readFileSync(new URL('../../src/pages/admin/DeviceBatchModal.tsx', import.meta.url), 'utf8');
check('formulário de lote sem nenhum campo de grade estética', !/grade|A\+\+|AB\+/i.test(form.replace(/sem grade estética/gi, '')));

// ---- limpeza
({ me, ok } = await enter(ADMIN_EMAIL));
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...created, cust.id, sup.id, TAG]);
await supabase.from('supplier_purchases').delete().in('item_id', created);
const delDev = await supabase.from('devices').delete().in('id', created).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
const delSup = await supabase.from('suppliers').delete().eq('id', sup.id).select('id');
check('limpeza: aparelhos, compras, venda, cliente e fornecedor de teste apagados',
  docs.deleted === docs.found && delDev.data?.length === created.length && delCust.data?.length === 1 && delSup.data?.length === 1,
  `documentos ${docs.deleted}/${docs.found}, aparelhos ${delDev.data?.length}/${created.length}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
