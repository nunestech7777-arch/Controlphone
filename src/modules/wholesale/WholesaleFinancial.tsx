// ============================================================================
// CONTROLPHONE — ATACADO: FINANCEIRO (independente do financeiro do varejo)
// ============================================================================

import React, { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Plus, Receipt, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { formatBRL } from '../../lib/labels';
import { WholesaleController } from './useWholesale';
import { PeriodId, filterByPeriod, productPerformance, summarize } from './calc';
import { PeriodTabs } from './WholesaleDashboard';
import { Card, Empty, Field, Modal, StatCard, btnGhost, btnPrimary, formatDate, inputCls } from './ui';

interface Props {
  ctl: WholesaleController;
  color: string;
  period: PeriodId;
  onPeriod: (p: PeriodId) => void;
  onMessage: (text: string, kind?: 'ok' | 'error') => void;
}

const typeLabel = { sale: 'Venda', purchase: 'Compra', expense: 'Despesa' } as const;
const typeBadge = {
  sale: 'bg-emerald-50 text-emerald-700',
  purchase: 'bg-blue-50 text-blue-700',
  expense: 'bg-rose-50 text-rose-700'
} as const;

const today = () => new Date().toISOString().slice(0, 10);

export const WholesaleFinancial: React.FC<Props> = ({ ctl, color, period, onPeriod, onMessage }) => {
  const [filter, setFilter] = useState<'all' | 'sale' | 'purchase' | 'expense'>('all');
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expense, setExpense] = useState({ description: '', amount: '', date: today() });
  const [busy, setBusy] = useState(false);

  const transactions = filterByPeriod(ctl.data.transactions, t => t.occurred_at, period);
  const sales = filterByPeriod(ctl.data.sales, s => s.created_at, period);
  const sum = summarize(transactions);
  const ranking = productPerformance(sales);
  const rows = transactions.filter(t => filter === 'all' || t.type === filter);

  const saveExpense = async () => {
    const amount = Number(expense.amount);
    if (!expense.description.trim()) return onMessage('Descreva a despesa.', 'error');
    if (!(amount > 0)) return onMessage('Informe um valor maior que zero.', 'error');
    setBusy(true);
    const res = await ctl.run(() => ctl.repo.addExpense({
      description: expense.description, amount, occurredAt: `${expense.date}T12:00:00`
    }));
    setBusy(false);
    if (!res.ok) return onMessage(res.error, 'error');
    setExpenseOpen(false);
    setExpense({ description: '', amount: '', date: today() });
    onMessage('Despesa registrada.');
  };

  const removeExpense = async (id: string) => {
    const res = await ctl.run(() => ctl.repo.deleteExpense(id));
    if (!res.ok) onMessage(res.error, 'error');
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <PeriodTabs value={period} onChange={onPeriod} />
        <button type="button" className={btnPrimary} style={{ backgroundColor: color }} onClick={() => setExpenseOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> Nova despesa
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Receita (vendas)" value={formatBRL(sum.revenue)} icon={ArrowUpCircle} note={`${sum.salesCount} venda(s)`} />
        <StatCard title="Custo das mercadorias" value={formatBRL(sum.cogs)} icon={Receipt} />
        <StatCard title="Compras (entradas)" value={formatBRL(sum.purchases)} icon={ArrowDownCircle} note="Saída de caixa; não entra no lucro" />
        <StatCard title="Despesas" value={formatBRL(sum.expenses)} icon={Wallet} />
        <StatCard title="Lucro bruto" value={formatBRL(sum.grossProfit)} icon={TrendingUp}
          tone={sum.grossProfit >= 0 ? 'good' : 'bad'} note={`Margem ${sum.margin.toLocaleString('pt-BR')}%`} />
        <StatCard title="Lucro líquido" value={formatBRL(sum.netProfit)} icon={TrendingUp}
          tone={sum.netProfit >= 0 ? 'good' : 'bad'} note="Lucro bruto − despesas" />
      </div>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-800">Lucratividade por produto</h3>
          <p className="text-[11px] text-slate-400">Custo, preço médio de venda e margem (com o desconto rateado).</p>
        </div>
        {ranking.length === 0 ? (
          <Empty icon={TrendingUp} text="Nenhuma venda no período." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Vendidos</th>
                  <th className="px-4 py-3 text-right">Custo médio</th>
                  <th className="px-4 py-3 text-right">Venda média</th>
                  <th className="px-4 py-3 text-right">Margem</th>
                  <th className="px-4 py-3 text-right">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(r => (
                  <tr key={r.key} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-bold text-slate-800">{r.name}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{r.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatBRL(r.avgCost)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatBRL(r.avgPrice)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{r.margin.toLocaleString('pt-BR')}%</td>
                    <td className={`px-4 py-3 text-right font-bold ${r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatBRL(r.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-slate-800">Lançamentos</h3>
          <div className="flex gap-1.5 text-[11px] font-bold">
            {(['all', 'sale', 'purchase', 'expense'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`px-2.5 py-1.5 rounded-lg ${filter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {f === 'all' ? 'Todos' : typeLabel[f] + 's'}
              </button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty icon={Receipt} text="Nenhum lançamento no período." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                <span className="min-w-0 flex items-center gap-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${typeBadge[t.type]}`}>{typeLabel[t.type]}</span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-800 truncate">{t.description}</span>
                    <span className="block text-[11px] text-slate-400">{formatDate(t.occurred_at)}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`font-black ${t.type === 'sale' ? 'text-emerald-600' : 'text-slate-800'}`}>
                    {t.type === 'sale' ? '+' : '−'} {formatBRL(t.amount)}
                  </span>
                  {t.type === 'expense' && (
                    <button type="button" aria-label="Excluir despesa" onClick={() => removeExpense(t.id)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {expenseOpen && (
        <Modal
          title="Nova despesa do Atacado"
          onClose={() => setExpenseOpen(false)}
          footer={<>
            <button type="button" className={btnGhost} onClick={() => setExpenseOpen(false)}>Cancelar</button>
            <button type="button" className={btnPrimary} style={{ backgroundColor: color }} disabled={busy} onClick={saveExpense}>Salvar</button>
          </>}
        >
          <Field label="Descrição" required><input className={inputCls} value={expense.description} onChange={e => setExpense({ ...expense, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)" required><input type="number" min={0} step="0.01" className={inputCls} value={expense.amount} onChange={e => setExpense({ ...expense, amount: e.target.value })} /></Field>
            <Field label="Data"><input type="date" className={inputCls} value={expense.date} onChange={e => setExpense({ ...expense, date: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
};
