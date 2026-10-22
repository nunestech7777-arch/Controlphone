// ============================================================================
// CONTROLPHONE — COMPROVANTE DE VENDA WHITE LABEL EM PDF
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawProportionalLogo } from './pdfLogo';
import { Sale, SaleItem, Tenant, TenantTheme } from '../../types';
import { store } from '../store';
import { formatDay, CDC_NOTICE } from '../warrantyStatus';
import { PAYMENT_METHOD_LABELS, formatBRL as brl } from '../labels';
import { soldDeviceInfo } from './sealedReceiptPDF';
import { saleInterest, saleRevenue } from '../saleFinance';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return [r, g, b];
  }
  const r = parseInt(clean.substring(0, 2), 16) || 24;
  const g = parseInt(clean.substring(2, 4), 16) || 69;
  const b = parseInt(clean.substring(4, 6), 16) || 232;
  return [r, g, b];
}

// Venda que também tem aparelho lacrado: este comprovante (seminovo) lista só os demais itens
export interface ReceiptScope {
  items: SaleItem[];
  includeGifts: boolean;
}

// Monta o comprovante e devolve o documento (a saída — baixar, ver, imprimir — fica com quem chama)
export const buildReceiptPDF = (
  sale: Sale,
  tenant: Tenant,
  sellerName: string,
  customerName: string,
  theme?: TenantTheme,
  scope?: ReceiptScope
): { doc: jsPDF; fileName: string } => {
  const doc = new jsPDF();
  const listed = scope ? scope.items : (sale.items || []);
  const partial = Boolean(scope) && listed.length !== (sale.items || []).length;
  const primaryRgb = hexToRgb(theme?.primary_color || '#1845E8');
  const storeName = theme?.display_name || tenant.trade_name;

  // Se tiver logo configurada, posiciona proporcionalmente
  const { rendered, nextY: logoNextY } = drawProportionalLogo(doc, theme?.logo_url, {
    x: 14,
    y: 10,
    maxWidth: 48,
    maxHeight: 24,
    spacingAfter: 5,
    defaultY: 20
  });

  let headerY = logoNextY;

  // Se não houver logo configurada, exibe o nome da loja em texto em destaque
  if (!rendered) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
    doc.text(storeName.toUpperCase(), 14, headerY);
    headerY += 6;
  }

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`CNPJ: ${tenant.cnpj || 'Não informado'} | Tel: ${tenant.phone}`, 14, headerY);
  const street = [tenant.address_street, tenant.address_number].filter(Boolean).join(', ');
  const city = [tenant.address_city, tenant.address_state].filter(Boolean).join('/');
  doc.text(`Endereço: ${[street, city].filter(Boolean).join(' - ') || 'Não informado'}`, 14, headerY + 5);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, headerY + 9, 196, headerY + 9);

  // Título do Documento
  const startInfoY = headerY + 16;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`COMPROVANTE DE VENDA Nº ${sale.sale_number}`, 14, startInfoY);
  // Venda cancelada nunca sai com aparência de comprovante válido
  if (sale.status === 'cancelled') {
    doc.setTextColor(220, 38, 38);
    doc.text('VENDA CANCELADA', 196, startInfoY, { align: 'right' });
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Cancelada em ${sale.cancelled_at ? new Date(sale.cancelled_at).toLocaleDateString('pt-BR') : '—'}. Este documento não comprova compra nem garantia.`,
      196, startInfoY + 6, { align: 'right' }
    );
    doc.setTextColor(15, 23, 42);
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Data: ${new Date(sale.created_at).toLocaleString('pt-BR')}`, 14, startInfoY + 6);
  doc.text(`Vendedor Responsável: ${sellerName}`, 14, startInfoY + 11);
  const customer = store.customers.find(c => c.id === sale.customer_id);
  doc.text(`Cliente: ${customerName}${customer?.cpf ? ` | CPF: ${customer.cpf}` : ''}`, 14, startInfoY + 16);
  doc.text(`Origem do Atendimento: ${sale.sales_origin}`, 14, startInfoY + 21);

  // Tabela de Itens
  const deviceOf = (deviceId?: string) => store.devices.find(d => d.id === deviceId);
  // aparelho como estava no momento da venda (o cadastro pode ter sido editado depois)
  const describe = (item: SaleItem) => {
    const info = soldDeviceInfo(item);
    const type = item.device_type === 'seminovo' ? ' | Seminovo' : '';
    return `Aparelho: ${info?.brand || ''} ${info?.model || 'Smartphone'} (${info?.storage_capacity || ''} - ${info?.color || ''}) | IMEI ${info?.imei || 'não informado'}${type}${item.returned_at ? ' [trocado/devolvido]' : ''}`;
  };
  const tableRows = listed.map((item, idx) => [
    idx + 1,
    item.item_type === 'device'
      ? describe(item)
      : `Acessório: ${item.accessory?.name || store.accessories.find(a => a.id === item.accessory_id)?.name || 'Item'}`,
    item.quantity,
    `${brl(Number(item.unit_price))}`,
    `${brl(Number(item.discount))}`,
    `${brl(Number(item.total_price))}`
  ]);

  // Brindes inclusos
  (scope && !scope.includeGifts ? [] : sale.gifts || []).forEach((g, idx) => {
    tableRows.push([
      `B${idx + 1}`,
      `BRINDE: ${g.gift?.name || store.gifts.find(x => x.id === g.gift_id)?.name || 'Cortesia'}`,
      g.quantity,
      brl(0),
      brl(0),
      brl(0)
    ]);
  });

  autoTable(doc, {
    startY: startInfoY + 27,
    head: [['#', 'Descrição do Item', 'Qtd', 'Preço Unit.', 'Desc.', 'Total']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: primaryRgb,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5
    },
    styles: { fontSize: 8, cellPadding: 3 },
  });

  let finalY = (doc as any).lastAutoTable.finalY + 10;

  // Venda com aparelho lacrado: os demais itens têm comprovante próprio; os totais abaixo são da venda inteira
  if (partial) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    const listedTotal = listed.reduce((acc, i) => acc + Number(i.total_price), 0);
    doc.text(
      `Itens deste comprovante: ${brl(listedTotal)}. Esta venda também tem aparelho lacrado, com comprovante próprio; os valores abaixo são da venda completa.`,
      14, finalY - 3, { maxWidth: 182 }
    );
    finalY += 6;
  }

  // Totais e Pagamentos (sem custos, lucros ou margens)
  const interest = saleInterest(sale);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  let rightY = finalY;
  doc.text(`Subtotal: ${brl(Number(sale.subtotal))}`, 130, rightY);
  if (Number(sale.discount_amount) > 0) {
    rightY += 5;
    doc.text(`Desconto: - ${brl(Number(sale.discount_amount))}`, 130, rightY);
  }
  // Cartão de crédito com juros: produtos e juros da maquininha aparecem separados
  if (interest > 0) {
    rightY += 5;
    doc.text(`Valor dos produtos: ${brl(Number(sale.total_amount))}`, 130, rightY);
    rightY += 5;
    doc.text(`Juros da maquininha: ${brl(interest)}`, 130, rightY);
  }
  // Upgrade: o aparelho recebido entra como parte do pagamento (aparece como abatimento)
  const tradeCredit = (sale.payments || [])
    .filter(p => p.payment_method === 'trade_in_credit')
    .reduce((acc, p) => acc + Number(p.amount), 0);
  if (tradeCredit > 0) {
    const received = store.tradeIns.find(t => t.id === sale.trade_in_id);
    const receivedDev = store.devices.find(d => d.id === received?.received_device_id);
    doc.setFontSize(8.5);
    rightY += 5;
    doc.text(
      `Aparelho recebido${receivedDev ? ` (${receivedDev.model}, IMEI ${receivedDev.imei})` : ''}: - ${brl(tradeCredit)}`,
      130, rightY, { maxWidth: 66 }
    );
    rightY += 5;
  }
  // o total pago é exatamente o que foi cobrado do cliente (inclui os juros do cartão)
  const amountPaid = saleRevenue(sale) - tradeCredit;
  rightY += 7;
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.setFontSize(11);
  doc.text(`${interest > 0 ? 'VALOR TOTAL PAGO' : 'TOTAL PAGO'}: ${brl(amountPaid)}`, 130, rightY);

  // Formas de pagamento (o aparelho recebido no upgrade já aparece acima como abatimento)
  const paymentLines = (sale.payments || [])
    .filter(p => p.payment_method !== 'trade_in_credit')
    .map(p => `${PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}${p.installments > 1 ? ` (${p.installments}x)` : ''}: ${brl(Number(p.amount))}${Number(p.interest) > 0 ? ` (inclui ${brl(Number(p.interest))} de juros)` : ''}`);
  if (paymentLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(['Pagamento:', ...paymentLines], 14, finalY);
    doc.setFont('helvetica', 'bold');
  }
  const paymentBlockEnd = finalY + (paymentLines.length + 1) * 4;

  // GARANTIA COMERCIAL INDIVIDUAL DE CADA APARELHO (sem custos, lucros ou margens)
  const afterTotals = Math.max(rightY + 8, paymentBlockEnd + 4);
  let footerY = afterTotals + 8;
  // só as garantias dos aparelhos listados neste comprovante (lacrado não tem a garantia comercial de seminovo)
  const listedIds = new Set(listed.map(i => i.id));
  const warranties = store.warranties.filter(w => w.sale_id === sale.id && (!w.sale_item_id || listedIds.has(w.sale_item_id)));
  if (warranties.length > 0) {
    autoTable(doc, {
      startY: afterTotals,
      head: [['Garantia comercial — Aparelho', 'IMEI', 'Prazo', 'Início', 'Vencimento', 'Situação']],
      body: warranties.map(w => {
        const dev = deviceOf(w.device_id);
        return [
          dev ? `${dev.brand} ${dev.model}` : 'Aparelho',
          w.imei,
          `${w.warranty_days} dias`,
          formatDay(w.start_date),
          formatDay(w.end_date),
          w.status === 'cancelled' ? 'Cancelada' : 'Registrada'
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: primaryRgb, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2.5 }
    });
    footerY = (doc as any).lastAutoTable.finalY + 6;

    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'normal');
    const terms = doc.splitTextToSize(`Condições: ${warranties[0].terms}${warranties[0].terms.includes('CDC') ? '' : ' ' + CDC_NOTICE}`, 180);
    doc.text(terms, 14, footerY);
  }

  return { doc, fileName: `Comprovante_${storeName.replace(/\s+/g, '_')}_${sale.sale_number}.pdf` };
};

export const generateReceiptPDF = (
  sale: Sale,
  tenant: Tenant,
  sellerName: string,
  customerName: string,
  theme?: TenantTheme,
  mode: 'save' | 'view' | 'print' = 'save'
) => {
  const { doc, fileName } = buildReceiptPDF(sale, tenant, sellerName, customerName, theme);
  if (mode === 'save') {
    doc.save(fileName);
    return;
  }
  // Visualizar / imprimir: abre o PDF em uma nova aba (impressão automática no modo "print")
  if (mode === 'print') doc.autoPrint();
  window.open(String(doc.output('bloburl')), '_blank');
};
