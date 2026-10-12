// ============================================================================
// CONTROLPHONE — AÇÕES COMUNS A QUALQUER DOCUMENTO EM PDF
// Visualizar, baixar, imprimir, enviar por WhatsApp e por e-mail.
// Usado pelos Documentos da Venda e pelos Documentos da Assistência.
// ============================================================================

import { jsPDF } from 'jspdf';
import { TenantDocumentType } from '../../types';
import { TemplateValues, findFillableTemplate, renderTenantTemplate } from '../tenantDocuments';

export interface BuiltDocument {
  doc: jsPDF; // layout padrão do sistema (usado quando a loja não tem modelo próprio preenchível)
  fileName: string;
  /** Modelo próprio da loja para este documento e os dados que o preenchem */
  template?: { tenantId: string; type: TenantDocumentType; values: TemplateValues };
}

export type DocumentAction = 'view' | 'download' | 'print' | 'whatsapp' | 'email';

export interface DocumentDelivery {
  text: string;     // mensagem enviada junto do documento
  subject: string;  // assunto do e-mail
  phone?: string;
  email?: string;
}

// Item de menu genérico: qualquer módulo monta sua lista e a interface não muda
export interface DocumentMenuItem {
  id: string;
  label: string;
  description: string;
  /** Documento previsto, ainda não disponível */
  comingSoon?: boolean;
  run?: (action: DocumentAction) => Promise<string>;
}

const usesTenantTemplate = (built: BuiltDocument) =>
  Boolean(built.template && findFillableTemplate(built.template.tenantId, built.template.type));

// PDF gerado sobre o modelo da loja; null (ou falha) faz o documento sair no layout padrão
async function renderCustom(built: BuiltDocument, autoPrint = false): Promise<Blob | null> {
  if (!built.template || !usesTenantTemplate(built)) return null;
  try {
    return await renderTenantTemplate(built.template.tenantId, built.template.type, built.template.values, { autoPrint });
  } catch (err) {
    console.warn('Modelo da loja indisponível; documento gerado no layout padrão.', err);
    return null;
  }
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Tenta compartilhar o PDF em si (celular/tablet abrem o WhatsApp ou o e-mail já com o arquivo)
async function shareFile(blob: Blob, fileName: string, text: string): Promise<boolean> {
  try {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: fileName, text });
      return true;
    }
  } catch {
    // compartilhamento cancelado ou indisponível: segue para a alternativa
  }
  return false;
}

/** Executa a ação e devolve uma mensagem curta para a tela (vazia quando não há o que avisar). */
export async function runBuiltDocumentAction(
  built: BuiltDocument,
  action: DocumentAction,
  delivery: DocumentDelivery
): Promise<string> {
  if (action === 'view' || action === 'print') {
    if (!usesTenantTemplate(built)) {
      if (action === 'print') built.doc.autoPrint();
      window.open(String(built.doc.output('bloburl')), '_blank');
      return '';
    }
    // A aba é aberta antes do preenchimento do modelo para não ser bloqueada como pop-up
    const tab = window.open('', '_blank');
    const custom = await renderCustom(built, action === 'print');
    if (!custom && action === 'print') built.doc.autoPrint();
    const url = custom ? URL.createObjectURL(custom) : String(built.doc.output('bloburl'));
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
    return '';
  }

  const custom = await renderCustom(built);
  const blob = custom || (built.doc.output('blob') as Blob);
  const save = () => (custom ? saveBlob(custom, built.fileName) : built.doc.save(built.fileName));

  if (action === 'download') {
    save();
    return '';
  }

  if (action === 'whatsapp') {
    const number = (delivery.phone || '').replace(/\D/g, '');
    if (!number) return 'O cliente não tem telefone ou WhatsApp cadastrado.';
    if (await shareFile(blob, built.fileName, delivery.text)) return 'Documento enviado para o compartilhamento do aparelho.';
    // No computador o WhatsApp não aceita anexo por link: baixa o PDF e abre a conversa pronta
    save();
    window.open(`https://wa.me/55${number}?text=${encodeURIComponent(delivery.text)}`, '_blank');
    return `O PDF foi baixado (${built.fileName}). Anexe o arquivo na conversa do WhatsApp que foi aberta.`;
  }

  if (!delivery.email) return 'O cliente não tem e-mail cadastrado.';
  if (await shareFile(blob, built.fileName, delivery.text)) return 'Documento enviado para o compartilhamento do aparelho.';
  save();
  window.location.href =
    `mailto:${delivery.email}?subject=${encodeURIComponent(delivery.subject)}&body=${encodeURIComponent(delivery.text)}`;
  return `O PDF foi baixado (${built.fileName}). Anexe o arquivo no e-mail que foi aberto.`;
}

const NO_DELIVERY: DocumentDelivery = { text: '', subject: '' };

export const downloadBuiltDocument = (built: BuiltDocument) => runBuiltDocumentAction(built, 'download', NO_DELIVERY);
export const viewBuiltDocument = (built: BuiltDocument) => runBuiltDocumentAction(built, 'view', NO_DELIVERY);
