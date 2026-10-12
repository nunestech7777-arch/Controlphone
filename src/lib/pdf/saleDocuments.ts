// ============================================================================
// CONTROLPHONE — DOCUMENTOS DA VENDA (CATÁLOGO ÚNICO)
// Para adicionar um novo documento, basta incluir um item em SALE_DOCUMENTS:
// a interface ("Documentos da Venda") lista e oferece as ações automaticamente.
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { store } from '../store';
import { Customer, Sale, ServiceOrder, Tenant, TenantTheme, TradeIn } from '../../types';
import { buildReceiptPDF } from './generateReceiptPDF';
import { buildWarrantyTermPDF, WarrantyTermEntry } from './warrantyTermPDF';
import { buildServiceOrderPDF } from './serviceOrderPDF';
import { BuiltDocument, DocumentAction, runBuiltDocumentAction } from './documentActions';
import { saleTemplateValues, serviceOrderTemplateValues } from './templateValues';
import { TenantDocumentType } from '../../types';

export type { BuiltDocument, DocumentAction };

export interface SaleDocContext {
  sale: Sale;
  tenant: Tenant;
  theme?: TenantTheme;
  customer?: Customer;
  sellerName: string;
}

export interface SaleDocumentDef {
  id: string;
  label: string;
  description: string;
  /** O documento só aparece no menu quando faz sentido para a venda */
  isAvailable: (ctx: SaleDocContext) => boolean;
  build: (ctx: SaleDocContext) => BuiltDocument;
  /** Texto usado ao enviar por WhatsApp ou e-mail */
  message: (ctx: SaleDocContext) => string;
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dateBR = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const storeNameOf = (ctx: SaleDocContext) => ctx.theme?.display_name || ctx.tenant.trade_name;

// Liga o documento ao modelo próprio da loja (quando houver) com os dados da venda
const withSaleTemplate = (built: BuiltDocument, ctx: SaleDocContext, type: TenantDocumentType): BuiltDocument => ({
  ...built,
  template: {
    tenantId: ctx.tenant.id,
    type,
    values: saleTemplateValues(ctx.sale, ctx.tenant, ctx.theme, ctx.customer, ctx.sellerName)
  }
});

const warrantyEntries = (sale: Sale): WarrantyTermEntry[] =>
  (sale.items || [])
    .filter(it => it.item_type === 'device' && it.device_id && !it.returned_at)
    .map(item => ({
      item,
      device: store.devices.find(d => d.id === item.device_id)!,
      warranty: store.warranties.find(w => w.sale_item_id === item.id)
    }))
    .filter(e => Boolean(e.device));

const tradeInOf = (sale: Sale): TradeIn | undefined =>
  sale.trade_in_id ? store.tradeIns.find(t => t.id === sale.trade_in_id) : undefined;

const ordersOf = (sale: Sale): ServiceOrder[] =>
  store.serviceOrders.filter(o => o.tenant_id === sale.tenant_id && o.sale_id === sale.id);

// Cabeçalho simples e comum aos documentos gerados aqui
function header(doc: jsPDF, ctx: SaleDocContext, title: string): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(storeNameOf(ctx).toUpperCase(), 14, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const address = [ctx.tenant.address_street, ctx.tenant.address_number].filter(Boolean).join(', ');
  const city = [ctx.tenant.address_city, ctx.tenant.address_state].filter(Boolean).join('/');
  doc.text(`${address}${city ? ` - ${city}` : ''} | Tel: ${ctx.tenant.phone}`, 14, 23.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 27, 196, 27);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 36);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  return 44;
}

function buildUpgradeDeclaration(ctx: SaleDocContext): BuiltDocument {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const tradeIn = tradeInOf(ctx.sale)!;
  const received = store.devices.find(d => d.id === tradeIn.received_device_id);
  const sold = store.devices.find(d => d.id === tradeIn.sold_device_id);
  let y = header(doc, ctx, `DECLARAÇÃO DE UPGRADE — VENDA Nº ${ctx.sale.sale_number}`);

  const paragraphs = [
    `Eu, ${ctx.customer?.name || '______________________________'}, CPF ${ctx.customer?.cpf || '________________'}, declaro que entreguei à ${storeNameOf(ctx)}, em ${dateBR(ctx.sale.created_at)}, o aparelho abaixo identificado como parte do pagamento da compra registrada na venda nº ${ctx.sale.sale_number}.`,
    `Aparelho entregue: ${received ? `${received.brand} ${received.model} ${received.storage_capacity}, cor ${received.color}` : '—'}. IMEI: ${received?.imei || '—'}. Valor de avaliação: ${brl(tradeIn.appraisal_value)}.`,
    `Aparelho adquirido: ${sold ? `${sold.brand} ${sold.model} ${sold.storage_capacity}, cor ${sold.color}` : '—'}. IMEI: ${sold?.imei || '—'}. Valor: ${brl(tradeIn.sold_device_price)}. Diferença paga: ${brl(Math.max(0, Number(tradeIn.difference_amount)))}.`,
    'Declaro ser o legítimo proprietário do aparelho entregue, que ele tem origem lícita, não possui restrição, bloqueio ou alerta de perda, roubo ou furto, e que removi contas, senhas e bloqueios de ativação, transferindo sua propriedade à loja.'
  ];
  if (received?.physical_condition_notes) paragraphs.push(`Observações sobre o aparelho entregue: ${received.physical_condition_notes}`);

  paragraphs.forEach(p => {
    const lines: string[] = doc.splitTextToSize(p, 182);
    doc.text(lines, 14, y);
    y += lines.length * 5 + 4;
  });

  y += 16;
  doc.line(14, y, 96, y);
  doc.line(114, y, 196, y);
  doc.setFontSize(8.5);
  doc.text('Assinatura do cliente', 14, y + 4.5);
  doc.text(`Responsável pela loja: ${ctx.sellerName}`, 114, y + 4.5);

  return withSaleTemplate({ doc, fileName: `Declaracao_de_Upgrade_Venda_${ctx.sale.sale_number}.pdf` }, ctx, 'upgrade_contract');
}

function buildServiceOrders(ctx: SaleDocContext): BuiltDocument {
  const orders = ordersOf(ctx.sale);
  const built = buildServiceOrderPDF(orders, ctx.tenant, ctx.theme);
  return {
    doc: built.doc,
    fileName: `Ordem_de_Servico_Venda_${ctx.sale.sale_number}.pdf`,
    // O modelo da loja comporta uma OS por documento
    template: orders.length === 1
      ? { tenantId: ctx.tenant.id, type: 'service_order', values: serviceOrderTemplateValues(orders[0], ctx.tenant, ctx.theme) }
      : undefined
  };
}

export const SALE_DOCUMENTS: SaleDocumentDef[] = [
  {
    id: 'warranty-term',
    label: 'Termo de Garantia',
    description: 'Modelo oficial da loja, preenchido com os dados da venda',
    isAvailable: (ctx) => warrantyEntries(ctx.sale).length > 0,
    build: (ctx) => withSaleTemplate(buildWarrantyTermPDF({ ...ctx, entries: warrantyEntries(ctx.sale) }), ctx, 'warranty_term'),
    message: (ctx) => {
      const lines = warrantyEntries(ctx.sale).map(e =>
        `- ${e.device.brand} ${e.device.model} (IMEI ${e.device.imei})` +
        (e.warranty ? `: vigência de ${dateBR(e.warranty.start_date + 'T12:00:00')} até ${dateBR(e.warranty.end_date + 'T12:00:00')}` : '')
      );
      return `Olá ${ctx.customer?.name || ''}, segue o Termo de Garantia da sua compra na ${storeNameOf(ctx)} (venda nº ${ctx.sale.sale_number}):\n${lines.join('\n')}`;
    }
  },
  {
    id: 'receipt',
    label: 'Comprovante da Venda',
    description: 'Itens, valores e garantia de cada aparelho',
    isAvailable: () => true,
    build: (ctx) => withSaleTemplate(
      buildReceiptPDF(ctx.sale, ctx.tenant, ctx.sellerName, ctx.customer?.name || 'Cliente', ctx.theme), ctx, 'sale_receipt'
    ),
    message: (ctx) =>
      `Olá ${ctx.customer?.name || ''}, segue o comprovante da sua compra na ${storeNameOf(ctx)} (venda nº ${ctx.sale.sale_number}, total ${brl(ctx.sale.total_amount)}).`
  },
  {
    id: 'upgrade-declaration',
    label: 'Declaração de Upgrade',
    description: 'Aparelho recebido como parte do pagamento',
    isAvailable: (ctx) => Boolean(tradeInOf(ctx.sale)),
    build: buildUpgradeDeclaration,
    message: (ctx) =>
      `Olá ${ctx.customer?.name || ''}, segue a declaração do aparelho entregue no upgrade (venda nº ${ctx.sale.sale_number}) na ${storeNameOf(ctx)}.`
  },
  {
    id: 'service-order',
    label: 'Ordem de Serviço',
    description: 'Atendimentos de assistência ligados a esta venda',
    isAvailable: (ctx) => ordersOf(ctx.sale).length > 0,
    build: buildServiceOrders,
    message: (ctx) =>
      `Olá ${ctx.customer?.name || ''}, segue a ordem de serviço ligada à sua compra na ${storeNameOf(ctx)} (venda nº ${ctx.sale.sale_number}).`
  }
];

export const getSaleContext = (sale: Sale, tenant: Tenant, theme?: TenantTheme): SaleDocContext => ({
  sale,
  tenant,
  theme,
  customer: store.customers.find(c => c.id === sale.customer_id),
  sellerName: store.profiles.find(p => p.id === sale.seller_id)?.full_name || 'Vendedor'
});

export const getAvailableDocuments = (ctx: SaleDocContext) => SALE_DOCUMENTS.filter(d => d.isAvailable(ctx));

/** Executa a ação e devolve uma mensagem curta para a tela (vazia quando não há o que avisar). */
export async function runDocumentAction(def: SaleDocumentDef, ctx: SaleDocContext, action: DocumentAction): Promise<string> {
  return runBuiltDocumentAction(def.build(ctx), action, {
    text: def.message(ctx),
    subject: `${def.label} - venda nº ${ctx.sale.sale_number}`,
    phone: ctx.customer?.whatsapp || ctx.customer?.phone,
    email: ctx.customer?.email
  });
}
