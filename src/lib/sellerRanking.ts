// ============================================================================
// CONTROLPHONE — FONTE ÚNICA DO RANKING E DAS METAS DE VENDEDORES
// Usada pelo Dashboard, pela aba Ranking e pela aba Metas da Equipe da Loja.
// Conta UNIDADES de aparelhos de vendas concluídas (sem acessórios, brindes,
// assistência, nem vendas canceladas).
// ============================================================================

import { store } from './store';

export type PeriodKey = 'today' | 'week' | 'month' | 'last_month' | 'last_3_months' | 'year' | 'custom';

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Hoje',
  week: 'Esta Semana',
  month: 'Este Mês',
  last_month: 'Mês Anterior',
  last_3_months: 'Últimos 3 Meses',
  year: 'Este Ano',
  custom: 'Personalizado'
};

// Filtro próprio do ranking (aba Equipe) e filtro global do Dashboard
export const RANKING_PERIODS: PeriodKey[] = ['today', 'week', 'month', 'last_month', 'custom'];
export const DASHBOARD_PERIODS: PeriodKey[] = ['today', 'week', 'month', 'last_month', 'last_3_months', 'year', 'custom'];

// Meta padrão usada quando o vendedor ainda não tem meta cadastrada no mês
export const DEFAULT_MONTHLY_GOAL = 10;

export const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const toMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

// Intervalo [início, fim] em horário local da loja
export const getPeriodRange = (period: PeriodKey, customFrom = '', customTo = ''): [Date, Date] => {
  const now = new Date();
  switch (period) {
    case 'today':
      return [startOfDay(now), endOfDay(now)];
    case 'week': {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // segunda-feira como início
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return [startOfDay(monday), endOfDay(sunday)];
    }
    case 'last_month':
      return [
        new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0),
        endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))
      ];
    case 'last_3_months': {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 3);
      return [startOfDay(start), endOfDay(now)];
    }
    case 'year':
      return [new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0), endOfDay(new Date(now.getFullYear(), 11, 31))];
    case 'custom': {
      const from = customFrom ? new Date(`${customFrom}T00:00:00`) : startOfDay(now);
      const to = customTo ? new Date(`${customTo}T23:59:59.999`) : endOfDay(now);
      return from <= to ? [from, to] : [startOfDay(to), endOfDay(from)];
    }
    case 'month':
    default:
      return [
        new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0))
      ];
  }
};

// Intervalo de um mês no formato 'YYYY-MM'
export const getMonthRange = (monthKey: string): [Date, Date] => {
  const [y, m] = monthKey.split('-').map(Number);
  return [new Date(y, m - 1, 1, 0, 0, 0, 0), endOfDay(new Date(y, m, 0))];
};

export interface SellerRankingRow {
  id: string;
  name: string;
  avatarUrl?: string;
  units: number;
  position: number; // empates compartilham a posição (1, 2, 2, 4...)
  isActive: boolean;
}

export const computeSellerRanking = (tenantId: string, from: Date, to: Date): SellerRankingRow[] => {
  const unitsBySeller = new Map<string, number>();

  store.sales
    .filter(s => {
      if (s.tenant_id !== tenantId || s.status !== 'completed') return false;
      const date = new Date(s.created_at);
      return date >= from && date <= to;
    })
    .forEach(sale => {
      const units = (sale.items || [])
        .filter(it => it.item_type === 'device' && !it.returned_at) // itens trocados/devolvidos não contam
        .reduce((acc, it) => acc + Number(it.quantity || 1), 0);
      if (units > 0) unitsBySeller.set(sale.seller_id, (unitsBySeller.get(sale.seller_id) || 0) + units);
    });

  // Vendedores ativos (mesmo com 0) + quem vendeu no período
  const ids = new Set<string>(
    store.profiles.filter(p => p.tenant_id === tenantId && p.role === 'seller' && p.is_active).map(p => p.id)
  );
  unitsBySeller.forEach((_, id) => ids.add(id));

  const entries = Array.from(ids)
    .map(id => {
      const profile = store.profiles.find(p => p.id === id);
      return {
        id,
        name: profile?.full_name || 'Vendedor',
        avatarUrl: profile?.avatar_url,
        isActive: profile?.is_active ?? false,
        units: unitsBySeller.get(id) || 0
      };
    })
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, 'pt-BR'));

  return entries.map(entry => ({
    ...entry,
    position: entries.findIndex(e => e.units === entry.units) + 1
  }));
};

export const getSellerGoal = (tenantId: string, sellerId: string, monthKey: string): number =>
  store.goals.find(g => g.tenant_id === tenantId && g.seller_id === sellerId && g.month_year === monthKey)
    ?.target_device_count || DEFAULT_MONTHLY_GOAL;

export const hasExplicitGoal = (tenantId: string, sellerId: string, monthKey: string): boolean =>
  store.goals.some(g => g.tenant_id === tenantId && g.seller_id === sellerId && g.month_year === monthKey);
