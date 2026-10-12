// ============================================================================
// CONTROLPHONE — SITUAÇÃO ADMINISTRATIVA DA GARANTIA COMERCIAL
// Estes status descrevem apenas a garantia comercial registrada pela loja;
// não encerram nem limitam os direitos legais do consumidor (CDC).
// ============================================================================

import { Warranty } from '../types';
import { toLocalDay } from './store';

export type WarrantyDisplayStatus = 'active' | 'expiring' | 'expired' | 'cancelled';

export const EXPIRING_WINDOW_DAYS = 7;

const dayNumber = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

// Dias corridos até o vencimento (0 = vence hoje, negativo = vencida)
export const getDaysRemaining = (w: Warranty): number => dayNumber(w.end_date) - dayNumber(toLocalDay(new Date()));

export const getWarrantyStatus = (w: Warranty): WarrantyDisplayStatus => {
  if (w.status === 'cancelled') return 'cancelled';
  const remaining = getDaysRemaining(w);
  if (remaining < 0) return 'expired';
  if (remaining <= EXPIRING_WINDOW_DAYS) return 'expiring';
  return 'active';
};

export const WARRANTY_STATUS_META: Record<WarrantyDisplayStatus, { label: string; cls: string }> = {
  active: { label: 'Ativa', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  expiring: { label: 'A vencer', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  expired: { label: 'Vencida', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  cancelled: { label: 'Cancelada', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
};

export const formatDay = (day?: string) => {
  if (!day) return '—';
  const [y, m, d] = day.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

export const CDC_NOTICE =
  'Prazo de garantia comercial concedido pela loja. Não substitui nem reduz os direitos legais do consumidor previstos no CDC.';
