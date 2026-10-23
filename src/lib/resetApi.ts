// ============================================================================
// CONTROLPHONE — RESET GERAL DA LOJA, CICLOS E HISTÓRICOS ARQUIVADOS (migration 27)
// Tudo é decidido e conferido no banco; aqui só ficam as chamadas.
// ============================================================================

import { supabase } from './supabase';
import { Customer, Device, Accessory, Gift, Sale, TradeIn, Warranty } from '../types';

export interface ResetPreview {
  cycle_number: number;
  cycle_started_at: string;
  summary: CycleSummary;
  documents_to_preserve: number;
  archive_price: number | null;
  open_order: ArchiveOrder | null;
}

export interface CycleSummary {
  sales: number;
  cancelled_sales: number;
  revenue: number;
  gross_profit: number;
  expenses: number;
  result: number;
  devices_sold: number;
  devices: number;
  devices_available: number;
  accessory_units: number;
  customers: number;
  suppliers: number;
  preserved_documents?: number;
}

export interface ArchiveOrder {
  id: string;
  tenant_id: string;
  amount: number;
  status: 'pending' | 'paid' | 'refused' | 'used';
  payment_reference?: string;
  refusal_reason?: string;
  created_at: string;
  confirmed_at?: string;
  used_at?: string;
}

export interface TenantCycle {
  id: string;
  tenant_id: string;
  number: number;
  status: 'active' | 'closed';
  started_at: string;
  ended_at?: string;
  archive_status: 'none' | 'archived' | 'not_archived';
  summary: CycleSummary;
  closed_by_name?: string;
}

export interface ResetRun {
  id: string;
  mode?: string;
  status: 'completed' | 'failed' | 'denied';
  user_name?: string;
  closed_cycle_number?: number;
  new_cycle_number?: number;
  payment_status?: string;
  archive_status?: string;
  preserved_documents?: number;
  error?: string;
  created_at: string;
}

export interface PreservedDocument {
  id: string;
  tenant_id: string;
  cycle_number: number;
  sale_id: string;
  sale_number: number;
  sale_date: string;
  sale_status: string;
  customer_name?: string;
  products?: string;
  imeis: string[];
  warranties: { type?: string; imei?: string; days?: number; start?: string; end?: string; status?: string; version?: string }[];
  store_name?: string;
  payload: {
    sale: Sale;
    customer?: Customer;
    seller_name?: string;
    warranties: Warranty[];
    devices: Device[];
    accessories?: Accessory[];
    gifts?: Gift[];
    trade_in?: TradeIn | null;
  };
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const message = (error: { message?: string; code?: string } | null, fallback: string) => {
  const text = error?.message || '';
  if (/reset_tenant_cycle|tenant_reset_preview|my_active_cycle|get_cycle_archive|create_archive_order|PGRST202/.test(text + (error?.code || ''))) {
    return 'O Reset Geral ainda não está ativo no banco (migration 27).';
  }
  if (!error?.code && /fetch|network|Failed/i.test(text)) return 'Sem conexão com o servidor. Nada foi alterado; tente de novo.';
  return text || fallback;
};

async function call<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<Result<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: message(error, fallback) };
  return { ok: true, data: data as T };
}

export const fetchResetPreview = (tenantId: string) =>
  call<ResetPreview>('tenant_reset_preview', { p_tenant_id: tenantId }, 'Não foi possível carregar o resumo da loja.');

export const setArchivePrice = (amount: number) =>
  call<{ ok: boolean; amount: number }>('set_archive_price', { p_amount: amount }, 'Não foi possível salvar o valor.');

export const createArchiveOrder = (tenantId: string) =>
  call<{ ok: boolean; id: string; amount: number }>('create_archive_order', { p_tenant_id: tenantId }, 'Não foi possível criar o pedido.');

export const confirmArchivePayment = (orderId: string, reference: string) =>
  call<{ ok: boolean }>('confirm_archive_payment', { p_order_id: orderId, p_reference: reference }, 'Não foi possível registrar o pagamento.');

export const refuseArchiveOrder = (orderId: string, reason: string) =>
  call<{ ok: boolean }>('refuse_archive_order', { p_order_id: orderId, p_reason: reason }, 'Não foi possível recusar o pedido.');

export async function resetTenant(p: {
  tenantId: string; mode: 'archive' | 'no_archive'; confirmName: string; requestId: string; orderId?: string;
}): Promise<Result<{ new_cycle_number: number; closed_cycle_number?: number; preserved_documents: number; archive_status: string; already?: boolean }>> {
  const res = await call<{ ok: boolean; error?: string } & Record<string, unknown>>('reset_tenant_cycle', {
    p_tenant_id: p.tenantId, p_mode: p.mode, p_confirm_name: p.confirmName, p_request_id: p.requestId, p_order_id: p.orderId ?? null
  }, 'Não foi possível reiniciar a loja. Nada foi alterado.');
  if (!res.ok) return res;
  if (!res.data.ok) return { ok: false, error: String(res.data.error || 'Não foi possível reiniciar a loja. Nada foi alterado.') };
  return { ok: true, data: res.data as never };
}

export async function fetchCycles(tenantId: string): Promise<Result<TenantCycle[]>> {
  const { data, error } = await supabase.from('tenant_cycles').select('*').eq('tenant_id', tenantId).order('number', { ascending: false });
  if (error) return { ok: false, error: message(error, 'Não foi possível carregar os ciclos.') };
  return { ok: true, data: (data || []) as TenantCycle[] };
}

export async function fetchResetRuns(tenantId: string): Promise<Result<ResetRun[]>> {
  const { data, error } = await supabase.from('tenant_reset_runs').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(20);
  if (error) return { ok: false, error: message(error, 'Não foi possível carregar o registro dos resets.') };
  return { ok: true, data: (data || []) as ResetRun[] };
}

export const fetchCycleArchive = (cycleId: string) =>
  call<{ cycle: TenantCycle; tables: Record<string, Record<string, unknown>[]> }>('get_cycle_archive', { p_cycle_id: cycleId }, 'Não foi possível abrir o histórico arquivado.');

export async function fetchPreservedDocuments(tenantId: string): Promise<Result<PreservedDocument[]>> {
  const { data, error } = await supabase.from('preserved_sale_documents').select('*').eq('tenant_id', tenantId).order('sale_number', { ascending: false });
  if (error) return { ok: false, error: message(error, 'Não foi possível carregar os documentos preservados.') };
  return { ok: true, data: (data || []) as PreservedDocument[] };
}

/** Ciclo ativo da loja do usuário (null: loja que nunca foi reiniciada ou banco sem a migration 27). */
export async function fetchActiveCycle(tenantId?: string): Promise<{ id: string; number: number } | null> {
  const { data, error } = await supabase.rpc('my_active_cycle', tenantId ? { p_tenant_id: tenantId } : {});
  if (error || !data) return null;
  return data as { id: string; number: number };
}
