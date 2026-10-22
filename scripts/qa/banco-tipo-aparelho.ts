// Aparelho seminovo x lacrado: tipo gravado no banco, venda de cada tipo, escolha automática do
// comprovante (com os avisos obrigatórios do lacrado), venda mista, preservação do documento depois de
// mudar o estoque, textos editáveis pelo administrador, permissões e isolamento entre lojas.
// Uso: sh scripts/qa/rodar.sh banco-tipo-aparelho   (precisa da migration 21)
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, TECH_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { getAvailableDocuments, getAutomaticDocuments, getSaleContext, SALE_DOCUMENTS } from '../../src/lib/pdf/saleDocuments';
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
const imei = (n: number) => '8' + String(Date.now()).slice(-13) + n;
const now = new Date().toISOString();
const addDevice = (n: number, type: DeviceType) => {
  const dev: Device = { id: crypto.randomUUID(), tenant_id: T, imei: imei(n), brand: 'Apple', model: `${TAG} iPhone ${type} ${n}`, storage_capacity: '256GB', color: 'Azul', device_type: type, origin: 'purchase', acquisition_cost: 3000, accumulated_repair_cost: 0, suggested_price: 5000, status: 'available', entry_date: now, created_at: now };
  store.devices.unshift(dev);
  return dev;
};
const sell = (sellerId: string, customerId: string, deviceIds: string[]) =>
  store.finalizeSale({ tenantId: T, sellerId, customerId, salesOrigin: 'Outro', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0,
    items: deviceIds.map(deviceId => ({ itemType: 'device' as const, deviceId, quantity: 1, unitCost: 0, unitPrice: 5000, discount: 0, totalPrice: 0, inspection: vistoriaCompleta() })),
    payments: [{ paymentMethod: 'pix', amount: 5000 * deviceIds.length, installments: 1 }], gifts: [] });
const dbDevice = async (id: string) => (await supabase.from('devices').select('device_type').eq('id', id).maybeSingle()).data;
// Texto do PDF gerado (layout padrão do sistema), com as quebras de linha desfeitas
const pdfText = (sale: Sale, docId: string) => {
  const ctx = getSaleContext(sale, store.tenants.find(t => t.id === T)!, store.themes[T]);
  const raw = Buffer.from(SALE_DOCUMENTS.find(d => d.id === docId)!.build(ctx).doc.output('arraybuffer')).toString('latin1');
  return [...raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(m => m[1]).join(' ').replace(/\s+/g, ' ');
};
const docsOf = (sale: Sale) => {
  const ctx = getSaleContext(sale, store.tenants.find(t => t.id === T)!, store.themes[T]);
  return { labels: getAvailableDocuments(ctx).map(d => d.label), auto: getAutomaticDocuments(ctx).map(d => d.id) };
};
const FABRICANTE = 'garantia contratual oferecida pelo fabricante';
const NAO_FISCAL = 'não possui valor fiscal e não substitui a Nota Fiscal';
const has = (text: string, phrase: string) => text.includes(phrase); // o PDF usa Latin-1, igual ao texto lido acima

// ============================================================================
// 1. CADASTRO E EDIÇÃO (admin)
// ============================================================================
let { me, ok } = await enter(ADMIN_EMAIL);
check('admin entra e sincroniza', ok, errs());
const ADMIN_ID = me.id;
const previousTexts = { ...store.getDocumentTexts(T) };
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000', cpf: '123.456.789-00' } }).data!;
const semi1 = addDevice(1, 'seminovo');
const lac1 = addDevice(2, 'lacrado');
const semi2 = addDevice(3, 'seminovo');
const lac2 = addDevice(4, 'lacrado');
const lac3 = addDevice(5, 'lacrado');
store.saveToStorage();
check('admin cadastra aparelhos seminovos e lacrados', await flush() && !store.hasUnsynced, errs());
check('banco: tipo gravado na tabela de aparelhos', (await dbDevice(semi1.id))?.device_type === 'seminovo' && (await dbDevice(lac1.id))?.device_type === 'lacrado', JSON.stringify(await dbDevice(lac1.id)));
const editable = store.devices.find(d => d.id === lac3.id)!;
editable.device_type = 'seminovo';
store.saveToStorage();
await flush();
check('edição do tipo chega ao banco', (await dbDevice(lac3.id))?.device_type === 'seminovo');
editable.device_type = 'lacrado';
store.saveToStorage();
await flush();
let r = await supabase.from('devices').update({ device_type: 'grade A' }).eq('id', semi1.id).select('id');
check('banco: só aceita seminovo ou lacrado', Boolean(r.error), 'aceitou "grade A"');

// textos dos comprovantes definidos pelo administrador
const save = store.saveDocumentTexts({ tenantId: T, userId: ADMIN_ID, userRole: 'admin', seminovoTerms: `${TAG} Garantia de 90 dias da loja para seminovos.`, lacradoNotes: `${TAG} Observação da loja para lacrados.` });
check('admin salva os textos dos comprovantes', save.ok && await flush(), save.error || errs());

// ============================================================================
// 2. VENDEDOR: vê o tipo, vende cada tipo e uma venda mista
// ============================================================================
({ me, ok } = await enter(SELLER_EMAIL));
const SELLER_ID = me.id;
const seen = (id: string) => store.devices.find(d => d.id === id)?.device_type;
check('vendedor recebe o tipo dos aparelhos', ok && seen(semi1.id) === 'seminovo' && seen(lac1.id) === 'lacrado', errs());
check('vendedor recebe os textos dos comprovantes', store.getDocumentTexts(T).lacrado_notes === `${TAG} Observação da loja para lacrados.`);
r = await supabase.from('tenant_records').upsert({ tenant_id: T, kind: 'documentTexts', id: 'sale-receipts', data: { lacrado_notes: 'vendedor' } }, { onConflict: 'tenant_id,kind,id' }).select('id');
check('banco: vendedor não altera os textos dos comprovantes', Boolean(r.error), 'alterou');
check('vendedor não consegue salvar os textos pela tela', !store.saveDocumentTexts({ tenantId: T, userId: SELLER_ID, userRole: 'seller', seminovoTerms: 'x', lacradoNotes: 'y' }).ok);

const saleSemi = sell(SELLER_ID, cust.id, [semi1.id]);
const saleLac = sell(SELLER_ID, cust.id, [lac1.id]);
const saleMix = sell(SELLER_ID, cust.id, [semi2.id, lac2.id]);
check('vendas enviadas ao banco', await flush() && !store.hasUnsynced, errs());
check('venda de seminovo grava o tipo no item e registra a garantia comercial com o texto da loja',
  saleSemi.items![0].device_type === 'seminovo' && store.warranties.some(w => w.sale_id === saleSemi.id && w.terms.startsWith(TAG)));
check('venda de lacrado grava o tipo e NÃO registra a garantia comercial de seminovo',
  saleLac.items![0].device_type === 'lacrado' && !store.warranties.some(w => w.sale_id === saleLac.id) && saleLac.sealed_receipt_notes === `${TAG} Observação da loja para lacrados.`);

// ============================================================================
// 3. ESCOLHA AUTOMÁTICA DOS COMPROVANTES (admin, em outro aparelho)
// ============================================================================
({ me, ok } = await enter(ADMIN_EMAIL));
const s1 = store.sales.find(s => s.id === saleSemi.id)!, s2 = store.sales.find(s => s.id === saleLac.id)!, s3 = store.sales.find(s => s.id === saleMix.id)!;
check('admin recebe as três vendas com o tipo de cada item', ok && s1?.items?.[0].device_type === 'seminovo' && s2?.items?.[0].device_type === 'lacrado' && s3?.items?.length === 2, errs());
let d = docsOf(s1);
check('seminovo: Termo de Garantia + Comprovante de Venda — Seminovo; nada de lacrado',
  d.labels.includes('Termo de Garantia') && d.labels.includes('Comprovante de Venda — Seminovo') && !d.labels.some(l => l.startsWith('Comprovante de Venda — Lacrado')) && d.auto.join() === 'warranty-term', d.labels.join(', '));
d = docsOf(s2);
check('lacrado: só o Comprovante de Venda — Lacrado (sem Termo de Garantia de seminovo), baixado automaticamente',
  d.labels.some(l => l.startsWith('Comprovante de Venda — Lacrado')) && !d.labels.includes('Termo de Garantia') && !d.labels.some(l => l.startsWith('Comprovante da Venda') || l.endsWith('Seminovo')) && d.auto.join() === 'receipt-sealed', d.labels.join(', '));
const lacText = pdfText(s2, 'receipt-sealed');
check('comprovante de lacrado: aparelho, IMEI, tipo LACRADO, cliente com CPF e valor', lacText.includes(lac1.imei) && lacText.includes('LACRADO') && lacText.includes('123.456.789-00') && lacText.includes('5.000,00'));
check('comprovante de lacrado: texto da garantia do fabricante', has(lacText, FABRICANTE), lacText.slice(-600));
check('comprovante de lacrado: aviso de cupom não fiscal', has(lacText, NAO_FISCAL), lacText.slice(-400));
check('comprovante de lacrado: sem os termos da garantia dos seminovos e com a observação da loja', !lacText.includes(TAG + ' Garantia') && lacText.includes(`${TAG} Observa`));
const semiText = pdfText(s1, 'receipt');
check('comprovante de seminovo: modelo atual, com a garantia comercial e sem os avisos do lacrado', semiText.includes(semi1.imei) && semiText.includes('Seminovo') && semiText.includes('Garantia comercial') && !semiText.includes('fabricante'));
d = docsOf(s3);
check('venda mista: um comprovante para cada tipo e o Termo de Garantia só do seminovo',
  d.labels.includes('Comprovante de Venda — Seminovo') && d.labels.some(l => l.startsWith('Comprovante de Venda — Lacrado')) && d.auto.includes('warranty-term') && d.auto.includes('receipt-sealed'), d.labels.join(', '));
const mixSemi = pdfText(s3, 'receipt'), mixLac = pdfText(s3, 'receipt-sealed'), mixTerm = pdfText(s3, 'warranty-term');
check('venda mista: cada comprovante lista só o seu aparelho',
  mixSemi.includes(semi2.imei) && !mixSemi.includes(lac2.imei) && mixLac.includes(lac2.imei) && !mixLac.includes(semi2.imei));
check('venda mista: Termo de Garantia sem o aparelho lacrado', mixTerm.includes(semi2.imei) && !mixTerm.includes(lac2.imei));

// ============================================================================
// 4. PRESERVAÇÃO: mudar o estoque depois da venda não muda o comprovante
// ============================================================================
const soldLac = store.devices.find(d => d.id === lac1.id)!;
soldLac.device_type = 'seminovo';
soldLac.model = `${TAG} modelo editado`;
store.saveToStorage();
await flush();
({ me, ok } = await enter(ADMIN_EMAIL));
const again = store.sales.find(s => s.id === saleLac.id)!;
d = docsOf(again);
const preserved = pdfText(again, 'receipt-sealed');
check('depois de mudar o tipo e o modelo no estoque, a venda continua com o comprovante de lacrado original',
  ok && d.labels.some(l => l.startsWith('Comprovante de Venda — Lacrado')) && !d.labels.includes('Termo de Garantia') && preserved.includes(`${TAG} iPhone lacrado 2`) && !preserved.includes('modelo editado'), d.labels.join(', '));

// ============================================================================
// 5. PERMISSÕES E ISOLAMENTO
// ============================================================================
({ me, ok } = await enter(TECH_EMAIL));
r = await supabase.from('tenant_records').select('id').eq('tenant_id', T).eq('kind', 'documentTexts');
check('banco: técnico não lê os textos dos comprovantes', !r.error && (r.data || []).length === 0, r.error?.message);
check('técnico vê o tipo do aparelho', store.devices.find(x => x.id === lac2.id)?.device_type === 'lacrado');
({ me, ok } = await enter(ADMIN_EMAIL));
r = await supabase.from('devices').insert({ id: crypto.randomUUID(), tenant_id: crypto.randomUUID(), imei: imei(9), brand: 'Apple', model: 'Outra loja', storage_capacity: '64GB', color: 'X', device_type: 'lacrado', origin: 'purchase', acquisition_cost: 1, accumulated_repair_cost: 0, suggested_price: 2, status: 'available', entry_date: now, created_at: now }).select('id');
check('banco: admin não grava aparelho em outra loja', Boolean(r.error), 'gravou');
r = await supabase.from('tenant_records').insert({ tenant_id: crypto.randomUUID(), kind: 'documentTexts', id: 'sale-receipts', data: {} }).select('id');
check('banco: admin não grava textos de comprovante em outra loja', Boolean(r.error), 'gravou');

// ============================================================================
// 6. LIMPEZA
// ============================================================================
const ids = [semi1, lac1, semi2, lac2, lac3].map(x => x.id);
const docs = await apagarDocumentosDoTeste(T, STARTED_AT, [...ids, cust.id, TAG]);
// textos da loja voltam ao que eram antes do teste (sem textos antes: o registro criado pelo teste sai)
const hadTexts = Boolean(previousTexts.seminovo_terms || previousTexts.lacrado_notes);
const restore = hadTexts
  ? store.saveDocumentTexts({ tenantId: T, userId: ADMIN_ID, userRole: 'admin', seminovoTerms: previousTexts.seminovo_terms || '', lacradoNotes: previousTexts.lacrado_notes || '' })
  : { ok: !(await supabase.from('tenant_records').delete().eq('tenant_id', T).eq('kind', 'documentTexts').eq('id', 'sale-receipts')).error };
await flush();
const delDev = await supabase.from('devices').delete().in('id', ids).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
const serverTexts = (await supabase.from('tenant_records').select('data').eq('tenant_id', T).eq('kind', 'documentTexts')).data || [];
const leftTexts = (serverTexts[0]?.data || {}) as { lacrado_notes?: string };
check('limpeza: vendas, garantias e movimentações, 5 aparelhos e 1 cliente apagados; textos restaurados',
  docs.deleted === docs.found && delDev.data?.length === 5 && delCust.data?.length === 1 && restore.ok && (hadTexts || serverTexts.length === 0) && !String(leftTexts.lacrado_notes || '').includes(TAG),
  `documentos ${docs.deleted}/${docs.found}, aparelhos ${delDev.data?.length}, cliente ${delCust.data?.length}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
