// ============================================================================
// CONTROLPHONE — COMPROVANTES E GARANTIAS PRESERVADOS NO RESET DA LOJA
// Os PDFs são gerados pelos mesmos modelos das vendas, a partir da cópia da venda
// guardada no reset (preserved_sale_documents). Os dados do ciclo encerrado entram
// na memória só enquanto o PDF é montado: nada é salvo nem enviado ao banco, e a
// venda não volta a aparecer em vendas ou indicadores.
// ============================================================================

import { store } from '../store';
import { Tenant, TenantTheme } from '../../types';
import { PreservedDocument } from '../resetApi';
import { SALE_DOCUMENTS, SaleDocContext, SaleDocumentDef, DocumentAction } from './saleDocuments';
import { runBuiltDocumentAction } from './documentActions';

/** Documentos que o reset preserva: comprovantes e garantias. */
const PRESERVED_IDS = ['receipt', 'receipt-sealed', 'warranty-term', 'apple-warranty'];

type Overlay = { list: { id: string }[]; added: { id: string }[] };

function withPreservedData<T>(doc: PreservedDocument, fn: () => T): T {
  const p = doc.payload;
  const overlays: Overlay[] = [];
  const add = (list: { id: string }[], items: { id: string }[] | undefined | null) => {
    const added = (items || []).filter(it => it && !list.some(x => x.id === it.id));
    list.push(...added);
    overlays.push({ list, added });
  };
  add(store.devices as never, p.devices as never);
  add(store.warranties as never, p.warranties as never);
  add(store.accessories as never, p.accessories as never);
  add(store.gifts as never, p.gifts as never);
  add(store.tradeIns as never, p.trade_in ? [p.trade_in] as never : []);
  if (p.customer) add(store.customers as never, [p.customer] as never);
  try {
    return fn();
  } finally {
    overlays.forEach(({ list, added }) => added.forEach(a => {
      const i = list.indexOf(a);
      if (i >= 0) list.splice(i, 1);
    }));
  }
}

const contextOf = (doc: PreservedDocument, tenant: Tenant, theme?: TenantTheme): SaleDocContext => ({
  sale: doc.payload.sale,
  tenant,
  theme,
  customer: doc.payload.customer,
  sellerName: doc.payload.seller_name || 'Vendedor'
});

/** Comprovantes e garantias disponíveis para a venda preservada. */
export const preservedDocumentList = (doc: PreservedDocument, tenant: Tenant, theme?: TenantTheme): SaleDocumentDef[] =>
  withPreservedData(doc, () => {
    const ctx = contextOf(doc, tenant, theme);
    return SALE_DOCUMENTS.filter(d => PRESERVED_IDS.includes(d.id) && d.isAvailable(ctx));
  });

/** Monta o PDF de uma venda preservada (sem baixar). */
export const buildPreservedDocument = (def: SaleDocumentDef, doc: PreservedDocument, tenant: Tenant, theme?: TenantTheme) =>
  withPreservedData(doc, () => def.build(contextOf(doc, tenant, theme)));

export async function runPreservedDocument(def: SaleDocumentDef, doc: PreservedDocument, tenant: Tenant, theme: TenantTheme | undefined, action: DocumentAction): Promise<string> {
  const ctx = contextOf(doc, tenant, theme);
  const built = buildPreservedDocument(def, doc, tenant, theme);
  return runBuiltDocumentAction(built, action, {
    text: def.message(ctx),
    subject: `${def.label} - venda nº ${doc.sale_number}`,
    phone: doc.payload.customer?.whatsapp || doc.payload.customer?.phone,
    email: doc.payload.customer?.email
  });
}
