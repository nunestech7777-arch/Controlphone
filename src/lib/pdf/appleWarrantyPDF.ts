// ============================================================================
// CONTROLPHONE — PÁGINAS DO TERMO DE GARANTIA APPLE (1 ANO) NO PDF
// Anexadas ao comprovante de venda do aparelho Apple lacrado, no mesmo arquivo:
// parte 1 é o comprovante (inalterado); parte 2 começa em página nova, com a
// identificação da venda e do aparelho e o texto integral da versão gravada
// na venda. Quebras de página por linha: nenhuma cláusula é cortada.
// ============================================================================

import { jsPDF } from 'jspdf';
import { Customer, Sale, Tenant, TenantTheme } from '../../types';
import { appleWarrantyVersion, isAppleSealedItem, APPLE_WARRANTY_COMPONENT_TITLE } from '../appleWarranty';
import { soldDeviceInfo } from './sealedReceiptPDF';
import { store } from '../store';

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
export const saleHasAppleWarranty = (sale: Sale) =>
  Boolean(sale.apple_warranty) && (sale.items || []).some(it => !it.returned_at && isAppleSealedItem(it));

/** Escreve as páginas do termo no documento (a partir de uma página nova). */
export function writeAppleWarrantyPages(doc: jsPDF, input: AppleWarrantyPdfInput, startOnNewPage = true): void {
  const { sale, tenant, theme, customer, sellerName } = input;
  const record = sale.apple_warranty;
  const term = appleWarrantyVersion(record?.version);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - MARGIN * 2;
  const bottom = pageH - 16;
  const firstPage = startOnNewPage ? doc.getNumberOfPages() + 1 : doc.getNumberOfPages();
  if (startOnNewPage) doc.addPage();
  let y = 18;

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
  write(APPLE_WARRANTY_COMPONENT_TITLE.toUpperCase(), { size: 9, bold: true, color: [100, 116, 139], gap: 2 });
  write(term.title, { size: 15, bold: true, color: [15, 23, 42], lineH: 7 });
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
    `Termo apresentado: ${term.title} — ${term.subtitle} (versão ${term.version})`,
    record?.acknowledged_at
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

  // ---- Rodapé de cada página do termo (paginação própria do anexo)
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

/** Só o termo, em um PDF próprio (anexado ao modelo da loja quando ela usa comprovante personalizado). */
export function buildAppleWarrantyDoc(input: AppleWarrantyPdfInput): jsPDF {
  const doc = new jsPDF();
  writeAppleWarrantyPages(doc, input, false);
  return doc;
}
