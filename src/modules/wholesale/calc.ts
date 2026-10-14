// ============================================================================
// CONTROLPHONE — ATACADO: CÁLCULOS
// Funções puras. Só enxergam dados do Atacado.
//
//   Receita        = soma das vendas (já com desconto)
//   Custo (CMV)    = custo das mercadorias vendidas, congelado no momento da venda
//   Lucro bruto    = Receita − Custo
//   Lucro líquido  = Lucro bruto − Despesas
//   Compras        = entradas de estoque (saída de caixa; não entram no lucro,
//                    porque o custo já é contado quando a mercadoria é vendida)
// ============================================================================

import {
  WholesaleProduct, WholesaleSale, WholesaleSnapshot, WholesaleTransaction
} from './types';

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export interface FinanceSummary {
  revenue: number;
  cogs: number;
  purchases: number;
  expenses: number;
  grossProfit: number;
  netProfit: number;
  margin: number; // % sobre a receita
  salesCount: number;
}

export function summarize(transactions: WholesaleTransaction[]): FinanceSummary {
  let revenue = 0, cogs = 0, purchases = 0, expenses = 0, salesCount = 0;
  for (const t of transactions) {
    if (t.type === 'sale') { revenue += t.amount; cogs += t.cost; salesCount += 1; }
    else if (t.type === 'purchase') purchases += t.amount;
    else expenses += t.amount;
  }
  const grossProfit = revenue - cogs;
  return {
    revenue: round2(revenue),
    cogs: round2(cogs),
    purchases: round2(purchases),
    expenses: round2(expenses),
    grossProfit: round2(grossProfit),
    netProfit: round2(grossProfit - expenses),
    margin: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
    salesCount
  };
}

export interface ProductPerformance {
  key: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  avgCost: number;
  avgPrice: number;
}

/** Rentabilidade por produto. O desconto da venda é rateado entre os itens, para o total fechar com a receita. */
export function productPerformance(sales: WholesaleSale[]): ProductPerformance[] {
  const map = new Map<string, ProductPerformance>();
  for (const sale of sales) {
    const factor = sale.subtotal > 0 ? sale.total / sale.subtotal : 1;
    for (const item of sale.items) {
      const key = item.product_id || `nome:${item.product_name}`;
      const row = map.get(key) || {
        key, name: item.product_name, quantity: 0, revenue: 0, cost: 0, profit: 0, margin: 0, avgCost: 0, avgPrice: 0
      };
      row.name = item.product_name;
      row.quantity += item.quantity;
      row.revenue += item.unit_price * item.quantity * factor;
      row.cost += item.unit_cost * item.quantity;
      map.set(key, row);
    }
  }
  return [...map.values()]
    .map(row => {
      const profit = row.revenue - row.cost;
      return {
        ...row,
        revenue: round2(row.revenue),
        cost: round2(row.cost),
        profit: round2(profit),
        margin: row.revenue > 0 ? round2((profit / row.revenue) * 100) : 0,
        avgCost: row.quantity > 0 ? round2(row.cost / row.quantity) : 0,
        avgPrice: row.quantity > 0 ? round2(row.revenue / row.quantity) : 0
      };
    })
    .sort((a, b) => b.profit - a.profit);
}

export const stockValue = (products: WholesaleProduct[]) =>
  round2(products.reduce((acc, p) => acc + p.quantity * p.cost_price, 0));

export const stockUnits = (products: WholesaleProduct[]) =>
  products.reduce((acc, p) => acc + p.quantity, 0);

// ---- Período ----

export type PeriodId = 'today' | '7d' | 'month' | 'all';

export const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: 'today', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: 'month', label: 'Este mês' },
  { id: 'all', label: 'Tudo' }
];

export function periodStart(period: PeriodId, now = new Date()): Date | null {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return day;
  if (period === '7d') { day.setDate(day.getDate() - 6); return day; }
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

export function filterByPeriod<T>(rows: T[], dateOf: (row: T) => string, period: PeriodId): T[] {
  const start = periodStart(period);
  if (!start) return rows;
  const from = start.getTime();
  return rows.filter(row => new Date(dateOf(row)).getTime() >= from);
}

// ---- Operações usadas pela implementação de demonstração (o banco faz o mesmo nas funções SQL) ----

export function nextSaleNumber(sales: WholesaleSale[]): number {
  return sales.reduce((max, s) => Math.max(max, s.sale_number), 0) + 1;
}

/** Custo médio ponderado depois de uma entrada de estoque. */
export function weightedCost(product: WholesaleProduct, quantity: number, unitCost: number): number {
  const total = product.quantity + quantity;
  if (total <= 0) return round2(unitCost);
  return round2((product.quantity * product.cost_price + quantity * unitCost) / total);
}

export const emptySnapshot = (): WholesaleSnapshot => ({
  products: [], suppliers: [], customers: [], sales: [], transactions: []
});
