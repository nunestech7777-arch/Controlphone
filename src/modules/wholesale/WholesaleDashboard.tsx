// ============================================================================
// CONTROLPHONE — ATACADO: DASHBOARD (indicadores só do Atacado)
// ============================================================================

import React from 'react';
import { Boxes, DollarSign, Package, Receipt, TrendingUp, Users } from 'lucide-react';
import { formatBRL } from '../../lib/labels';
import { WholesaleController } from './useWholesale';
import { PERIOD_OPTIONS, PeriodId, filterByPeriod, stockValue, summarize } from './calc';
import { Card, Empty, StatCard, formatDateTime } from './ui';

export const PeriodTabs: React.FC<{ value: PeriodId; onChange: (p: PeriodId) => void }> = ({ value, onChange }) => (
  <div className="inline-flex p-1 rounded-xl bg-slate-100 text-xs font-bold" role="tablist" aria-label="Período">
    {PERIOD_OPTIONS.map(opt => (
      <button key={opt.id} type="button" role="tab" aria-selected={value === opt.id} onClick={() => onChange(opt.id)}
        className={`px-3 py-2 rounded-lg transition ${value === opt.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
        {opt.label}
      </button>
    ))}
  </div>
);

export const WholesaleDashboard: React.FC<{
  ctl: WholesaleController;
  period: PeriodId;
  onPeriod: (p: PeriodId) => void;
}> = ({ ctl, period, onPeriod }) => {
  const { products, customers, sales, transactions } = ctl.data;
  const sum = summarize(filterByPeriod(transactions, t => t.occurred_at, period));
  const latest = sales.slice(0, 6);

  return (
    <div className="space-y-5 animate-fade-in">
      <PeriodTabs value={period} onChange={onPeriod} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Valor em estoque" value={formatBRL(stockValue(products))} icon={Boxes} note="A preço de custo" />
        <StatCard title="Produtos" value={String(products.length)} icon={Package} />
        <StatCard title="Clientes" value={String(customers.length)} icon={Users} />
        <StatCard title="Receita" value={formatBRL(sum.revenue)} icon={DollarSign} note={`${sum.salesCount} venda(s) no período`} />
        <StatCard title="Lucro bruto" value={formatBRL(sum.grossProfit)} icon={TrendingUp} tone={sum.grossProfit >= 0 ? 'good' : 'bad'} />
        <StatCard title="Lucro líquido" value={formatBRL(sum.netProfit)} icon={TrendingUp} tone={sum.netProfit >= 0 ? 'good' : 'bad'} note="Depois das despesas" />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-800">Últimas vendas</h3>
        </div>
        {latest.length === 0 ? (
          <Empty icon={Receipt} text="Nenhuma venda do Atacado ainda." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {latest.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                <span className="min-w-0">
                  <span className="block font-bold text-slate-800 truncate">#{s.sale_number} · {s.customer_name}</span>
                  <span className="block text-[11px] text-slate-400">{formatDateTime(s.created_at)} · {s.payment_method}</span>
                </span>
                <span className="font-black text-slate-900 shrink-0">{formatBRL(s.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
