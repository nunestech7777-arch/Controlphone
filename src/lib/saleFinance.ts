// ============================================================================
// CONTROLPHONE — FATURAMENTO, JUROS DA MAQUININHA E LUCRO DA VENDA (FONTE ÚNICA)
//
//   valor dos produtos  = sale.total_amount (já sem descontos e sem devoluções)
//   juros da maquininha = cobrados do cliente no cartão de crédito (pagamento)
//   faturamento         = valor dos produtos + juros (tudo o que foi cobrado)
//   lucro bruto         = sale.gross_profit = valor dos produtos - custo acumulado
//                         (os juros nunca entram no lucro do aparelho)
//
// Os juros aqui são os COBRADOS do cliente. A taxa que a operadora desconta pode
// ser diferente e não é presumida igual (ainda não é registrada no sistema).
// Vendas antigas não têm juros: contam como zero.
// ============================================================================

import { Sale } from '../types';

const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);

/** Juros da maquininha cobrados na venda (soma dos pagamentos no crédito). */
export const saleInterest = (sale: Pick<Sale, 'card_interest' | 'payments'>): number =>
  sale.card_interest !== undefined
    ? Number(sale.card_interest) || 0
    : (sale.payments || []).reduce((acc, p) => acc + cents(p.interest), 0) / 100;

/** Faturamento da venda: tudo o que foi cobrado do cliente (produtos + juros). */
export const saleRevenue = (sale: Pick<Sale, 'total_amount' | 'card_interest' | 'payments'>): number =>
  (cents(sale.total_amount) + cents(saleInterest(sale))) / 100;

export interface PeriodFinance {
  /** Faturamento realizado: soma do que foi cobrado nas vendas */
  revenue: number;
  /** Juros da maquininha cobrados dos clientes */
  interest: number;
  /** Valor dos produtos vendidos (faturamento sem os juros) */
  products: number;
  /** Lucro bruto das vendas: produtos menos custos acumulados (sem os juros) */
  grossProfit: number;
  /** Custos acumulados dos produtos vendidos */
  cost: number;
}

/** Resumo financeiro de um conjunto de vendas concluídas (somado em centavos). */
export function periodFinance(sales: Sale[]): PeriodFinance {
  let products = 0, interest = 0, profit = 0, cost = 0;
  sales.forEach(s => {
    products += cents(s.total_amount);
    interest += cents(saleInterest(s));
    profit += cents(s.gross_profit);
    cost += cents(s.total_cost);
  });
  return { revenue: (products + interest) / 100, interest: interest / 100, products: products / 100, grossProfit: profit / 100, cost: cost / 100 };
}
