// Termo de Garantia Apple (1 ano) na venda de aparelho Apple lacrado: registro na venda (termo, versão,
// apresentação e ciência), dois PDFs independentes (comprovante e termo com o texto integral), seminovo e
// outras marcas sem o termo, vendas antigas recuperáveis e nada a mais em estoque ou financeiro.
// Uso: sh scripts/qa/rodar.sh banco-garantia-apple
import './shim';
import { ADMIN_EMAIL, SELLER_EMAIL, PASSWORD } from './contas';
import { store } from '../../src/lib/store';
import { supabase } from '../../src/lib/supabase';
import { loadRealIdentity } from '../../src/lib/realSession';
import { syncTenantRecords } from '../../src/lib/realData';
import { appleWarrantyDocumentFor, getAvailableDocuments, getAutomaticDocuments, getSaleContext, receiptDocumentFor, SALE_DOCUMENTS } from '../../src/lib/pdf/saleDocuments';
import { APPLE_WARRANTY_CURRENT, APPLE_WARRANTY_TERM_ID } from '../../src/lib/appleWarranty';
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
const now = new Date().toISOString();
const created: string[] = [];
const addDevice = (n: number, brand: string, model: string, type: DeviceType) => {
  const dev: Device = { id: crypto.randomUUID(), tenant_id: T, imei: '4' + String(Date.now()).slice(-13) + n, brand, model: `${model} ${TAG}`, storage_capacity: '256GB', color: 'Titânio Preto', device_type: type, origin: 'purchase', acquisition_cost: 6000, accumulated_repair_cost: 0, suggested_price: 8000, status: 'available', entry_date: now, created_at: now };
  store.devices.unshift(dev);
  created.push(dev.id);
  return dev;
};
// texto do PDF gerado (jsPDF sem compressão): junta os trechos e desfaz os escapes
const pdfText = (sale: Sale, docId: string) => {
  const ctx = getSaleContext(sale, store.tenants.find(t => t.id === T)!, store.themes[T]);
  const built = SALE_DOCUMENTS.find(d => d.id === docId)!.build(ctx);
  const raw = Buffer.from(built.doc.output('arraybuffer')).toString('latin1');
  const text = [...raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1')).join(' ');
  return { text: norm(text), pages: built.doc.getNumberOfPages(), fileName: built.fileName };
};
const norm = (t: string) => t.replace(/[“”\x93\x94]/g, '"').replace(/\x97/g, '—').replace(/\x96/g, '–').replace(/\s+/g, ' ').trim();
// rodapé das páginas do termo: na extração ele cai no meio do parágrafo que continua na página seguinte
const FOOTER = /Garantia Apple — Venda nº \d+ — Página \d+ de \d+ ?/g;

let { me, ok } = await enter(ADMIN_EMAIL);
const ADMIN_ID = me.id;
const cust = store.saveCustomer({ tenantId: T, userId: ADMIN_ID, data: { name: `${TAG} Cliente`, phone: '(11) 90000-0000' } }).data!;
const dApple = addDevice(1, 'Apple', 'iPhone 16 Pro', 'lacrado');
const dApple2 = addDevice(2, 'Apple', 'iPhone 16', 'lacrado');
const dUsed = addDevice(3, 'Apple', 'iPhone 13', 'seminovo');
const dSamsung = addDevice(4, 'Samsung', 'Galaxy S24', 'lacrado');
const dUpgrade = addDevice(5, 'Apple', 'iPhone 16 Plus', 'lacrado');
store.saveToStorage();
check('aparelhos de teste gravados', ok && await flush() && !store.hasUnsynced, errs());

({ me, ok } = await enter(SELLER_EMAIL));
const SELLER_ID = me.id;
const SELLER_NAME = me.full_name;
const base = { tenantId: T, sellerId: SELLER_ID, customerId: cust.id, salesOrigin: 'Instagram', subtotal: 0, discountAmount: 0, totalAmount: 0, totalCost: 0, gifts: [] };
const item = (d: Device, extra = {}) => ({ itemType: 'device' as const, deviceId: d.id, quantity: 1, unitCost: 6000, unitPrice: 8000, discount: 0, totalPrice: 8000, ...extra });
const movesBefore = store.deviceMovements.length;

// 1-4: venda do iPhone lacrado com ciência marcada
const sApple = store.finalizeSale({ ...base, totalAmount: 8000, items: [item(dApple)], payments: [{ paymentMethod: 'pix', amount: 8000, installments: 1 }], appleWarrantyAcknowledged: true });
const aw = sApple.apple_warranty;
check('venda do iPhone lacrado registra o termo Apple (id, versão, item, apresentação e ciência do vendedor)',
  aw?.term_id === APPLE_WARRANTY_TERM_ID && aw.version === APPLE_WARRANTY_CURRENT.version && aw.sale_item_ids[0] === sApple.items![0].id &&
  aw.presented_by === SELLER_ID && aw.acknowledged_by === SELLER_ID && Boolean(aw.acknowledged_at) && aw.document === 'apple-warranty', JSON.stringify(aw));
check('venda concluída normalmente: valores e estoque como sempre (um movimento de venda, sem duplicar)',
  sApple.total_amount === 8000 && sApple.gross_profit === 2000 && store.devices.find(d => d.id === dApple.id)?.status === 'sold' &&
  store.deviceMovements.length - movesBefore === 1, `movimentos +${store.deviceMovements.length - movesBefore}`);

// sem ciência marcada: apresentado, sem ciência
const sNoAck = store.finalizeSale({ ...base, totalAmount: 8000, items: [item(dApple2)], payments: [{ paymentMethod: 'pix', amount: 8000, installments: 1 }] });
check('sem a ciência marcada, o termo fica registrado como apresentado, sem ciência', Boolean(sNoAck.apple_warranty) && !sNoAck.apple_warranty?.acknowledged_at);

// 7: seminovo e outra marca não recebem o termo Apple
const sUsed = store.finalizeSale({ ...base, totalAmount: 8000, items: [item(dUsed, { inspection: vistoriaCompleta() })], payments: [{ paymentMethod: 'pix', amount: 8000, installments: 1 }], appleWarrantyAcknowledged: true });
const sSamsung = store.finalizeSale({ ...base, totalAmount: 8000, items: [item(dSamsung)], payments: [{ paymentMethod: 'pix', amount: 8000, installments: 1 }], appleWarrantyAcknowledged: true });
check('iPhone seminovo e lacrado de outra marca não recebem o termo Apple', !sUsed.apple_warranty && !sSamsung.apple_warranty);
check('lacrado não tem a garantia da loja (90 dias): só a garantia Apple; o seminovo continua com a da loja',
  !store.warranties.some(w => [sApple.id, sNoAck.id, sSamsung.id].includes(w.sale_id)) && store.warranties.some(w => w.sale_id === sUsed.id));

// Venda com Upgrade entregando um iPhone lacrado: mesmo registro, com a ciência marcada na tela do upgrade
const receivedImei = '35' + String(Date.now()).slice(-13);
const trade = store.processTradeIn({ tenantId: T, customerId: cust.id, sellerId: SELLER_ID, soldDeviceId: dUpgrade.id, soldDevicePrice: 8000,
  receivedImei, receivedBrand: 'Apple', receivedModel: `iPhone 12 ${TAG}`, receivedStorage: '128GB', receivedColor: 'Preto', appraisalValue: 2000,
  paymentMethod: 'pix', salesOrigin: 'Instagram', appleWarrantyAcknowledged: true });
const sUpgrade = store.sales.find(s => s.id === trade.sale_id)!;
const receivedDev = store.devices.find(d => d.imei === receivedImei);
if (receivedDev) created.push(receivedDev.id);
check('Venda com Upgrade de iPhone lacrado registra o termo Apple com a ciência', Boolean(sUpgrade.apple_warranty?.acknowledged_at) && sUpgrade.apple_warranty?.version === APPLE_WARRANTY_CURRENT.version);
check('vendas enviadas ao banco', await flush() && !store.hasUnsynced, errs());

// 6: outra sessão (histórico) recupera o registro e o documento
({ me, ok } = await enter(ADMIN_EMAIL));
const fromDb = store.sales.find(s => s.id === sApple.id)!;
check('banco: registro do termo preservado com a versão exata', ok && fromDb.apple_warranty?.version === APPLE_WARRANTY_CURRENT.version && fromDb.apple_warranty?.acknowledged_by === SELLER_ID);
const ctx = getSaleContext(fromDb, store.tenants.find(t => t.id === T)!, store.themes[T]);
const docs = getAvailableDocuments(ctx);
const ctxOf = (sale: Sale) => getSaleContext(sale, store.tenants.find(t => t.id === T)!, store.themes[T]);
check('histórico: comprovante e "Termo de Garantia Apple" como documentos separados, os dois baixados ao concluir a venda',
  docs.some(d => d.id === 'receipt-sealed' && d.label === 'Comprovante de Venda — Lacrado') && docs.some(d => d.id === 'apple-warranty' && d.label === 'Termo de Garantia Apple') &&
  ['receipt-sealed', 'apple-warranty'].every(id => getAutomaticDocuments(ctx).some(d => d.id === id)), docs.map(d => d.label).join(' | '));
check('botões do histórico: "Baixar Comprovante" e "Baixar Garantia" apontam cada um para o seu PDF',
  receiptDocumentFor(ctx)?.id === 'receipt-sealed' && appleWarrantyDocumentFor(ctx)?.id === 'apple-warranty');

// PDF 1: só o comprovante, como antes
const receipt = pdfText(fromDb, 'receipt-sealed');
check('PDF do comprovante: só o comprovante de sempre, sem nenhuma página do termo',
  /COMPROVANTE DE VENDA/i.test(receipt.text) && receipt.text.includes(String(fromDb.sale_number)) && receipt.pages === 1 &&
  !receipt.text.includes('Garantia Limitada de um (1) ano') && !/Garantia Apple — Venda/.test(receipt.text), `páginas ${receipt.pages}`);

// PDF 2: só o termo, completo
const pdf = pdfText(fromDb, 'apple-warranty');
check(`PDF da garantia: arquivo próprio (${pdf.fileName}), sem o comprovante`,
  pdf.fileName === `Garantia_Apple_Venda_${fromDb.sale_number}.pdf` && pdf.fileName !== receipt.fileName && !/COMPROVANTE DE VENDA/i.test(pdf.text) && pdf.text.includes('Termo de Garantia — Apple'));
check('PDF da garantia: identificação da venda, do cliente e do aparelho (modelo, capacidade, cor, IMEI, vendedor, versão, ciência)',
  [String(fromDb.sale_number), dApple.model, '256GB', 'Titânio Preto', dApple.imei, cust.name, SELLER_NAME, `versão ${APPLE_WARRANTY_CURRENT.version}`, 'Ciência registrada'].every(t => pdf.text.includes(t)), pdf.text.slice(0, 600));
const missing = APPLE_WARRANTY_CURRENT.sections.flatMap(s => [s.heading || '', ...s.paragraphs]).filter(Boolean).filter(p => !pdf.text.replace(FOOTER, '').replace(/\s+/g, ' ').includes(norm(p)));
check(`PDF da garantia: texto integral (${APPLE_WARRANTY_CURRENT.sections.length} seções, todos os parágrafos, itens (a) a (j) e endereços de suporte)`,
  missing.length === 0 && pdf.text.includes(norm(APPLE_WARRANTY_CURRENT.title)) && pdf.text.includes(norm(APPLE_WARRANTY_CURRENT.subtitle)),
  `faltando ${missing.length}: ${missing.slice(0, 2).map(m => m.slice(0, 80)).join(' | ')}`);
check('PDF da garantia: páginas numeradas', pdf.pages >= 3 && /Garantia Apple — Venda nº \d+ — Página 1 de \d+/.test(pdf.text), `páginas ${pdf.pages}`);

const usedCtx = ctxOf(store.sales.find(s => s.id === sUsed.id)!);
const samsungCtx = ctxOf(store.sales.find(s => s.id === sSamsung.id)!);
check('seminovo segue só com o Termo de Garantia de sempre; lacrado de outra marca sem o termo Apple',
  !appleWarrantyDocumentFor(usedCtx) && getAvailableDocuments(usedCtx).some(d => d.id === 'warranty-term') && !appleWarrantyDocumentFor(samsungCtx) &&
  !pdfText(store.sales.find(s => s.id === sSamsung.id)!, 'receipt-sealed').text.includes('Garantia Limitada de um (1) ano'));

// venda antiga de iPhone lacrado (sem o registro do termo): o termo pode ser recuperado, sem dizer que foi apresentado
const oldSale = { ...fromDb, apple_warranty: undefined } as Sale;
const oldPdf = pdfText(oldSale, 'apple-warranty');
check('venda antiga de iPhone lacrado: termo recuperável, informando que foi emitido depois da venda',
  Boolean(appleWarrantyDocumentFor(ctxOf(oldSale))) && oldPdf.text.includes('Termo emitido em') && !oldPdf.text.includes('Ciência registrada'));

// ---- limpeza
const dlt = await apagarDocumentosDoTeste(T, STARTED_AT, [...created, cust.id, TAG]);
const delDev = await supabase.from('devices').delete().in('id', created).select('id');
const delCust = await supabase.from('customers').delete().eq('id', cust.id).select('id');
check('limpeza: vendas, garantias, aparelhos e cliente de teste apagados',
  dlt.deleted === dlt.found && delDev.data?.length === created.length && delCust.data?.length === 1, `documentos ${dlt.deleted}/${dlt.found}`);

console.error = ce;
console.log(`\n${pass} verificações passaram, ${failN} falharam`);
if (failN && errors.length) console.log('erros registrados:\n  ' + [...new Set(errors)].slice(0, 8).join('\n  '));
console.log(avisoHistorico(T, STARTED_AT));
process.exit(0);
