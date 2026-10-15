// ============================================================================
// CONTROLPHONE — MODELOS DE DOCUMENTO DA LOJA (PDF POR TENANT)
// Cada loja envia seus próprios modelos. O arquivo fica em
// {tenant_id}/{tipo}.pdf no bucket "tenant-documents" (Supabase Storage) ou,
// sem sessão do Supabase (modo demonstração), no IndexedDB do navegador.
//
// Preenchimento automático: o modelo deve ser um PDF com campos de formulário.
// Cada campo cujo nome corresponde a uma chave de TEMPLATE_FIELDS recebe o dado
// do sistema. Um PDF sem campos reconhecidos não tem onde receber os dados:
// nesse caso o documento é gerado no layout padrão do sistema.
// ============================================================================

import { supabase } from './supabase';
import { hasSupabaseSession } from './avatarStorage';
import { store } from './store';
import { TenantDocument, TenantDocumentType } from '../types';

export const TENANT_DOCUMENTS_BUCKET = 'tenant-documents';
export const TEMPLATE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const TEMPLATE_ACCEPT = '.pdf,application/pdf';

export type TemplateValues = Record<string, string>;

// Chaves que o sistema sabe preencher (o nome do campo no PDF pode usar maiúsculas, acentos ou espaços)
export const TEMPLATE_FIELDS: { group: string; keys: { key: string; label: string }[] }[] = [
  {
    group: 'Loja',
    keys: [
      { key: 'loja_nome', label: 'Nome fantasia' },
      { key: 'loja_razao_social', label: 'Razão social' },
      { key: 'loja_cnpj', label: 'CNPJ' },
      { key: 'loja_ie', label: 'Inscrição estadual' },
      { key: 'loja_telefone', label: 'Telefone' },
      { key: 'loja_whatsapp', label: 'WhatsApp' },
      { key: 'loja_email', label: 'E-mail' },
      { key: 'loja_site', label: 'Site' },
      { key: 'loja_endereco', label: 'Endereço completo' },
      { key: 'loja_cidade', label: 'Cidade' },
      { key: 'loja_estado', label: 'UF' },
      { key: 'loja_cep', label: 'CEP' }
    ]
  },
  {
    group: 'Cliente',
    keys: [
      { key: 'cliente_nome', label: 'Nome' },
      { key: 'cliente_cpf', label: 'CPF' },
      { key: 'cliente_telefone', label: 'Telefone' },
      { key: 'cliente_email', label: 'E-mail' },
      { key: 'cliente_endereco', label: 'Endereço' }
    ]
  },
  {
    group: 'Venda',
    keys: [
      { key: 'venda_numero', label: 'Número da venda' },
      { key: 'venda_data', label: 'Data da venda' },
      { key: 'venda_itens', label: 'Itens (lista)' },
      { key: 'venda_subtotal', label: 'Subtotal' },
      { key: 'venda_desconto', label: 'Desconto' },
      { key: 'venda_total', label: 'Total' },
      { key: 'venda_pagamento', label: 'Formas de pagamento' },
      { key: 'vendedor_nome', label: 'Vendedor' },
      { key: 'data_emissao', label: 'Data de emissão do documento' }
    ]
  },
  {
    group: 'Aparelho e garantia',
    keys: [
      { key: 'aparelho_descricao', label: 'Descrição completa' },
      { key: 'aparelho_marca', label: 'Marca' },
      { key: 'aparelho_modelo', label: 'Modelo' },
      { key: 'aparelho_armazenamento', label: 'Armazenamento' },
      { key: 'aparelho_cor', label: 'Cor' },
      { key: 'aparelho_imei', label: 'IMEI' },
      { key: 'aparelho_bateria', label: 'Saúde da bateria' },
      { key: 'aparelho_valor', label: 'Valor do aparelho' },
      { key: 'garantia_dias', label: 'Prazo em dias' },
      { key: 'garantia_inicio', label: 'Início da garantia' },
      { key: 'garantia_fim', label: 'Fim da garantia' }
    ]
  },
  {
    group: 'Upgrade',
    keys: [
      { key: 'usado_descricao', label: 'Aparelho recebido' },
      { key: 'usado_imei', label: 'IMEI do aparelho recebido' },
      { key: 'usado_avaliacao', label: 'Valor de avaliação' },
      { key: 'upgrade_diferenca', label: 'Diferença paga' }
    ]
  },
  {
    group: 'Ordem de serviço',
    keys: [
      { key: 'os_numero', label: 'Número da OS' },
      { key: 'os_data', label: 'Data de entrada' },
      { key: 'os_defeito', label: 'Defeito relatado' },
      { key: 'os_estado_aparelho', label: 'Estado do aparelho na entrada' },
      { key: 'os_diagnostico', label: 'Diagnóstico' },
      { key: 'os_servico', label: 'Serviço' },
      { key: 'os_pecas', label: 'Peças' },
      { key: 'os_valor', label: 'Valor do orçamento' },
      { key: 'os_prazo', label: 'Prazo estimado' },
      { key: 'tecnico_nome', label: 'Técnico responsável' }
    ]
  }
];

// Nomes comuns em modelos prontos, aceitos como sinônimos das chaves oficiais
const ALIASES: Record<string, string> = {
  nome_fantasia: 'loja_nome', nome_loja: 'loja_nome', loja: 'loja_nome', empresa: 'loja_nome',
  razao_social: 'loja_razao_social', cnpj: 'loja_cnpj', inscricao_estadual: 'loja_ie',
  telefone_loja: 'loja_telefone', endereco_loja: 'loja_endereco',
  nome_cliente: 'cliente_nome', cliente: 'cliente_nome', nome: 'cliente_nome', comprador: 'cliente_nome',
  cpf: 'cliente_cpf', cpf_cliente: 'cliente_cpf', telefone_cliente: 'cliente_telefone', telefone: 'cliente_telefone',
  email_cliente: 'cliente_email', endereco_cliente: 'cliente_endereco',
  numero_venda: 'venda_numero', data_venda: 'venda_data', data: 'data_emissao', valor_total: 'venda_total', total: 'venda_total',
  forma_pagamento: 'venda_pagamento', pagamento: 'venda_pagamento', itens: 'venda_itens', vendedor: 'vendedor_nome',
  aparelho: 'aparelho_descricao', produto: 'aparelho_descricao', marca: 'aparelho_marca', modelo: 'aparelho_modelo',
  armazenamento: 'aparelho_armazenamento', capacidade: 'aparelho_armazenamento', cor: 'aparelho_cor', imei: 'aparelho_imei',
  imei_1: 'aparelho_imei', bateria: 'aparelho_bateria', valor: 'aparelho_valor', valor_aparelho: 'aparelho_valor',
  prazo_garantia: 'garantia_dias', dias_garantia: 'garantia_dias', inicio_garantia: 'garantia_inicio',
  fim_garantia: 'garantia_fim', validade_garantia: 'garantia_fim',
  aparelho_usado: 'usado_descricao', aparelho_recebido: 'usado_descricao', imei_usado: 'usado_imei',
  valor_avaliacao: 'usado_avaliacao', avaliacao: 'usado_avaliacao', diferenca: 'upgrade_diferenca',
  numero_os: 'os_numero', os: 'os_numero', data_entrada: 'os_data', defeito: 'os_defeito', defeito_relatado: 'os_defeito',
  estado_aparelho: 'os_estado_aparelho', diagnostico: 'os_diagnostico', servico: 'os_servico', pecas: 'os_pecas',
  valor_orcamento: 'os_valor', orcamento: 'os_valor', prazo: 'os_prazo', tecnico: 'tecnico_nome'
};

const KNOWN_KEYS = new Set(TEMPLATE_FIELDS.flatMap(g => g.keys.map(k => k.key)));

const normalizeFieldName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Chave oficial correspondente ao nome de um campo do PDF (ou null se o sistema não o reconhece). */
export const resolveFieldKey = (fieldName: string): string | null => {
  const normalized = normalizeFieldName(fieldName);
  if (KNOWN_KEYS.has(normalized)) return normalized;
  return ALIASES[normalized] || null;
};

export const validateTemplateFile = (file: File): string | null => {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return 'Envie o modelo em formato PDF.';
  }
  if (file.size > TEMPLATE_MAX_BYTES) return 'O arquivo excede o limite de 10 MB.';
  if (file.size === 0) return 'O arquivo está vazio.';
  return null;
};

export interface TemplateAnalysis {
  fields_total: number;
  fields_matched: number;
}

/** Abre o PDF para confirmar que é válido e conta os campos que o sistema conseguirá preencher. */
export const analyzeTemplate = async (file: File): Promise<TemplateAnalysis> => {
  const { PDFDocument } = await import('pdf-lib');
  let pdf;
  try {
    pdf = await PDFDocument.load(await file.arrayBuffer());
  } catch {
    throw new Error('Não foi possível ler o PDF. Verifique se o arquivo não está corrompido ou protegido por senha.');
  }
  const names = pdf.getForm().getFields().map(f => f.getName());
  return {
    fields_total: names.length,
    fields_matched: names.filter(n => resolveFieldKey(n)).length
  };
};

// ---- Armazenamento local (modo demonstração) ----

const DB_NAME = 'controlphone_files';
const DB_STORE = 'tenant_documents';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Não foi possível acessar o armazenamento de arquivos do navegador.'));
  });

const idb = async <T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(DB_STORE, mode).objectStore(DB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Falha ao gravar o arquivo no navegador.'));
    });
  } finally {
    db.close();
  }
};

// O tenant_id é sempre o primeiro segmento do caminho: nenhum arquivo é compartilhado entre lojas
const pathOf = (tenantId: string, type: TenantDocumentType) => `${tenantId}/${type}.pdf`;

/** Grava o modelo da loja e devolve o caminho no Storage (indefinido quando ficou no navegador). */
export const saveTemplateFile = async (
  tenantId: string,
  type: TenantDocumentType,
  file: File
): Promise<string | undefined> => {
  const invalid = validateTemplateFile(file);
  if (invalid) throw new Error(invalid);
  const path = pathOf(tenantId, type);

  if (await hasSupabaseSession()) {
    const { error } = await supabase.storage
      .from(TENANT_DOCUMENTS_BUCKET)
      .upload(path, file, { contentType: 'application/pdf', upsert: true });
    if (error) throw new Error('Falha no envio do modelo: ' + error.message);
    return path;
  }

  // Blob puro (sem o nome original do arquivo)
  await idb('readwrite', s => s.put(file.slice(0, file.size, 'application/pdf'), path));
  return undefined;
};

export const loadTemplateFile = async (doc: Pick<TenantDocument, 'tenant_id' | 'type' | 'storage_path'>): Promise<ArrayBuffer | null> => {
  if (doc.storage_path) {
    const { data, error } = await supabase.storage.from(TENANT_DOCUMENTS_BUCKET).download(doc.storage_path);
    if (error || !data) return null;
    return data.arrayBuffer();
  }
  const blob = await idb<Blob | undefined>('readonly', s => s.get(pathOf(doc.tenant_id, doc.type)));
  return blob ? blob.arrayBuffer() : null;
};

export const deleteTemplateFile = async (doc: Pick<TenantDocument, 'tenant_id' | 'type' | 'storage_path'>): Promise<void> => {
  if (doc.storage_path) {
    const { error } = await supabase.storage.from(TENANT_DOCUMENTS_BUCKET).remove([doc.storage_path]);
    if (error) throw new Error('Não foi possível remover o modelo: ' + error.message);
    return;
  }
  await idb('readwrite', s => s.delete(pathOf(doc.tenant_id, doc.type)));
};

/** Abre o modelo original (sem preenchimento) em uma nova aba. */
export const openTemplateFile = async (doc: TenantDocument): Promise<boolean> => {
  const tab = window.open('', '_blank'); // aberta antes da leitura para não ser bloqueada como pop-up
  const bytes = await loadTemplateFile(doc).catch(() => null);
  if (!bytes) {
    tab?.close();
    return false;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  if (tab) tab.location.href = url;
  else window.open(url, '_blank');
  return true;
};

// ---- Geração a partir do modelo ----

/** Modelo da loja que pode ser preenchido automaticamente (com ao menos um campo reconhecido). */
export const findFillableTemplate = (tenantId: string, type: TenantDocumentType): TenantDocument | undefined =>
  store.tenantDocuments.find(d => d.tenant_id === tenantId && d.type === type && d.fields_matched > 0);

// As fontes padrão do PDF só cobrem o conjunto Latin-1: o que estiver fora dele é descartado
const printable = (value: string) => value.replace(/[^\t\n\r\x20-\xFF]/g, '');

/**
 * Preenche o modelo da loja com os dados do sistema.
 * Devolve null quando não há modelo utilizável; quem chama gera o documento no layout padrão.
 */
export const renderTenantTemplate = async (
  tenantId: string,
  type: TenantDocumentType,
  values: TemplateValues,
  options: { autoPrint?: boolean; footer?: string[] } = {}
): Promise<Blob | null> => {
  const meta = findFillableTemplate(tenantId, type);
  if (!meta) return null;
  const bytes = await loadTemplateFile(meta);
  if (!bytes) return null;

  const { PDFDocument, PDFTextField, PDFDropdown } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  let filled = 0;

  form.getFields().forEach(field => {
    const key = resolveFieldKey(field.getName());
    if (!key) return;
    const value = printable(values[key] ?? '');
    try {
      if (field instanceof PDFTextField) {
        const max = field.getMaxLength();
        field.setText(max ? value.slice(0, max) : value);
        filled += 1;
      } else if (field instanceof PDFDropdown && field.getOptions().includes(value)) {
        field.select(value);
        filled += 1;
      }
    } catch {
      // campo com formatação incompatível: permanece como está no modelo
    }
  });

  if (filled === 0) return null;
  form.flatten(); // o documento entregue ao cliente não fica editável

  // Avisos obrigatórios (ex.: comprovante de lacrado) escritos no pé da última página do modelo
  if (options.footer && options.footer.length > 0) {
    const { StandardFonts, rgb } = await import('pdf-lib');
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.getPages()[pdf.getPageCount() - 1];
    const size = 6.5;
    const maxWidth = page.getWidth() - 56;
    const wrap = (text: string) => text.split(' ').reduce<string[]>((lines, word) => {
      const last = lines[lines.length - 1];
      if (last !== undefined && font.widthOfTextAtSize(`${last} ${word}`, size) <= maxWidth) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
      return lines;
    }, []);
    const lines = options.footer.flatMap(text => [...wrap(printable(text)), '']);
    let y = 18 + lines.length * (size + 2);
    lines.forEach(line => {
      page.drawText(line, { x: 28, y, size, font, color: rgb(0.28, 0.33, 0.41) });
      y -= size + 2;
    });
  }
  if (options.autoPrint) pdf.addJavaScript('print', 'this.print(true);');
  const out = await pdf.save();
  return new Blob([out.buffer as ArrayBuffer], { type: 'application/pdf' });
};
