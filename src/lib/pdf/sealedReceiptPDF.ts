// ============================================================================
// CONTROLPHONE — COMPROVANTE DE VENDA DE APARELHO NOVO E LACRADO (PDF)
// Usado automaticamente quando a venda tem aparelho classificado como lacrado.
// Não leva os termos da garantia comercial dos seminovos: no rodapé vão os dois
// avisos obrigatórios (garantia do fabricante e cupom não fiscal).
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawProportionalLogo } from './pdfLogo';
import { Customer, Sale, SaleItem, Tenant, TenantTheme } from '../../types';
import { store } from '../store';
import { PAYMENT_METHOD_LABELS, formatBRL as brl } from '../labels';
import { saleInterest, saleRevenue } from '../saleFinance';

/** Avisos obrigatórios no rodapé do comprovante de lacrado (não editáveis pela loja). */
export const SEALED_RECEIPT_NOTICES = [
  'Este aparelho é comercializado como novo e lacrado. A garantia contratual oferecida pelo fabricante deverá ser acionada diretamente em seus canais oficiais, conforme suas condições e prazos, sem prejuízo dos direitos legais do consumidor e das responsabilidades do fornecedor previstas em lei.',
  'Este documento é um comprovante comercial de venda, não possui valor fiscal e não substitui a Nota Fiscal.'
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const n = (i: number, fallback: number) => parseInt(full.substring(i, i + 2), 16) || fallback;
  return [n(0, 24), n(2, 69), n(4, 232)];
}

/** Identificação do aparelho como estava no momento da venda (retrato gravado na venda). */
export const soldDeviceInfo = (item: SaleItem) => {
  const live = store.devices.find(d => d.id === item.device_id);
  return item.device_info || (live
    ? { brand: live.brand, model: live.model, storage_capacity: live.storage_capacity, color: live.color, imei: live.imei }
    : undefined);
};

export interface SealedReceiptInput {
  sale: Sale;
  tenant: Tenant;
  theme?: TenantTheme;
  customer?: Customer;
  sellerName: string;
  /** Itens deste comprovante (aparelhos lacrados e, quando não há seminovo na venda, acessórios) */
  items: SaleItem[];
  includeGifts: boolean;
}

export function buildSealedReceiptPDF(input: SealedReceiptInput): { doc: jsPDF; fileName: string } {
  const { sale, tenant, theme, customer, sellerName, items } = input;
  const doc = new jsPDF();
  const primary = hexToRgb(theme?.primary_color || '#1845E8');
  const storeName = theme?.display_name || tenant.trade_name;
  const pageHeight = doc.internal.pageSize.getHeight();

  // ---- Loja
  const { rendered, nextY: yLoja } = drawProportionalLogo(doc, theme?.logo_url, {
    x: 14,
    y: 10,
    maxWidth: 48,
    maxHeight: 24,
    spacingAfter: 5,
    defaultY: 18
  });
  let y = yLoja;

  // Se não houver logo cadastrada, exibe o nome da loja em texto em destaque
  if (!rendered) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(primary[0], primary[1], primary[2]);
    doc.text(storeName.toUpperCase(), 14, y);
    y += 6;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const legal = [
    tenant.name && tenant.name !== storeName ? tenant.name : '',
    tenant.cnpj ? `CNPJ: ${tenant.cnpj}` : ''
  ].filter(Boolean).join(' | ');
  const street = [tenant.address_street, tenant.address_number].filter(Boolean).join(', ');
  const city = [tenant.address_neighborhood, [tenant.address_city, tenant.address_state].filter(Boolean).join('/')].filter(Boolean).join(' - ');
  const storeLines = [
    legal,
    `Endereço: ${[street, city].filter(Boolean).join(' - ') || 'Não informado'}`,
    `Telefone: ${tenant.phone || 'Não informado'}`
  ].filter(Boolean);
  doc.text(storeLines, 14, y);
  y += storeLines.length * 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(14, y + 2, 196, y + 2);
  y += 2;

  // ---- Venda
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`COMPROVANTE DE VENDA Nº ${sale.sale_number} — APARELHO LACRADO`, 14, y);
  if (sale.status === 'cancelled') {
    doc.setTextColor(220, 38, 38);
    doc.text('VENDA CANCELADA', 196, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Cancelada em ${sale.cancelled_at ? new Date(sale.cancelled_at).toLocaleDateString('pt-BR') : '—'}. Este documento não comprova compra.`,
      196, y + 5, { align: 'right' }
    );
    doc.setTextColor(15, 23, 42);
  }

  const created = new Date(sale.created_at);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text([
    `Data: ${created.toLocaleDateString('pt-BR')}   Horário: ${created.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    `Vendedor responsável: ${sellerName}`
  ], 14, y + 6);

  // ---- Cliente
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente', 120, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text([
    customer?.name || 'Cliente',
    customer?.cpf ? `CPF/CNPJ: ${customer.cpf}` : '',
    customer?.phone ? `Telefone: ${customer.phone}` : ''
  ].filter(Boolean), 120, y + 10.5);
  y += 24;

  // ---- Aparelhos (e acessórios, quando vierem neste comprovante)
  const rows: (string | number)[][] = items.map(item => {
    if (item.item_type === 'device') {
      const info = soldDeviceInfo(item);
      return [
        info?.brand || '', info?.model || 'Aparelho', info?.storage_capacity || '', info?.color || '', info?.imei || '—',
        item.device_type === 'lacrado' ? 'LACRADO' : 'SEMINOVO',
        brl(Number(item.unit_price)), brl(Number(item.discount)), brl(Number(item.total_price))
      ];
    }
    const name = store.accessories.find(a => a.id === item.accessory_id)?.name || 'Acessório';
    return [`${item.quantity}x ${name}`, '', '', '', '', 'ACESSÓRIO', brl(Number(item.unit_price)), brl(Number(item.discount)), brl(Number(item.total_price))];
  });
  if (input.includeGifts) {
    (sale.gifts || []).forEach(g => {
      const name = store.gifts.find(x => x.id === g.gift_id)?.name || 'Cortesia';
      rows.push([`${g.quantity}x ${name}`, '', '', '', '', 'BRINDE', brl(0), brl(0), brl(0)]);
    });
  }
  autoTable(doc, {
    startY: y,
    head: [['Marca', 'Modelo', 'Armaz.', 'Cor', 'IMEI', 'Tipo', 'Valor', 'Desc.', 'Total']],
    body: rows,
    theme: 'grid',
    headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    styles: { fontSize: 7.8, cellPadding: 2.4 },
    columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } }
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // ---- Valores e pagamento
  const value = items.reduce((acc, i) => acc + Number(i.unit_price) * Number(i.quantity || 1), 0);
  const discount = items.reduce((acc, i) => acc + Number(i.discount || 0), 0);
  const total = items.reduce((acc, i) => acc + Number(i.total_price), 0);
  const tradeCredit = (sale.payments || []).filter(p => p.payment_method === 'trade_in_credit').reduce((acc, p) => acc + Number(p.amount), 0);
  const wholeSale = Math.abs(total - Number(sale.total_amount)) < 0.005;
  const interest = saleInterest(sale);

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  const money: string[] = [`Valor do aparelho: ${brl(value)}`];
  if (discount > 0) money.push(`Desconto: - ${brl(discount)}`);
  // juros da maquininha: cobrados na venda inteira (no comprovante só desta parte, não entram)
  if (interest > 0 && wholeSale) money.push(`Valor dos produtos: ${brl(total)}`, `Juros da maquininha: ${brl(interest)}`);
  if (tradeCredit > 0 && wholeSale) money.push(`Aparelho recebido no upgrade: - ${brl(tradeCredit)}`);
  doc.setFont('helvetica', 'normal');
  doc.text(money, 120, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(primary[0], primary[1], primary[2]);
  const paid = wholeSale ? saleRevenue(sale) - tradeCredit : total;
  doc.text(`VALOR TOTAL PAGO: ${brl(paid)}`, 120, y + money.length * 4.6 + 3);
  if (!wholeSale) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Total da venda nº ${sale.sale_number}, com os demais itens${interest > 0 ? ' e os juros da maquininha' : ''}: ${brl(saleRevenue(sale))}`, 120, y + money.length * 4.6 + 8);
  }

  const payments = (sale.payments || [])
    .filter(p => p.payment_method !== 'trade_in_credit')
    .map(p => `${PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}${p.installments > 1 ? ` (${p.installments}x)` : ''}: ${brl(Number(p.amount))}${Number(p.interest) > 0 ? ` (inclui ${brl(Number(p.interest))} de juros)` : ''}`);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(['Forma de pagamento:', ...(payments.length ? payments : ['—'])], 14, y);
  y += Math.max(money.length * 4.6 + 14, (payments.length + 1) * 4 + 6);

  // ---- Observações da loja (texto definido pelo administrador no momento da venda)
  if (sale.sealed_receipt_notes) {
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    const lines: string[] = doc.splitTextToSize(`Observações: ${sale.sealed_receipt_notes}`, 182);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 4;
  }

  // ---- Rodapé obrigatório (letra menor, legível), sempre no fim da página
  doc.setFontSize(7.5);
  const footer = SEALED_RECEIPT_NOTICES.map(text => doc.splitTextToSize(text, 182) as string[]);
  const footerHeight = footer.reduce((acc, lines) => acc + lines.length * 3.4 + 2.5, 0) + 4;
  let footerY = pageHeight - 12 - footerHeight;
  if (footerY < y) {
    doc.addPage();
    footerY = 20;
  }
  doc.setDrawColor(226, 232, 240);
  doc.line(14, footerY, 196, footerY);
  footerY += 5;
  doc.setTextColor(71, 85, 105);
  footer.forEach(lines => {
    doc.text(lines, 14, footerY);
    footerY += lines.length * 3.4 + 2.5;
  });

  return { doc, fileName: `Comprovante_Lacrado_${storeName.replace(/\s+/g, '_')}_${sale.sale_number}.pdf` };
}
