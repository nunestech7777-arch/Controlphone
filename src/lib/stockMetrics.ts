// ============================================================================
// CONTROLPHONE — INDICADORES DO ESTOQUE DISPONÍVEL (FONTE ÚNICA)
// Usado pelo Dashboard e pela tela de Estoque. Considera somente aparelhos
// disponíveis para venda e soma em centavos, garantindo:
//   Valor Total do Estoque = Capital Investido + Lucro Potencial
// ============================================================================

import { store } from './store';

export interface StockMetrics {
  availableCount: number;
  stockSaleValue: number;   // soma dos preços sugeridos
  investedCapital: number;  // soma dos custos acumulados (aquisição + manutenções)
  potentialProfit: number;
  pendingDevices: number;   // aparelhos sem preço sugerido ou sem custo de aquisição
}

const toCents = (v: unknown) => Math.round((Number(v) || 0) * 100);

export const computeStockMetrics = (tenantId: string): StockMetrics => {
  const available = store.devices.filter(d => d.tenant_id === tenantId && d.status === 'available');

  const valueCents = available.reduce((acc, d) => acc + toCents(d.suggested_price), 0);
  const investedCents = available.reduce(
    (acc, d) => acc + toCents(d.acquisition_cost) + toCents(d.accumulated_repair_cost), 0
  );

  return {
    availableCount: available.length,
    stockSaleValue: valueCents / 100,
    investedCapital: investedCents / 100,
    potentialProfit: (valueCents - investedCents) / 100,
    pendingDevices: available.filter(
      d => !(Number(d.suggested_price) > 0) || !(Number(d.acquisition_cost) > 0)
    ).length
  };
};

export const formatBRL = (val: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export const pendingStockNote = (pending: number): string | undefined =>
  pending > 0
    ? `${pending} ${pending === 1 ? 'aparelho' : 'aparelhos'} com preço ou custo pendente: totais parciais.`
    : undefined;
