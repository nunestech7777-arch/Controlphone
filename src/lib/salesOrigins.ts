// ============================================================================
// CONTROLPHONE — ORIGEM DO CLIENTE E DA VENDA
// Lista única usada no cadastro do cliente, na Nova Venda e no Upgrade.
// Sem "Ads": o cliente chegou sozinho (orgânico). Com "Ads": veio de anúncio pago.
// Vendas antigas guardam a origem escolhida na época (ex.: "TikTok", "Já era
// cliente") e continuam aparecendo assim nos relatórios: nada é convertido.
// ============================================================================

import { saleRevenue } from './saleFinance';
import { Sale } from '../types';

export const SALES_ORIGINS = [
  'Instagram',
  'Instagram Ads',
  'Facebook',
  'Facebook Ads',
  'WhatsApp',
  'WhatsApp Ads',
  'Google',
  'Google Ads',
  'Indicação',
  'Loja física',
  'Outros'
] as const;

export type SalesOrigin = (typeof SALES_ORIGINS)[number];

/** Origem paga (anúncio). Atendimento pelo WhatsApp não é anúncio por si só: só "WhatsApp Ads" é. */
export const isPaidOrigin = (origin?: string) => Boolean(origin && / Ads$/.test(origin.trim()));

export interface OriginSummary {
  origin: string;
  count: number;
  revenue: number;
  paid: boolean;
}

/**
 * Quantidade de vendas e faturamento por origem, da maior para a menor. Cada origem é uma linha:
 * orgânico e anúncio pago da mesma rede nunca são somados.
 */
export function salesByOrigin(sales: Sale[]): OriginSummary[] {
  const totals = new Map<string, { count: number; cents: number }>();
  sales.forEach(s => {
    const key = (s.sales_origin || 'Não informada').trim();
    const row = totals.get(key) || { count: 0, cents: 0 };
    row.count += 1;
    row.cents += Math.round(saleRevenue(s) * 100); // faturamento: inclui os juros cobrados no cartão
    totals.set(key, row);
  });
  return [...totals.entries()]
    .map(([origin, row]) => ({ origin, count: row.count, revenue: row.cents / 100, paid: isPaidOrigin(origin) }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);
}
