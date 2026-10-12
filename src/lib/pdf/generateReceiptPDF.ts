// ============================================================================
// CONTROLPHONE — COMPROVANTE DE VENDA WHITE LABEL EM PDF
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, Tenant, TenantTheme } from '../../types';
import { store } from '../store';
import { formatDay, CDC_NOTICE } from '../warrantyStatus';
import { PAYMENT_METHOD_LABELS, formatBRL as brl } from '../labels';

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

// Monta o comprovante e devolve o documento (a saída — baixar, ver, imprimir — fica com quem chama)
export const buildReceiptPDF = (
  sale: Sale,
  tenant: Tenant,
  sellerName: string,
  customerName: string,
  theme?: TenantTheme
): { doc: jsPDF; fileName: string } => {
  const doc = new jsPDF();
  const primaryRgb = hexToRgb(theme?.primary_color || '#1845E8');
  const storeName = theme?.display_name || tenant.trade_name;

  let headerY = 20;

  // Se tiver logo configurada
  if (theme?.logo_url && theme.logo_url.startsWith('data:image')) {
    try {
      doc.addImage(theme.logo_url, 'PNG', 14, 12, 38, 14);
      headerY = 32;
    } catch (e) {
      console.warn('Erro ao carregar logo no PDF:', e);
    }
  }

  // Nome da loja em destaque (sem menção a Controlphone)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.text(storeName.toUpperCase(), 14, headerY);

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.text(`CNPJ: ${tenant.cnpj || 'Não informado'} | Tel: ${tenant.phone}`, 14, headerY + 6);
  const street = [tenant.address_street, tenant.address_number].filter(Boolean).join(', ');
  const city = [tenant.address_city, tenant.address_state].filter(Boolean).join('/');
  doc.text(`Endereço: ${[street, city].filter(Boolean).join(' - ') || 'Não informado'}`, 14, headerY + 11);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, headerY + 15, 196, headerY + 15);

  // Título do Documento
  const startInfoY = headerY + 22;
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
  const tableRows = (sale.items || []).map((item, idx) => [
    idx + 1,
    item.item_type === 'device'
      ? `Aparelho: ${deviceOf(item.device_id)?.brand || ''} ${deviceOf(item.device_id)?.model || 'Smartphone'} (${deviceOf(item.device_id)?.storage_capacity || ''} - ${deviceOf(item.device_id)?.color || ''}) | IMEI ${deviceOf(item.device_id)?.imei || 'não informado'}${item.returned_at ? ' [trocado/devolvido]' : ''}`
      : `Acessório: ${item.accessory?.name || store.accessories.find(a => a.id === item.accessory_id)?.name || 'Item'}`,
    item.quantity,
    `${brl(Number(item.unit_price))}`,
    `${brl(Number(item.discount))}`,
    `${brl(Number(item.total_price))}`
  ]);

  // Brindes inclusos
  (sale.gifts || []).forEach((g, idx) => {
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

  const finalY = (doc as any).lastAutoTable.finalY + 10;

  // Totais e Pagamentos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Subtotal: ${brl(Number(sale.subtotal))}`, 130, finalY);
  if (Number(sale.discount_amount) > 0) {
    doc.text(`Desconto: - ${brl(Number(sale.discount_amount))}`, 130, finalY + 5);
  }
  // Upgrade: o aparelho recebido entra como parte do pagamento (aparece como abatimento)
  const tradeCredit = (sale.payments || [])
    .filter(p => p.payment_method === 'trade_in_credit')
    .reduce((acc, p) => acc + Number(p.amount), 0);
  let totalLineY = finalY + 12;
  if (tradeCredit > 0) {
    const received = store.tradeIns.find(t => t.id === sale.trade_in_id);
    const receivedDev = store.devices.find(d => d.id === received?.received_device_id);
    doc.setFontSize(8.5);
    doc.text(
      `Aparelho recebido${receivedDev ? ` (${receivedDev.model}, IMEI ${receivedDev.imei})` : ''}: - ${brl(tradeCredit)}`,
      130, finalY + 10, { maxWidth: 66 }
    );
    totalLineY = finalY + 20;
  }
  const amountPaid = Number(sale.total_amount) - tradeCredit;
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.setFontSize(11);
  doc.text(`TOTAL PAGO: ${brl(amountPaid)}`, 130, totalLineY);

  // Formas de pagamento (o aparelho recebido no upgrade já aparece acima como abatimento)
  const paymentLines = (sale.payments || [])
    .filter(p => p.payment_method !== 'trade_in_credit')
    .map(p => `${PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}${p.installments > 1 ? ` (${p.installments}x)` : ''}: ${brl(Number(p.amount))}`);
  if (paymentLines.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(['Pagamento:', ...paymentLines], 14, finalY);
    doc.setFont('helvetica', 'bold');
  }
  const paymentBlockEnd = finalY + (paymentLines.length + 1) * 4;

  // GARANTIA COMERCIAL INDIVIDUAL DE CADA APARELHO (sem custos, lucros ou margens)
  const afterTotals = Math.max(finalY + (tradeCredit > 0 ? 28 : 20), paymentBlockEnd + 4);
  let footerY = afterTotals + 8;
  const warranties = store.warranties.filter(w => w.sale_id === sale.id);
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
