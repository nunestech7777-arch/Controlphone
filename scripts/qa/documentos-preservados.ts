// Comprovantes e garantias preservados no Reset Geral: os PDFs saem dos mesmos modelos das vendas a partir
// da cópia guardada, mesmo com o estoque, os clientes e as garantias da loja já zerados, e nada fica na memória.
// Uso: sh scripts/qa/rodar.sh documentos-preservados
import './shim';
import { store } from '../../src/lib/store';
import { buildPreservedDocument, preservedDocumentList } from '../../src/lib/pdf/preservedDocuments';
import { SALE_DOCUMENTS } from '../../src/lib/pdf/saleDocuments';
import { PreservedDocument } from '../../src/lib/resetApi';
import { APPLE_WARRANTY_CURRENT } from '../../src/lib/appleWarranty';

let pass = 0, failN = 0;
const check = (desc: string, ok: boolean, extra = '') => { ok ? pass++ : failN++; console.log(`${ok ? 'OK  ' : 'FALHOU'} ${desc}${!ok && extra ? ' — ' + extra : ''}`); };
const tenant = store.tenants.find(t => t.id !== 'platform')!;
const now = new Date().toISOString();
const text = (doc: { output: (t: 'arraybuffer') => ArrayBuffer }) =>
  [...Buffer.from(doc.output('arraybuffer')).toString('latin1').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(m => m[1].replace(/\\([()\\])/g, '$1')).join(' ');

const device = (id: string, type: 'lacrado' | 'seminovo', imei: string) => ({ id, tenant_id: tenant.id, imei, brand: 'Apple', model: `iPhone ${type}`, storage_capacity: '128GB',
  color: 'Preto', device_type: type, origin: 'purchase', acquisition_cost: 1000, accumulated_repair_cost: 0, suggested_price: 2000, status: 'sold', entry_date: now, created_at: now });
const make = (n: number, type: 'lacrado' | 'seminovo'): PreservedDocument => {
  const dev = device(`dev-preservado-${n}`, type, `35111111111111${n}`);
  const sale = { id: `sale-preservada-${n}`, tenant_id: tenant.id, sale_number: 900 + n, seller_id: 'x', customer_id: `cust-preservado-${n}`, sales_origin: 'Instagram',
    subtotal: 2000, discount_amount: 0, total_amount: 2000, total_cost: 1000, gross_profit: 1000, status: 'completed', created_at: now,
    items: [{ id: `item-preservado-${n}`, sale_id: `sale-preservada-${n}`, item_type: 'device', device_id: dev.id, quantity: 1, unit_price: 2000, unit_cost: 1000, discount: 0, total_price: 2000,
      device_type: type, device_info: { brand: 'Apple', model: dev.model, storage_capacity: '128GB', color: 'Preto', imei: dev.imei } }],
    payments: [{ id: `pay-${n}`, sale_id: `sale-preservada-${n}`, payment_method: 'pix', amount: 2000, installments: 1 }], gifts: [],
    ...(type === 'lacrado' ? { apple_warranty: { term_id: 'x', version: APPLE_WARRANTY_CURRENT.version, title: 't', document: 'apple-warranty', sale_item_ids: [`item-preservado-${n}`], presented_at: now, presented_by: 'x' } } : {}) };
  const warranty = { id: `war-preservada-${n}`, tenant_id: tenant.id, sale_id: sale.id, sale_item_id: `item-preservado-${n}`, device_id: dev.id, imei: dev.imei, customer_id: sale.customer_id,
    sale_date: now, warranty_days: 90, start_date: now.slice(0, 10), end_date: now.slice(0, 10), terms: '', status: 'active', history: [], created_at: now };
  return { id: `doc-${n}`, tenant_id: tenant.id, cycle_number: 1, sale_id: sale.id, sale_number: sale.sale_number, sale_date: now, sale_status: 'completed',
    customer_name: `Cliente Preservado ${n}`, products: dev.model, imeis: [dev.imei], warranties: [], store_name: tenant.trade_name,
    payload: { sale: sale as never, customer: { id: sale.customer_id, tenant_id: tenant.id, name: `Cliente Preservado ${n}`, phone: '(11) 9', created_at: now } as never,
      seller_name: 'Vendedor do Ciclo 1', warranties: type === 'seminovo' ? [warranty as never] : [], devices: [dev as never] } };
};

const before = { d: store.devices.length, w: store.warranties.length, c: store.customers.length };
const sealed = make(1, 'lacrado');
const used = make(2, 'seminovo');
check('o aparelho e o cliente da venda preservada não existem mais na loja', !store.devices.some(d => d.id === 'dev-preservado-1') && !store.customers.some(c => c.id === 'cust-preservado-1'));
const sealedDocs = preservedDocumentList(sealed, tenant).map(d => d.id);
const usedDocs = preservedDocumentList(used, tenant).map(d => d.id);
check('iPhone lacrado preservado: comprovante de lacrado e Termo de Garantia Apple', sealedDocs.join() === 'receipt-sealed,apple-warranty', sealedDocs.join());
check('seminovo preservado: Termo de Garantia e comprovante', usedDocs.includes('warranty-term') && usedDocs.includes('receipt'), usedDocs.join());

// monta os PDFs como o botão faz (dados do ciclo só durante a montagem)
const build = (doc: PreservedDocument, id: string) => buildPreservedDocument(SALE_DOCUMENTS.find(d => d.id === id)!, doc, tenant);
const receipt = text(build(sealed, 'receipt-sealed').doc);
const apple = text(build(sealed, 'apple-warranty').doc);
const term = text(build(used, 'warranty-term').doc);
check('comprovante do lacrado preservado: nº da venda, cliente, vendedor e IMEI', receipt.includes('901') && receipt.includes('Cliente Preservado 1') && receipt.includes('Vendedor do Ciclo 1') && receipt.includes('351111111111111'), receipt.slice(0, 300));
check('Termo de Garantia Apple preservado com o texto da versão gravada', apple.includes('Garantia Limitada de um (1) ano') && apple.includes(APPLE_WARRANTY_CURRENT.version));
check('Termo de Garantia do seminovo preservado com o IMEI do aparelho', term.includes('351111111111112'), term.slice(0, 300));
check('depois de montar os PDFs, nada do ciclo encerrado fica na memória da loja',
  store.devices.length === before.d && store.warranties.length === before.w && store.customers.length === before.c);

console.log(`\n${pass} verificações passaram, ${failN} falharam`);
process.exit(failN ? 1 : 0);
