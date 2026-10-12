// ============================================================================
// CONTROLPHONE — RANKING DE VENDEDORES (APARELHOS VENDIDOS NO PERÍODO)
// Dashboard e aba Ranking da Equipe usam este mesmo componente e a mesma lógica
// (src/lib/sellerRanking.ts). Não usa faturamento, custo ou margem.
// ============================================================================

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LeaderboardPodium } from '../ui/leaderboard-podium';
import { UserAvatar } from '../shared/UserAvatar';
import {
  PeriodKey,
  PERIOD_LABELS,
  RANKING_PERIODS,
  computeSellerRanking,
  getPeriodRange,
  getSellerGoal,
  toInputDate,
  toMonthKey
} from '../../lib/sellerRanking';

interface SellerRankingChartProps {
  tenantId: string;
  /** Mostra o progresso da meta mensal ao lado de cada vendedor (somente no período "Este Mês") */
  showGoals?: boolean;
  title?: string;
  /** Período controlado por um filtro externo (Dashboard). Quando informado, o seletor próprio some. */
  range?: [Date, Date];
  /** Chave do período externo, usada para saber se a meta mensal se aplica */
  externalPeriod?: PeriodKey;
}

export const SellerRankingChart: React.FC<SellerRankingChartProps> = ({
  tenantId,
  showGoals = false,
  title = 'Ranking de Vendedores',
  range,
  externalPeriod
}) => {
  const { currentTheme } = useAuth();
  const primaryColor = currentTheme?.primary_color || '#1845E8';

  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(() => toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => toInputDate(new Date()));

  const [from, to] = range || getPeriodRange(period, customFrom, customTo);
  const activePeriod = range ? externalPeriod : period;
  const ranked = computeSellerRanking(tenantId, from, to);

  // Pódio: posições 1 a 3 que realmente venderam; demais (inclusive com 0) seguem em barras
  const podiumRows = ranked.filter(r => r.position <= 3 && r.units > 0);
  const listRows = ranked.filter(r => !(r.position <= 3 && r.units > 0));
  const maxUnits = Math.max(0, ...ranked.map(r => r.units));
  const totalUnits = ranked.reduce((acc, r) => acc + r.units, 0);

  const goalMonth = toMonthKey(new Date());
  const goalsApply = showGoals && activePeriod === 'month';

  const goalLabel = (sellerId: string, units: number) => {
    const goal = getSellerGoal(tenantId, sellerId, goalMonth);
    return `${units}/${goal} (${Math.round((units / goal) * 100)}%)`;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm h-full">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 tracking-wide">{title}</h3>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Aparelhos vendidos no período{totalUnits > 0 ? ` | ${totalUnits} no total` : ''}
          </p>
        </div>

        {!range && (
        <div className="flex flex-wrap items-center gap-2">
          {period === 'custom' && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="Data inicial"
                className="px-2 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-xs"
              />
              <span>até</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="Data final"
                className="px-2 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-xs"
              />
            </div>
          )}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKey)}
            aria-label="Período do ranking"
            className="px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-xs font-semibold text-slate-700 bg-white"
          >
            {RANKING_PERIODS.map((key) => (
              <option key={key} value={key}>{PERIOD_LABELS[key]}</option>
            ))}
          </select>
        </div>
        )}
      </div>

      {totalUnits === 0 ? (
        <div className="h-56 flex items-center justify-center text-center">
          <p className="text-xs font-medium text-slate-400">Nenhuma venda registrada neste período.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {podiumRows.length > 0 && (
            <LeaderboardPodium
              rankings={podiumRows.map(r => ({
                userId: r.id,
                userName: r.name,
                rank: r.position,
                value: r.units,
                avatarUrl: r.avatarUrl
              }))}
              formatValue={(n) => `${n} ${n === 1 ? 'aparelho' : 'aparelhos'}`}
            />
          )}

          {goalsApply && podiumRows.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
              {podiumRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="truncate font-semibold text-slate-600" title={r.name}>{r.name}</span>
                  <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{goalLabel(r.id, r.units)}</span>
                </li>
              ))}
            </ul>
          )}

          {listRows.length > 0 && (
            <ol className={`space-y-2.5 pr-1 border-t border-slate-100 pt-4 ${showGoals ? '' : 'max-h-40 overflow-y-auto'}`}>
              {listRows.map((row) => {
                const widthPct = maxUnits > 0 ? Math.max(row.units > 0 ? 3 : 0, (row.units / maxUnits) * 100) : 0;
                return (
                  <li key={row.id} className="flex items-center gap-2 sm:gap-3">
                    <span className="w-7 shrink-0 text-xs font-bold text-slate-500 tabular-nums">{row.position}º</span>
                    <UserAvatar name={row.name} src={row.avatarUrl} size="sm" />
                    <span className="w-20 sm:w-32 shrink-0 truncate text-xs font-semibold text-slate-700" title={row.name}>
                      {row.name}
                    </span>
                    <div className="flex-1 min-w-0 h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${widthPct}%`, backgroundColor: primaryColor, opacity: 0.6 }}
                      />
                    </div>
                    <span className="w-12 sm:w-24 shrink-0 text-right text-xs font-bold text-slate-700 tabular-nums">
                      {row.units}
                      <span className="hidden sm:inline font-medium text-slate-400"> {row.units === 1 ? 'aparelho' : 'aparelhos'}</span>
                    </span>
                    {goalsApply && (
                      <span className="hidden md:inline w-24 shrink-0 text-right text-[11px] font-semibold text-slate-500 tabular-nums">
                        {goalLabel(row.id, row.units)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
};
