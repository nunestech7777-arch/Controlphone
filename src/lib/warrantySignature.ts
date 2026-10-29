// ============================================================================
// CONTROLPHONE — COMPROVANTE DE GARANTIA COM RUBRICA DIGITAL
// Só o envio do Termo de Garantia por WhatsApp passa por aqui (modo real): em vez
// do PDF, o cliente recebe um link individual, confere o comprovante, faz a rubrica
// e confirma. A função edge "warranty-signature" guarda o PDF, cria o token e
// incorpora a rubrica no servidor; a tabela warranty_signatures (migration 28)
// avisa em tempo real quando o cliente confirma.
// Os demais documentos, canais e a demonstração (sem banco) seguem como sempre.
// ============================================================================

import { supabase } from './supabase';
import { store } from './store';
import { BuiltDocument, renderBuiltDocumentBlob, sendPdfByWhatsApp } from './pdf/documentActions';
import { warrantyTermConditions } from './pdf/warrantyTermPDF';
import type { SaleDocContext } from './pdf/saleDocuments';
import { CDC_NOTICE } from './warrantyStatus';
import { OFFLINE, WarrantyReceiptSnapshot, callWarrantySignature } from './warrantySignaturePublic';

export const SIGNED_WARRANTY_DOCUMENT = 'warranty-term';

export interface WarrantySignatureRow {
  id: string;
  sale_id: string;
  status: 'pending' | 'signing' | 'signed';
  link_sent_at: string;
  signed_at?: string | null;
  signed_pdf_path?: string | null;
}

// O CPF aparece parcialmente na página pública: quem tiver o link não lê o documento inteiro
const maskCpf = (cpf?: string) => {
  const d = (cpf || '').replace(/\D/g, '');
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : undefined;
};

// A logo da loja fica guardada como imagem embutida (data:image) e pode ter centenas de KB:
// a página do cliente só exibe 48 px, então vai uma miniatura de até 128 px
function logoThumbnail(url?: string): Promise<string | undefined> {
  if (!url) return Promise.resolve(undefined);
  if (!url.startsWith('data:image')) return Promise.resolve(url);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 128 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(undefined);
      }
    };
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}

async function buildSnapshot(ctx: SaleDocContext): Promise<WarrantyReceiptSnapshot> {
  const storeName = ctx.theme?.display_name || ctx.tenant.trade_name;
  const t = ctx.tenant;
  const address = [[t.address_street, t.address_number].filter(Boolean).join(', '), t.address_neighborhood,
    [t.address_city, t.address_state].filter(Boolean).join('/')].filter(Boolean).join(' - ');
  const devices = (ctx.sale.items || [])
    .filter(it => it.item_type === 'device' && it.device_id && !it.returned_at && it.device_type !== 'lacrado')
    .map(it => {
      const d = store.devices.find(x => x.id === it.device_id);
      const w = store.warranties.find(x => x.sale_item_id === it.id);
      return d && {
        description: `${d.brand} ${d.model} ${d.storage_capacity}`.trim(),
        color: d.color,
        imei: d.imei,
        warranty_days: w?.warranty_days,
        start_date: w?.start_date,
        end_date: w?.end_date
      };
    })
    .filter((d): d is NonNullable<typeof d> => Boolean(d));
  return {
    store: {
      name: storeName, logo_url: await logoThumbnail(ctx.theme?.logo_url || ctx.theme?.logo_compact_url), address: address || undefined, phone: t.phone,
      cnpj: t.cnpj, primary_color: ctx.theme?.primary_color
    },
    sale: { number: ctx.sale.sale_number, date: ctx.sale.created_at, seller: ctx.sellerName },
    customer: { name: ctx.customer?.name || 'Cliente', document: maskCpf(ctx.customer?.cpf) },
    devices,
    conditions: warrantyTermConditions(storeName),
    notice: CDC_NOTICE
  };
}

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const usesWarrantySignatureLink = (documentId: string) =>
  store.isRealMode && documentId === SIGNED_WARRANTY_DOCUMENT;

/**
 * Gera o link individual do comprovante e abre o WhatsApp com a mensagem e o link.
 * Devolve a mensagem curta para a tela.
 */
export async function sendWarrantyLinkByWhatsApp(built: BuiltDocument, ctx: SaleDocContext, message: string): Promise<string> {
  const number = (ctx.customer?.whatsapp || ctx.customer?.phone || '').replace(/\D/g, '');
  if (!number) return 'O cliente não tem telefone ou WhatsApp cadastrado.';

  // A aba é aberta antes das etapas no servidor para não ser bloqueada como pop-up
  const tab = window.open('', '_blank');
  try {
    await store.pushUnsynced(); // a venda precisa estar no servidor
    const pdf = await blobToBase64(await renderBuiltDocumentBlob(built));
    const result = await callWarrantySignature<{ token: string }>('prepare', {
      tenant_id: ctx.sale.tenant_id, sale_id: ctx.sale.id, snapshot: await buildSnapshot(ctx), pdf_base64: pdf
    });
    if (!result.ok) {
      tab?.close();
      return result.error;
    }
    const link = `${window.location.origin}/garantia/${result.token}`;
    const text = `${message}\n\nConfira o comprovante, faça sua rubrica e confirme pelo link:\n${link}`;
    const url = `https://wa.me/55${number}?text=${encodeURIComponent(text)}`;
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
    return 'Link do comprovante enviado. O status aparece em Detalhes da Venda > Garantia.';
  } catch {
    tab?.close();
    return OFFLINE;
  }
}

// ---------------------------------------------------------------------------
// Detalhes da venda (usuários da loja)
// ---------------------------------------------------------------------------

export async function fetchWarrantySignature(tenantId: string, saleId: string): Promise<WarrantySignatureRow | null> {
  const { data } = await supabase
    .from('warranty_signatures')
    .select('id, sale_id, status, link_sent_at, signed_at, signed_pdf_path')
    .eq('tenant_id', tenantId).eq('sale_id', saleId).eq('document_id', SIGNED_WARRANTY_DOCUMENT)
    .maybeSingle();
  return (data as WarrantySignatureRow | null) || null;
}

/** Tempo real: chama `onChange` quando o registro desta venda muda. Devolve a função que encerra a escuta. */
export function watchWarrantySignature(tenantId: string, saleId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`garantia-rubrica-${saleId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'warranty_signatures', filter: `tenant_id=eq.${tenantId}` },
      (payload: { new?: Record<string, unknown> }) => {
        if (payload.new?.sale_id === saleId) onChange();
      })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

/** Visualizar ou baixar o PDF assinado (link temporário; o bucket é privado e segue as permissões das vendas). */
export async function openSignedReceipt(row: WarrantySignatureRow, saleNumber: number, mode: 'view' | 'download'): Promise<string> {
  if (!row.signed_pdf_path) return 'Comprovante assinado indisponível.';
  const fileName = `Comprovante_Garantia_Assinado_Venda_${saleNumber}.pdf`;
  // aberta antes da consulta para não ser bloqueada como pop-up (celular)
  const tab = mode === 'view' ? window.open('', '_blank') : null;
  const { data, error } = await supabase.storage
    .from('warranty-receipts')
    .createSignedUrl(row.signed_pdf_path, 300, mode === 'download' ? { download: fileName } : undefined);
  if (error || !data?.signedUrl) {
    tab?.close();
    return 'Não foi possível abrir o comprovante. Verifique sua permissão e a internet.';
  }
  if (mode === 'view') {
    if (tab) tab.location.href = data.signedUrl;
    else window.open(data.signedUrl, '_blank');
  } else {
    const link = document.createElement('a');
    link.href = data.signedUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  return '';
}

/** Envia ao cliente, pelo WhatsApp, o PDF assinado (com a rubrica) guardado no servidor. */
export async function sendSignedReceiptByWhatsApp(
  row: WarrantySignatureRow, p: { saleNumber: number; storeName: string; customerName?: string; phone?: string }
): Promise<string> {
  if (!row.signed_pdf_path) return 'Comprovante assinado indisponível.';
  if (!(p.phone || '').replace(/\D/g, '')) return 'O cliente não tem telefone ou WhatsApp cadastrado.';
  const { data, error } = await supabase.storage.from('warranty-receipts').download(row.signed_pdf_path);
  if (error || !data) return 'Não foi possível buscar o comprovante. Verifique sua permissão e a internet.';
  const text = `Olá ${p.customerName || ''}, segue o seu Comprovante de Garantia da ${p.storeName} (venda nº ${p.saleNumber}), com a sua rubrica registrada.`;
  return sendPdfByWhatsApp(
    new Blob([data], { type: 'application/pdf' }), `Comprovante_Garantia_Assinado_Venda_${p.saleNumber}.pdf`, p.phone, text
  );
}
