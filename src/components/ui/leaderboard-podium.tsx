// ============================================================================
// CONTROLPHONE — PÓDIO DO RANKING (TOP 3 COM COROA)
// Adaptado do componente leaderboard-podium: sem dependências de shadcn/cva,
// com suporte a empates (posições repetidas) e avatar com iniciais.
// ============================================================================

import * as React from 'react';
import { Crown } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LeaderboardRanking {
  userId: string;
  userName: string | null;
  rank: number;
  value: number;
  avatarUrl?: string | null;
}

type PodiumSize = 'sm' | 'default' | 'lg';

const PODIUM_CONFIG = {
  1: { color: 'text-rank-1', bg: 'bg-rank-1/60', height: { sm: 'h-24', default: 'h-32', lg: 'h-40' } },
  2: { color: 'text-rank-2', bg: 'bg-rank-2/30', height: { sm: 'h-20', default: 'h-24', lg: 'h-32' } },
  3: { color: 'text-rank-3', bg: 'bg-rank-3/50', height: { sm: 'h-16', default: 'h-20', lg: 'h-28' } }
} as const;

const SIZES: Record<PodiumSize, { gap: string; avatar: string; crownBadge: string; crownIcon: string; text: string; width: string }> = {
  sm: { gap: 'gap-2', avatar: 'h-10 w-10 text-sm', crownBadge: 'h-5 w-5', crownIcon: 'h-3 w-3', text: 'text-xs', width: 'w-[72px]' },
  default: { gap: 'gap-3 sm:gap-4', avatar: 'h-14 w-14 text-lg', crownBadge: 'h-6 w-6', crownIcon: 'h-4 w-4', text: 'text-sm', width: 'w-[84px] sm:w-[88px]' },
  lg: { gap: 'gap-6', avatar: 'h-20 w-20 text-2xl', crownBadge: 'h-8 w-8', crownIcon: 'h-5 w-5', text: 'text-base', width: 'w-24' }
};

interface LeaderboardPodiumProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Posições 1 a 3 (posições repetidas indicam empate) */
  rankings: LeaderboardRanking[];
  size?: PodiumSize;
  showValue?: boolean;
  showAvatar?: boolean;
  /** Formata o valor exibido abaixo do nome (padrão: número localizado) */
  formatValue?: (value: number) => string;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

const LeaderboardPodium = React.forwardRef<HTMLDivElement, LeaderboardPodiumProps>(
  ({ className, size = 'default', rankings, showValue = true, showAvatar = true, formatValue, ...props }, ref) => {
    const top3 = rankings.filter(r => r.rank >= 1 && r.rank <= 3);
    if (top3.length === 0) return null;

    // Ordem do pódio: 2º à esquerda, 1º no centro, 3º à direita (empates ficam lado a lado)
    const podiumOrder = [2, 1, 3].flatMap(rank => top3.filter(r => r.rank === rank));
    const s = SIZES[size];

    return (
      <div
        ref={ref}
        role="list"
        aria-label="Top 3 do ranking"
        className={cn('flex items-end justify-center', s.gap, className)}
        {...props}
      >
        {podiumOrder.map((ranking) => {
          const config = PODIUM_CONFIG[ranking.rank as 1 | 2 | 3];
          const displayName = ranking.userName || `Usuário ${ranking.userId.slice(0, 6)}`;
          const valueLabel = formatValue ? formatValue(ranking.value) : ranking.value.toLocaleString('pt-BR');

          return (
            <div
              key={ranking.userId}
              role="listitem"
              aria-label={`${ranking.rank}º lugar: ${displayName}${showValue ? `, ${valueLabel}` : ''}`}
              className={cn('flex flex-col items-center min-w-0', s.width)}
            >
              <div className="relative mb-2" aria-hidden="true">
                {showAvatar && ranking.avatarUrl ? (
                  <img
                    src={ranking.avatarUrl}
                    alt=""
                    className={cn('rounded-full object-cover', s.avatar)}
                  />
                ) : (
                  <div
                    className={cn(
                      'flex items-center justify-center rounded-full font-bold bg-slate-100 text-slate-600',
                      s.avatar
                    )}
                  >
                    {initials(displayName)}
                  </div>
                )}

                <div
                  className={cn(
                    'absolute -right-1 -bottom-1 flex items-center justify-center rounded-full bg-white shadow-sm border border-slate-100',
                    s.crownBadge
                  )}
                >
                  <Crown className={cn(s.crownIcon, config.color)} />
                </div>
              </div>

              <span
                className={cn('w-full truncate text-center font-semibold text-slate-800', s.text)}
                title={displayName}
              >
                {displayName}
              </span>

              {showValue && (
                <span className={cn('text-slate-500 tabular-nums text-center', size === 'sm' ? 'text-xs' : 'text-[13px]')}>
                  {valueLabel}
                </span>
              )}

              <div
                aria-hidden="true"
                className={cn('mt-2 w-full rounded-t-lg', config.height[size], config.bg)}
              >
                <div className={cn('flex h-8 items-center justify-center font-bold', config.color)}>
                  {ranking.rank}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
);
LeaderboardPodium.displayName = 'LeaderboardPodium';

export { LeaderboardPodium };
export type { LeaderboardPodiumProps };
