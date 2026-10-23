// ============================================================================
// CONTROLPHONE — TERMO DE GARANTIA APPLE (1 ANO) EM PDF
// Documento próprio, separado do comprovante de venda do aparelho Apple lacrado:
// identificação da venda, do cliente e do aparelho e o texto integral da versão
// gravada na venda. Quebras de página por linha: nenhuma cláusula é cortada.
// ============================================================================

import { jsPDF } from 'jspdf';
import { Customer, Sale, Tenant, TenantTheme } from '../../types';
import { appleWarrantyVersion, isAppleSealedItem } from '../appleWarranty';
import { soldDeviceInfo } from './sealedReceiptPDF';
import { store } from '../store';
import { drawProportionalLogo } from './pdfLogo';

export interface AppleWarrantyPdfInput {
  sale: Sale;
  tenant: Tenant;
  theme?: TenantTheme;
  customer?: Customer;
  sellerName: string;
}

const MARGIN = 16;
const dateTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/** A venda leva o termo Apple? (só com o registro gravado na venda e aparelho Apple lacrado ativo) */
// Vale também para vendas de iPhone lacrado anteriores ao registro do termo, quando a venda guarda os
// dados do aparelho: o PDF sai com a versão atual e informa que foi emitido depois, não apresentado na venda.
export const saleHasAppleWarranty = (sale: Sale) =>
  sale.status !== 'cancelled' && (sale.items || []).some(it => !it.returned_at && isAppleSealedItem(it));

/** Escreve o termo no documento, a partir da página atual. */
function writeAppleWarrantyPages(doc: jsPDF, input: AppleWarrantyPdfInput): void {
  const { sale, tenant, theme, customer, sellerName } = input;
  const record = sale.apple_warranty;
  const term = appleWarrantyVersion(record?.version);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - MARGIN * 2;
  const bottom = pageH - 16;
  const firstPage = doc.getNumberOfPages();

  // Cabeçalho: logo da empresa (quando configurada)
  const logoUrl = theme?.logo_url || theme?.logo_compact_url;
  const { rendered, nextY: yLogo } = drawProportionalLogo(doc, logoUrl, {
    x: MARGIN,
    y: 12,
    maxWidth: 44,
    maxHeight: 18,
    spacingAfter: 5,
    defaultY: 18
  });
  let y = rendered ? yLogo : 18;

  const ensure = (h: number) => {
    if (y + h > bottom) { doc.addPage(); y = 18; }
  };
  const write = (text: string, opts: { size: number; bold?: boolean; color?: [number, number, number]; gap?: number; lineH?: number }) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size);
    doc.setTextColor(...(opts.color || [30, 41, 59]));
    const lineH = opts.lineH ?? opts.size * 0.45;
    const lines = doc.splitTextToSize(text, width) as string[];
    lines.forEach(line => {
      ensure(lineH);
      doc.text(line, MARGIN, y);
      y += lineH;
    });
    y += opts.gap ?? 0;
  };

  // ---- Título e identificação da venda e do aparelho
  write('Termo de Garantia — Apple', { size: 16, bold: true, color: [15, 23, 42], lineH: 7.5 });
  write(term.title, { size: 12.5, bold: true, color: [30, 41, 59], lineH: 6 });
  write(term.subtitle, { size: 10.5, color: [51, 65, 85], gap: 4, lineH: 5.5 });

  const apple = (sale.items || []).filter(it => !it.returned_at && isAppleSealedItem(it));
  const storeName = theme?.display_name || tenant.trade_name;
  const ident = [
    `Venda nº ${sale.sale_number} — ${storeName} — Data da venda: ${dateTime(sale.created_at)}`,
    `Cliente: ${customer?.name || 'Cliente'} — Vendedor: ${sellerName}`
  ];
  const boxLines = [
    ...ident,
    ...apple.map(it => {
      const d = soldDeviceInfo(it);
      return d ? `Aparelho: ${d.brand} ${d.model} — Capacidade: ${d.storage_capacity} — Cor: ${d.color} — IMEI: ${d.imei}` : 'Aparelho Apple lacrado';
    }),
    `Termo: ${term.title} — ${term.subtitle} (versão ${term.version})`,
    !record
      ? `Termo emitido em ${dateTime(new Date().toISOString())}, depois da venda (venda registrada antes da apresentação do termo no sistema). Não implica renúncia a direitos legais.`
      : record.acknowledged_at
        ? `Ciência registrada em ${dateTime(record.acknowledged_at)} por ${store.profiles.find(p => p.id === record.acknowledged_by)?.full_name || sellerName}. A ciência confirma apenas que este documento foi apresentado ao cliente; não implica renúncia a direitos legais.`
        : 'Documento apresentado ao cliente na venda. A apresentação não implica renúncia a direitos legais.'
  ];
  doc.setFontSize(8.5);
  const wrapped = boxLines.flatMap(l => doc.splitTextToSize(l, width - 6) as string[]);
  const boxH = wrapped.length * 4.2 + 6;
  ensure(boxH);
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(MARGIN, y - 4, width, boxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  wrapped.forEach((line, i) => doc.text(line, MARGIN + 3, y + 1 + i * 4.2));
  y += boxH + 4;

  // ---- Texto integral, seção por seção
  term.sections.forEach(section => {
    if (section.heading) {
      ensure(14); // título nunca fica sozinho no pé da página
      write(section.heading, { size: 9.5, bold: true, color: [15, 23, 42], gap: 1.5, lineH: 4.6 });
    }
    section.paragraphs.forEach(p => write(p, { size: 8.6, gap: 2.4, lineH: 3.9 }));
    y += 2;
  });

  // ---- Rodapé de cada página
  const last = doc.getNumberOfPages();
  const total = last - firstPage + 1;
  for (let p = firstPage; p <= last; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Garantia Apple — Venda nº ${sale.sale_number} — Página ${p - firstPage + 1} de ${total}`, pageW / 2, pageH - 8, { align: 'center' });
  }
  doc.setPage(last);
}

/** PDF do Termo de Garantia Apple da venda (independente do comprovante). */
export function buildAppleWarrantyDoc(input: AppleWarrantyPdfInput): jsPDF {
  const doc = new jsPDF();
  writeAppleWarrantyPages(doc, input);
  return doc;
}
