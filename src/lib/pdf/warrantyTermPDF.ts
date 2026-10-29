// ============================================================================
// CONTROLPHONE — TERMO DE GARANTIA (MODELO OFICIAL DA LOJA)
// O texto jurídico abaixo é a transcrição literal do modelo enviado pela loja:
// NÃO altere a redação (inclusive grafia) sem a aprovação de quem responde pelo documento.
// O sistema preenche apenas os campos variáveis (loja, cliente, aparelho, valores e datas).
// ============================================================================

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawProportionalLogo } from './pdfLogo';
import { INSPECTION_ITEMS } from '../deviceInspection';
import { Customer, Device, Sale, SaleItem, Tenant, TenantTheme, Warranty } from '../../types';

export interface WarrantyTermEntry {
  item: SaleItem;
  device: Device;
  warranty?: Warranty;
}

export interface WarrantyTermContext {
  sale: Sale;
  tenant: Tenant;
  theme?: TenantTheme;
  customer?: Customer;
  sellerName: string;
  entries: WarrantyTermEntry[];
  /** false: sem as linhas "Assinatura do responsável/cliente" (termo enviado para rubrica digital pelo link) */
  signatureLines?: boolean;
}

type Seg = { text: string; bold?: boolean };

// ---- medidas da página (A4, em mm) ----
const PAGE_W = 210;
const LEFT = 22;
const RIGHT = 22;
const BODY_X = 30; // parágrafos ficam recuados em relação aos títulos, como no modelo
const BODY_W = PAGE_W - BODY_X - RIGHT;
const FIRST_LINE_INDENT = 12;
const BOTTOM_LIMIT = 262; // abaixo disso fica o rodapé com os dados da loja
const FONT = 'times';

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const day = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '#1845E8').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  return [parseInt(full.slice(0, 2), 16) || 24, parseInt(full.slice(2, 4), 16) || 69, parseInt(full.slice(4, 6), 16) || 232];
}

// ----------------------------------------------------------------------------
// TEXTO JURÍDICO — transcrição literal do modelo. {LOJA} = nome da loja no cadastro.
// ----------------------------------------------------------------------------

const SECTION_1: Seg[][] = [
  [{ text: 'O presente termo de garantia é formulado de acordo com as leis vigentes no pais em especial as lei 8078/90 e 10.406/02, a fim de assegurar os direitos e deveres de ambas as partes.' }],
  [{ text: 'Com base na lei 8.078/90, o aparelho acima descrito é classificado como bem durável, logo, o prazo de garantia legal é de 90 dias a contar da efetiva entrega do produto, conforme prevê o artigo 26 do mesmo diploma. É de conhecimento do consumidor que o bem adquirido se trata de produto usado ou de vitrine, não havendo qualquer garantia estendida contratualmente.' }],
  [{ text: 'É de plena responsabilidade do consumidor, ora contratante, vistoriar o aparelho no ato da entrega e indicar no quadro abaixo eventuais avarias existentes, sob pena de preclusão de direito a eventual reinvidicação.', bold: true }],
  [
    { text: 'O termo tem abrangência tão somente ao aparelho acima descrito, com' },
    { text: 'cobertura estritamente para as seguintes peças: placa mãe/processador, conector de carga, bateria, câmeras, microfone, auto falante inferior e superior, chip WI-FI/4G/BLUETOOTH/GPS, sensor de aproximação, entrada do fone de ouvido. O display do aparelho não está coberto pela garantia.', bold: true }
  ],
  [{ text: 'Terão cobertura as peças que tenham defeito original de fábrica, e a comprovação será feita no momento de se realizar o reparo. Essa garantia cobre somente os defeitos de funcionamento das peças e componentes.' }],
  [{ text: 'A CONTRATADA não assume nenhuma obrigação ou responsabilidade por acréscimos ou modificações desta garantia, salvo se efetuadas por escrito pela mesma. A garantia não cobre a instalação do equipamento ou acessórios, bem como danos decorrentes da instalação inadequada que tenha sido executada por um prestador de serviço não autorizado' }],
  [{ text: 'A CONTRATADA não será, de forma alguma, responsável por qualquer acessório, e que seja anexado ou usado com seus aparelhos, nem pelo funcionamento ou segurança de seus aparelhos usados com acessórios. Tais acessórios estão expressamente excluídos da garantia, assim como não será responsável por quaisquer danos causados ao produto, ao usuário ou terceiros resultantes de tais fatos.' }]
];

const SECTION_2 =
  'Caso o produto apresente problema no prazo acima previsto, deverá o consumdior encaminhar, imediantamente, o aparelho até a assistência técnica {LOJA}, para que seja realizada a análise técnica do produto e caso o vício não esteja no rol de excludentes da garantia, terá a assistencia téncica o prazo de 30 dias para realizar o devido reparo. Caso seja constatado que o aparelho foi violado, manuseado por técnico não autorizaado pela {LOJA}, a garantia será automaticamente cancelada. Não é de responsabilidade da contratada eventuais aplicativos pré-instalados no produto que venham a ser descontinuados ou aplicativos que sejam incompatíveis com o produto.';

const EXCLUSIONS: [string, string][] = [
  ['(a)', 'Defeitos e/ou danos resultantes do uso irregular do produto pelo cliente, como: superfícies plásticas e outras peças expostas, arranhadas, trincadas, torcidas ou quebradas, limpeza, carbonização, bem como derramamento de alimentos ou líquidos de qualquer natureza;'],
  ['(b)', 'Defeitos e/ou danos decorrentes de testes, instalação, alteração, modificação de qualquer espécie em nossos produtos, bem como o reparo realizado por outras oficinas;'],
  ['(c)', 'Quebra e/ou danos que não foram constatados no ato da aquisição e/ou recebimento do produto;'],
  ['(d)', 'Produtos que tenham tido o número de série removido, adulterado ou tornado ilegível e/ou IMEI modificado ou divergente do informado na etiqueta do aparelho;'],
  ['(e)', 'Defeitos e/ou danos decorrentes da utilização de componentes não compatíveis e não originais com o produto'],
  ['(f)', 'Defeitos e/ou danos causados por agentes naturais (enchente, maresia, descarga elétrica e outros), exposição excessiva ao calor, vapor ou à umidade;'],
  ['(g)', 'Desempenho insatisfatório do produto ou danos devido à instalação ou rede elétrica local inadequada;'],
  ['(h)', 'Peças que se desgastam naturalmente com uso;'],
  ['(i)', 'Perda de dados, aplicativos ou mídias resultante do reparo do produto;'],
  ['(j)', 'Problemas ou danos causados por vírus, aplicativos ou programas de terceiros;'],
  ['(k)', 'Falha em backup (cópia de segurança) ou qualquer outra falha em manter os aplicativos e dados contidos no produto;'],
  ['(l)', 'Alteração no Software Original de Fábrica do produto através de instalação de Software ou Sistema Operacional não oficial.']
];

// Quadro das vendas anteriores à vistoria no sistema (em branco, preenchido à mão): mantido como era
const INSPECTION_ROWS = [
  'A câmera frontal esta em perfeito funcionamento?',
  'A câmera traseira esta em perfeito funcionamento?',
  'Há trinca na lente da câmara?',
  'A tela e display esta em perfeito funcionamento?',
  'Há trinca na tela ou no display?',
  'O autofalante superior esta em perfeito funcionamento?',
  'O autofalante e microfone inferior esta em perfeito funcionamento?'
];

const CLOSING = 'A NÃO APRESENTAÇÃO DESTE DOCUMENTO (TERMO DE GARANTIA), INVALIDARÁ A COBERTURA DA GARANTIA AQUI OFERTADA.';

// ----------------------------------------------------------------------------
// Parágrafo justificado com trechos em negrito (o jsPDF não faz isso sozinho)
// ----------------------------------------------------------------------------
function richParagraph(
  doc: jsPDF,
  segs: Seg[],
  opts: { x: number; y: number; width: number; indent?: number; size: number; lineHeight: number; justify?: boolean; onPageBreak: () => number }
): number {
  const words: { text: string; bold: boolean; w: number }[] = [];
  doc.setFontSize(opts.size);
  segs.forEach(seg => {
    doc.setFont(FONT, seg.bold ? 'bold' : 'normal');
    seg.text.split(/\s+/).filter(Boolean).forEach(text => {
      words.push({ text, bold: Boolean(seg.bold), w: doc.getTextWidth(text) });
    });
  });
  doc.setFont(FONT, 'normal');
  const space = doc.getTextWidth(' ');

  // quebra em linhas (a primeira é mais curta por causa do recuo)
  const lines: { words: typeof words; indent: number }[] = [];
  let current: typeof words = [];
  let used = 0;
  let indent = opts.indent || 0;
  words.forEach(word => {
    const extra = current.length ? space + word.w : word.w;
    if (current.length && used + extra > opts.width - indent) {
      lines.push({ words: current, indent });
      current = [];
      used = 0;
      indent = 0;
    }
    used += current.length ? space + word.w : word.w;
    current.push(word);
  });
  if (current.length) lines.push({ words: current, indent });

  let y = opts.y;
  lines.forEach((line, idx) => {
    if (y > BOTTOM_LIMIT) y = opts.onPageBreak();
    const isLast = idx === lines.length - 1;
    const wordsWidth = line.words.reduce((acc, w) => acc + w.w, 0);
    const gaps = line.words.length - 1;
    const gap = opts.justify !== false && !isLast && gaps > 0
      ? (opts.width - line.indent - wordsWidth) / gaps
      : space;
    let x = opts.x + line.indent;
    line.words.forEach(word => {
      doc.setFont(FONT, word.bold ? 'bold' : 'normal');
      doc.text(word.text, x, y);
      x += word.w + gap;
    });
    y += opts.lineHeight;
  });
  doc.setFont(FONT, 'normal');
  return y;
}

function drawFooter(doc: jsPDF, tenant: Tenant) {
  const street = [tenant.address_street, tenant.address_number].filter(Boolean).join(', ');
  const city = [tenant.address_city, tenant.address_state].filter(Boolean).join('-');
  doc.setFont(FONT, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text(`Endereço: ${street || 'não informado'},`, 12, 277);
  doc.text(city ? `Cidade de ${city}` : 'Cidade não informada', 12, 281.5);
  doc.text(`Fone: ${tenant.phone || 'não informado'}`, 12, 286);
}

// Campo com rótulo, valor preenchido e linha (em branco quando o dado não existe no sistema)
function field(doc: jsPDF, label: string, value: string | undefined, x: number, y: number, endX: number, boldLabel = false) {
  doc.setFont(FONT, boldLabel ? 'bold' : 'normal');
  doc.text(label, x, y);
  const start = x + doc.getTextWidth(label) + 1.5;
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.2);
  doc.line(start, y + 0.9, endX, y + 0.9);
  if (value) {
    doc.setFont(FONT, 'bold');
    doc.text(String(doc.splitTextToSize(value, endX - start - 1)[0]), start + 1, y);
  }
  doc.setFont(FONT, 'normal');
}

function drawTerm(doc: jsPDF, ctx: WarrantyTermContext, entry: WarrantyTermEntry) {
  const { sale, tenant, theme, customer, sellerName } = ctx;
  const { device, item, warranty } = entry;
  const accent = hexToRgb(theme?.primary_color || '#1845E8');
  const storeName = (theme?.display_name || tenant.trade_name || tenant.name || '').toUpperCase();
  const right = PAGE_W - RIGHT;
  const SIZE = 10.5;
  const LH = 4.7;
  const pageBreak = () => {
    doc.addPage();
    return 26;
  };

  doc.setTextColor(20, 20, 20);

  // Cabeçalho: logo proporcional (quando houver), título e identificação da venda
  drawProportionalLogo(doc, theme?.logo_url || theme?.logo_compact_url, {
    x: LEFT,
    y: 11,
    maxWidth: 34,
    maxHeight: 13,
    defaultY: 11
  });
  doc.setFont(FONT, 'bold');
  doc.setFontSize(12.5);
  doc.text('TERMO DE GARANTIA', PAGE_W / 2, 26, { align: 'center' });
  doc.setDrawColor(accent[0], accent[1], accent[2]);
  doc.setLineWidth(0.6);
  doc.line(PAGE_W / 2 - 24, 28, PAGE_W / 2 + 24, 28);

  doc.setFont(FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90, 90, 90);
  doc.text(
    `Venda nº ${sale.sale_number}  |  Data: ${new Date(sale.created_at).toLocaleDateString('pt-BR')}  |  Vendedor: ${sellerName}`,
    PAGE_W / 2, 33, { align: 'center' }
  );
  doc.setTextColor(20, 20, 20);

  // DADOS DO CONTRATANTE
  doc.setFontSize(SIZE);
  let y = 44;
  field(doc, 'CONTRATANTE:', customer?.name, LEFT, y, right - 8, true);
  y += 5.2;
  field(doc, 'CPF:', customer?.cpf, LEFT, y, 92);
  field(doc, 'Telefone:', customer?.phone, 96, y, right - 8);
  y += 5.2;
  field(doc, 'Endereço:', customer?.address, LEFT, y, right - 8);

  // DADOS DO PRODUTO
  y += 12;
  doc.setFont(FONT, 'bold');
  doc.text('DADOS DO PRODUTO:', LEFT, y);
  doc.setFont(FONT, 'normal');
  y += 6.5;
  field(doc, 'Modelo:', `${device.brand} ${device.model} ${device.storage_capacity}`.trim(), LEFT, y, 128);
  field(doc, 'Cor:', device.color, 131, y, right - 8);
  y += 5.2;
  field(doc, 'Valor:', brl(item.total_price), LEFT, y, right - 8);
  y += 5.2;
  field(doc, 'IMEI do aparelho: IMEI1:', device.imei, LEFT, y, 112);
  field(doc, 'IMEI2:', undefined, 115, y, right - 8);
  y += 5.2;
  field(doc, 'Inicio da vigência:', day(warranty?.start_date), LEFT, y, 82);
  field(doc, 'até:', day(warranty?.end_date), 86, y, 128);

  // 1) ABRANGÊNCIA E PRAZO
  y += 12;
  doc.setFont(FONT, 'bold');
  doc.text('1)   DA ABRANGÊNCIA E PRAZO DA GARANTIA', LEFT, y);
  y += 7;
  SECTION_1.forEach(segs => {
    y = richParagraph(doc, segs, { x: BODY_X, y, width: BODY_W, indent: FIRST_LINE_INDENT, size: SIZE, lineHeight: LH, onPageBreak: pageBreak });
    y += 3.2;
  });

  // 2) CONDIÇÕES GERAIS
  if (y > BOTTOM_LIMIT - 18) y = pageBreak();
  y += 2;
  doc.setFont(FONT, 'bold');
  doc.text('2)   DAS CONDIÇÕES GERAIS DA GARANTIA', LEFT, y);
  y += 7;
  y = richParagraph(doc, [{ text: SECTION_2.split('{LOJA}').join(storeName) }], {
    x: BODY_X, y, width: BODY_W, indent: FIRST_LINE_INDENT, size: SIZE, lineHeight: LH, onPageBreak: pageBreak
  });

  // 3) EXCLUDENTES
  if (y > BOTTOM_LIMIT - 24) y = pageBreak();
  y += 5;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(SIZE);
  doc.text('3)   DAS EXCLUDENTES DA GARANTIA', LEFT, y);
  y += 7;
  doc.text('A garantia não cobre, entre outras hipóteses:', LEFT + 6, y);
  y += 6.5;
  EXCLUSIONS.forEach(([letter, text]) => {
    y = richParagraph(doc, [{ text: letter, bold: true }, { text }], {
      x: LEFT + 6, y, width: PAGE_W - LEFT - 6 - RIGHT, size: 9.5, lineHeight: 4.1, onPageBreak: pageBreak
    });
  });

  // 4) VISTORIA — com a vistoria feita pelo vendedor na venda, o X sai na coluna escolhida
  const inspection = item.inspection || warranty?.inspection;
  if (y > BOTTOM_LIMIT - 70) y = pageBreak();
  y += 6;
  doc.setFont(FONT, 'bold');
  doc.setFontSize(SIZE);
  doc.text('4)   DAS VISTORIA DO APARELHO', LEFT, y);
  y += 7;
  doc.setFont(FONT, 'normal');
  doc.text('O consumidor deverá marcar um X no quadro abaixo indicando o atual estado do aparelho adquirido.', BODY_X, y);

  autoTable(doc, {
    startY: y + 4,
    margin: { left: BODY_X, right: RIGHT + 14 },
    head: [['SIM', 'NÃO', 'DESCRIÇÃO']],
    body: inspection
      ? INSPECTION_ITEMS.map(({ key, label }) => [
          inspection.answers[key] === true ? 'X' : '',
          inspection.answers[key] === false ? 'X' : '',
          label
        ])
      : INSPECTION_ROWS.map(row => ['', '', row]),
    theme: 'grid',
    styles: { font: FONT, fontSize: 9.5, cellPadding: 1.1, textColor: [20, 20, 20], lineColor: [40, 40, 40], lineWidth: 0.2 },
    headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 13, halign: 'center', fontStyle: 'bold' }
    }
  });
  y = (doc as any).lastAutoTable.finalY + 6;

  // OBS: observações da vistoria; nas vendas anteriores a ela, as Observações do cadastro do aparelho
  doc.setFont(FONT, 'normal');
  doc.setFontSize(SIZE);
  const obs = inspection ? inspection.notes?.trim() : device.physical_condition_notes?.trim();
  const obsLines: string[] = obs ? doc.splitTextToSize(obs, right - 14 - (BODY_X + 12)).slice(0, 2) : [];
  field(doc, 'OBS:', obsLines[0], BODY_X, y, right - 14);
  y += 5.2;
  doc.line(BODY_X, y + 0.9, right - 14, y + 0.9);
  if (obsLines[1]) {
    doc.setFont(FONT, 'bold');
    doc.text(obsLines[1], BODY_X + 1, y);
    doc.setFont(FONT, 'normal');
  }

  // Fecho e assinaturas
  if (y > BOTTOM_LIMIT - 38) y = pageBreak();
  y += 13;
  doc.setFont(FONT, 'bold');
  const closing: string[] = doc.splitTextToSize(CLOSING, PAGE_W - LEFT - RIGHT);
  doc.text(closing, LEFT, y);
  y += closing.length * LH + 9;
  if (ctx.signatureLines === false) return;
  doc.setFont(FONT, 'normal');
  field(doc, 'Assinatura do responsável:', undefined, LEFT, y, right - 8);
  y += 9;
  field(doc, 'Assinatura do cliente:', undefined, LEFT, y, right - 8);
}

// Um termo por aparelho da venda (cada um começa em uma nova página)
export const buildWarrantyTermPDF = (ctx: WarrantyTermContext): { doc: jsPDF; fileName: string } => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  ctx.entries.forEach((entry, idx) => {
    if (idx > 0) doc.addPage();
    drawTerm(doc, ctx, entry);
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    drawFooter(doc, ctx.tenant);
  }

  return { doc, fileName: `Termo_de_Garantia_Venda_${ctx.sale.sale_number}.pdf` };
};

/**
 * Condições do termo em texto corrido (mesma redação do PDF), para a página em que o cliente
 * confere e rubrica o comprovante recebido pelo WhatsApp.
 */
export const warrantyTermConditions = (storeName: string): { title: string; paragraphs: string[] }[] => [
  { title: '1) Da abrangência e prazo da garantia', paragraphs: SECTION_1.map(segs => segs.map(s => s.text).join(' ')) },
  { title: '2) Das condições gerais da garantia', paragraphs: [SECTION_2.split('{LOJA}').join(storeName)] },
  {
    title: '3) Das excludentes da garantia',
    paragraphs: ['A garantia não cobre, entre outras hipóteses:', ...EXCLUSIONS.map(([letter, text]) => `${letter} ${text}`)]
  },
  { title: 'Aviso', paragraphs: [CLOSING] }
];
