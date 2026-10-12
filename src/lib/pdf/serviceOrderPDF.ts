// ============================================================================
// CONTROLPHONE — ORDEM DE SERVIÇO E ORÇAMENTO (ASSISTÊNCIA TÉCNICA)
// Documento-contrato entre a loja e o cliente. Todos os campos vêm da OS já
// cadastrada; nada precisa ser digitado de novo para gerar o PDF.
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { store } from '../store';
import { ServiceOrder, Tenant, TenantTheme } from '../../types';
import { CHECKLIST_ITEMS } from '../assistanceChecklist';
import { BuiltDocument } from './documentActions';

type RGB = [number, number, number];

const LEFT = 14;
const RIGHT = 196;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 280;
const INK: RGB = [15, 23, 42];
const MUTED: RGB = [100, 116, 139];
const LINE: RGB = [226, 232, 240];

const brl = (v?: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dateBR = (iso?: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const text = (v?: string | null) => (v && v.trim() ? v.trim() : '—');

function hexToRgb(hex?: string): RGB {
  const clean = (hex || '#1845E8').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return [parseInt(full.slice(0, 2), 16) || 24, parseInt(full.slice(2, 4), 16) || 69, parseInt(full.slice(4, 6), 16) || 232];
}

// Cláusulas da assistência (texto padrão do sistema; revise com quem responde juridicamente pela loja)
export const ASSISTANCE_TERMS: string[] = [
  'Dados do aparelho: a assistência não se responsabiliza por perda de dados, arquivos, contatos, fotos ou aplicativos. Recomenda-se que o cliente faça backup antes de entregar o aparelho.',
  'Senha: quando for necessária a senha do aparelho, ela será utilizada exclusivamente para testes e diagnóstico.',
  'Aprovação: o serviço somente será iniciado após a aprovação do orçamento pelo cliente.',
  'Prazo: o prazo informado é uma estimativa e poderá ser alterado conforme a disponibilidade de peças.',
  'Garantia do serviço: a garantia cobre apenas o serviço executado e as peças substituídas nesta ordem de serviço.',
  'Exclusões: a garantia não cobre novos danos causados por quedas, contato com líquidos, mau uso ou reparos realizados por terceiros.',
  'Oxidação: aparelhos com sinais de oxidação poderão apresentar novos defeitos durante ou após o reparo.',
  'Tela quebrada: a desmontagem de aparelhos com tela quebrada pode ocasionar o aumento dos danos já existentes.',
  'Estado do aparelho: o checklist de entrada registra a condição do aparelho no momento em que foi entregue à loja.',
  'Ciência: o cliente declara estar ciente e de acordo com as condições descritas acima.'
];

interface Ctx {
  doc: jsPDF;
  tenant: Tenant;
  theme?: TenantTheme;
  accent: RGB;
  y: number;
}

function drawHeader(c: Ctx, title: string, number: string) {
  const { doc, tenant, theme, accent } = c;
  const storeName = theme?.display_name || tenant.trade_name || tenant.name;

  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, 210, 30, 'F');

  let nameX = LEFT;
  if (theme?.logo_url && theme.logo_url.startsWith('data:image')) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(LEFT, 7, 34, 16, 2, 2, 'F');
      doc.addImage(theme.logo_url, 'PNG', LEFT + 2, 9, 30, 12);
      nameX = LEFT + 39;
    } catch { /* logo inválida: segue sem ela */ }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(String(doc.splitTextToSize(storeName, 96)[0]), nameX, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const address = [tenant.address_street, tenant.address_number].filter(Boolean).join(', ');
  const city = [tenant.address_city, tenant.address_state].filter(Boolean).join('/');
  doc.text(`CNPJ: ${text(tenant.cnpj)}`, nameX, 19);
  doc.text(String(doc.splitTextToSize(`${address}${city ? ` - ${city}` : ''}`, 110)[0] || ''), nameX, 23);
  doc.text(`Tel/WhatsApp: ${text(tenant.phone)}  |  ${text(tenant.email)}`, nameX, 27);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(title, RIGHT, 13, { align: 'right' });
  doc.setFontSize(17);
  doc.text(number, RIGHT, 22, { align: 'right' });

  doc.setTextColor(INK[0], INK[1], INK[2]);
  c.y = 38;
}

function ensure(c: Ctx, needed: number) {
  if (c.y + needed > BOTTOM) {
    c.doc.addPage();
    c.y = 16;
  }
}

function section(c: Ctx, title: string, needed = 18) {
  ensure(c, needed);
  const { doc, accent } = c;
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(LEFT, c.y - 3.2, 1.6, 4.4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(accent[0], accent[1], accent[2]);
  doc.text(title.toUpperCase(), LEFT + 4, c.y);
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.2);
  doc.line(LEFT + 4 + doc.getTextWidth(title.toUpperCase()) + 3, c.y - 1, RIGHT, c.y - 1);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  c.y += 6.5;
}

// Grade de rótulo/valor em duas colunas
function grid(c: Ctx, rows: [string, string, string?, string?][]) {
  autoTable(c.doc, {
    startY: c.y - 4,
    margin: { left: LEFT, right: 210 - RIGHT },
    theme: 'plain',
    styles: { fontSize: 8.6, cellPadding: { top: 1.1, bottom: 1.1, left: 0, right: 2 }, textColor: INK, overflow: 'linebreak' },
    columnStyles: {
      0: { cellWidth: 30, textColor: MUTED },
      1: { cellWidth: 61, fontStyle: 'bold' },
      2: { cellWidth: 30, textColor: MUTED },
      3: { cellWidth: 61, fontStyle: 'bold' }
    },
    body: rows.map(r => [r[0], r[1], r[2] || '', r[3] || ''])
  });
  c.y = (c.doc as any).lastAutoTable.finalY + 5;
}

function paragraph(c: Ctx, label: string, value: string) {
  const { doc } = c;
  doc.setFontSize(8.6);
  const lines: string[] = doc.splitTextToSize(value, WIDTH);
  ensure(c, 5 + lines.length * 4);
  if (label) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(label, LEFT, c.y);
    c.y += 4;
  }
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(lines, LEFT, c.y);
  c.y += lines.length * 4 + 3;
}

function checklist(c: Ctx, os: ServiceOrder) {
  const { doc } = c;
  const cols = 3;
  const colW = WIDTH / cols;
  const rowH = 5;
  const rows = Math.ceil(CHECKLIST_ITEMS.length / cols);
  ensure(c, rows * rowH + 10);

  doc.setFontSize(8.2);
  CHECKLIST_ITEMS.forEach((item, idx) => {
    const col = Math.floor(idx / rows);
    const row = idx % rows;
    const x = LEFT + col * colW;
    const y = c.y + row * rowH;
    const state = os.intake_checklist?.[item.id] || 'untested';

    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.25);
    doc.rect(x, y - 2.8, 3.1, 3.1);
    doc.setLineWidth(0.45);
    if (state === 'ok') {
      doc.setDrawColor(5, 150, 105);
      doc.line(x + 0.6, y - 1.2, x + 1.3, y - 0.4);
      doc.line(x + 1.3, y - 0.4, x + 2.6, y - 2.3);
    } else if (state === 'fail') {
      doc.setDrawColor(225, 29, 72);
      doc.line(x + 0.6, y - 2.3, x + 2.5, y - 0.4);
      doc.line(x + 2.5, y - 2.3, x + 0.6, y - 0.4);
    }
    doc.setFont('helvetica', state === 'untested' ? 'normal' : 'bold');
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(item.label, x + 4.6, y);
  });
  c.y += rows * rowH + 1.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('Legenda: marcado com visto = funcionando/íntegro  |  marcado com X = com problema  |  em branco = não testado na entrada', LEFT, c.y + 1);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  c.y += 7;
}

function quoteTable(c: Ctx, os: ServiceOrder) {
  const service = Number(os.quote_service_amount) || 0;
  const parts = Number(os.quote_parts_amount) || 0;
  const total = Number(os.client_quote_amount) || service + parts;
  ensure(c, 30);
  autoTable(c.doc, {
    startY: c.y - 2.5,
    margin: { left: LEFT, right: 210 - RIGHT },
    theme: 'grid',
    head: [['Descrição', 'Detalhe', 'Valor']],
    headStyles: { fillColor: c.accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.4 },
    styles: { fontSize: 8.6, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 32 }, 2: { cellWidth: 34, halign: 'right' } },
    body: [
      ['Serviço', text(os.quote_service_description || os.service_performed || os.service_needed), service ? brl(service) : '—'],
      ['Peças', text(os.quote_parts_description || os.parts_used), parts ? brl(parts) : '—']
    ],
    foot: [['', 'VALOR TOTAL', brl(total)]],
    footStyles: { fillColor: [248, 250, 252], textColor: INK, fontStyle: 'bold', fontSize: 9.5, halign: 'right' }
  });
  c.y = (c.doc as any).lastAutoTable.finalY + 4;
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(8.6);
  c.doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  c.doc.text(`Prazo estimado: ${text(os.quote_deadline || (os.estimated_delivery_date ? dateBR(os.estimated_delivery_date) : ''))}`, LEFT, c.y);
  c.doc.setTextColor(INK[0], INK[1], INK[2]);
  c.y += 6;
}

function signatures(c: Ctx) {
  ensure(c, 30);
  const { doc } = c;
  c.y += 14;
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.25);
  doc.line(LEFT, c.y, LEFT + 70, c.y);
  doc.line(LEFT + 78, c.y, LEFT + 148, c.y);
  doc.line(LEFT + 156, c.y, RIGHT, c.y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('Assinatura do Cliente', LEFT, c.y + 4);
  doc.text('Assinatura do Responsável pela Loja', LEFT + 78, c.y + 4);
  doc.text('Data', LEFT + 156, c.y + 4);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  c.y += 8;
}

function customerAndDevice(c: Ctx, os: ServiceOrder) {
  const customer = store.customers.find(x => x.id === os.customer_id);
  const attendant = store.profiles.find(p => p.id === os.intake_seller_id)?.full_name;
  const internal = os.origin === 'internal';

  section(c, 'Dados do Cliente');
  grid(c, internal
    ? [['Proprietário', 'Própria Loja (aparelho do estoque)', 'Origem', 'Assistência Interna']]
    : [
        ['Nome', text(customer?.name), 'CPF', text(customer?.cpf)],
        ['Telefone', text(customer?.phone), 'WhatsApp', text(customer?.whatsapp || customer?.phone)],
        ['Endereço', text(customer?.address), '', '']
      ]);

  section(c, 'Dados do Aparelho');
  grid(c, [
    ['Marca', text(os.device_brand), 'Modelo', text(os.device_model)],
    ['Cor', text(os.device_color), 'Armazenamento', text(os.device_storage)],
    ['IMEI 1', text(os.imei), 'IMEI 2', text(os.imei2)],
    ['Data de entrada', dateBR(os.entered_at || os.created_at), 'Previsão de entrega', dateBR(os.estimated_delivery_date)],
    ['Atendimento', text(attendant), 'Nº da Ordem', String(os.os_number)]
  ]);
}

function pageNumbers(doc: jsPDF, label: string) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(label, LEFT, 290);
    doc.text(`Página ${p} de ${pages}`, RIGHT, 290, { align: 'right' });
  }
}

function drawServiceOrder(c: Ctx, os: ServiceOrder) {
  drawHeader(c, 'ORDEM DE SERVIÇO', `Nº ${os.os_number}`);
  customerAndDevice(c, os);

  section(c, 'Defeito Informado pelo Cliente');
  paragraph(c, '', text(os.reported_defect));

  section(c, 'Diagnóstico Técnico');
  grid(c, [
    ['Diagnóstico', text(os.technician_diagnosis), 'Problema encontrado', text(os.problem_found)],
    ['Serviço necessário', text(os.service_needed), 'Obs. técnicas', text(os.technical_notes)]
  ]);

  section(c, 'Orçamento', 34);
  if (os.client_quote_amount || os.quote_service_amount || os.quote_parts_amount) {
    quoteTable(c, os);
  } else {
    paragraph(c, '', 'Orçamento ainda não definido. O serviço só é iniciado após a aprovação do cliente.');
  }

  section(c, 'Checklist de Entrada', 50);
  checklist(c, os);
  paragraph(c, 'Observações sobre o estado do aparelho', text(os.physical_condition));

  // Termos e assinaturas ficam juntos na mesma página (o cliente assina logo abaixo do que leu)
  c.doc.setFont('helvetica', 'normal');
  c.doc.setFontSize(8.2);
  const termLines = ASSISTANCE_TERMS.map((term, idx) => c.doc.splitTextToSize(`${idx + 1}. ${term}`, WIDTH) as string[]);
  const termsHeight = termLines.reduce((acc, lines) => acc + lines.length * 3.8 + 1.6, 0);
  section(c, 'Termos da Assistência', termsHeight + 40);
  termLines.forEach((lines) => {
    c.doc.setFont('helvetica', 'normal');
    c.doc.setFontSize(8.2);
    c.doc.setTextColor(51, 65, 85);
    c.doc.text(lines, LEFT, c.y);
    c.y += lines.length * 3.8 + 1.6;
  });
  c.doc.setTextColor(INK[0], INK[1], INK[2]);

  signatures(c);
}

/** Ordem de Serviço completa (uma ou várias OS no mesmo arquivo). */
export const buildServiceOrderPDF = (orders: ServiceOrder[], tenant: Tenant, theme?: TenantTheme): BuiltDocument => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c: Ctx = { doc, tenant, theme, accent: hexToRgb(theme?.primary_color), y: 38 };
  orders.forEach((os, idx) => {
    if (idx > 0) doc.addPage();
    drawServiceOrder(c, os);
  });
  pageNumbers(doc, orders.length === 1 ? `Ordem de Serviço nº ${orders[0].os_number}` : 'Ordens de Serviço');
  const suffix = orders.length === 1 ? orders[0].os_number : 'varias';
  return { doc, fileName: `Ordem_de_Servico_${suffix}.pdf` };
};

/** Orçamento para aprovação do cliente. */
export const buildQuotePDF = (os: ServiceOrder, tenant: Tenant, theme?: TenantTheme): BuiltDocument => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c: Ctx = { doc, tenant, theme, accent: hexToRgb(theme?.primary_color), y: 38 };
  drawHeader(c, 'ORÇAMENTO', `OS Nº ${os.os_number}`);
  customerAndDevice(c, os);

  section(c, 'Defeito Informado pelo Cliente');
  paragraph(c, '', text(os.reported_defect));

  section(c, 'Diagnóstico Técnico');
  grid(c, [
    ['Diagnóstico', text(os.technician_diagnosis), 'Problema encontrado', text(os.problem_found)],
    ['Serviço necessário', text(os.service_needed), 'Obs. técnicas', text(os.technical_notes)]
  ]);

  section(c, 'Orçamento', 34);
  quoteTable(c, os);

  paragraph(c, '', 'O serviço somente será iniciado após a aprovação deste orçamento. O prazo é uma estimativa e pode mudar conforme a disponibilidade de peças.');

  ensure(c, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.3);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.rect(LEFT, c.y, 3.4, 3.4);
  doc.text('Aprovo o orçamento', LEFT + 5.5, c.y + 2.8);
  doc.rect(LEFT + 50, c.y, 3.4, 3.4);
  doc.text('Não aprovo o orçamento', LEFT + 55.5, c.y + 2.8);
  c.y += 6;

  signatures(c);
  pageNumbers(doc, `Orçamento da Ordem de Serviço nº ${os.os_number}`);
  return { doc, fileName: `Orcamento_OS_${os.os_number}.pdf` };
};
