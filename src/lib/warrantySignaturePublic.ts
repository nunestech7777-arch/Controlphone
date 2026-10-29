// ============================================================================
// CONTROLPHONE — COMPROVANTE DE GARANTIA: CHAMADAS DA PÁGINA PÚBLICA DO CLIENTE
// Separado de lib/warrantySignature para a página do link não baixar o sistema
// inteiro (estoque, PDFs...): só o cliente do Supabase.
// ============================================================================

import { supabase } from './supabase';

/** Resumo exibido na página pública. Sem valores, custos, lucros nem ids internos. */
export interface WarrantyReceiptSnapshot {
  store: { name: string; logo_url?: string; address?: string; phone?: string; cnpj?: string; primary_color?: string };
  sale: { number: number; date: string; seller: string };
  customer: { name: string; document?: string };
  devices: { description: string; color?: string; imei: string; warranty_days?: number; start_date?: string; end_date?: string }[];
  conditions: { title: string; paragraphs: string[] }[];
  notice: string;
}

const FUNCTION = 'warranty-signature';
export const OFFLINE = 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.';

type Result<T> = ({ ok: true } & T) | { ok: false; error: string; already_signed?: boolean; signed_at?: string };

export async function callWarrantySignature<T>(action: string, body: Record<string, unknown>): Promise<Result<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION, { body: { action, ...body } });
    if (error || !data || typeof data !== 'object') return { ok: false, error: OFFLINE };
    return data as Result<T>;
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

export type PublicReceipt = { status: 'pending' | 'signed'; signed_at?: string | null; snapshot: WarrantyReceiptSnapshot };

export const loadPublicReceipt = (token: string) => callWarrantySignature<PublicReceipt>('get', { token });
export const loadPublicReceiptPdf = (token: string) => callWarrantySignature<{ pdf_base64: string }>('pdf', { token });
export const confirmPublicReceipt = (token: string, signature: string) =>
  callWarrantySignature<{ signed_at: string }>('sign', { token, signature });
