import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  changeText?: string;
  isPositive?: boolean;
  variant?: 'light' | 'primary';
  /** Oculta a seta de tendência quando o rodapé é uma legenda, não uma variação */
  showTrend?: boolean;
  /** Linhas secundárias (rótulo à esquerda, valor à direita) no lugar do rodapé de variação */
  details?: { label: string; value: string }[];
  /** Aviso discreto abaixo das linhas (ex.: dados pendentes) */
  note?: string;
  /** 'inline': em telas médias+, as linhas secundárias ficam ao lado do valor principal (card largo) */
  layout?: 'stacked' | 'inline';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon: Icon,
  changeText = '+4.58% no último mês',
  isPositive = true,
  variant = 'light',
  showTrend = true,
  details,
  note,
  layout = 'stacked'
}) => {
  const inline = layout === 'inline' && Boolean(details);
  const { currentTheme } = useAuth();
  const primaryColor = currentTheme?.primary_color || '#1845E8';
  const isPrimary = variant === 'primary';

  return (
    <div
      className={`rounded-2xl p-4 transition-all duration-200 shadow-sm flex flex-col justify-between ${
        inline ? 'md:flex-row md:items-center md:gap-6 ' : ''
      }${
        isPrimary
          ? 'text-white shadow-lg'
          : 'bg-white text-slate-800 border border-slate-200/80 hover:border-slate-300'
      }`}
      style={
        isPrimary
          ? {
              backgroundColor: primaryColor,
              boxShadow: `0 8px 25px -4px rgba(var(--tenant-primary-rgb), 0.35)`
            }
          : undefined
      }
    >
      <div className="flex items-center gap-3">
        {/* Ícone Circular no Lado Esquerdo */}
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
            isPrimary
              ? 'bg-white/20 border-white/30 text-white'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex flex-col">
          <span
            className={`text-[11px] font-semibold tracking-wide ${
              isPrimary ? 'text-white/85' : 'text-slate-400 uppercase'
            }`}
          >
            {title}
          </span>
          <span className="text-xl font-black tracking-tight leading-tight mt-0.5">
            {value}
          </span>
        </div>
      </div>

      {details ? (
        <div className={inline ? 'mt-3 md:mt-0 md:flex md:items-center md:gap-6' : 'mt-3'}>
          {details.map((row) => (
            <div
              key={row.label}
              className={`flex items-center justify-between gap-3 py-1.5 border-t text-[11px] ${
                inline ? 'md:flex-col md:items-start md:gap-0.5 md:py-0 md:pl-6 md:border-t-0 md:border-l md:text-xs ' : ''
              }${
                isPrimary ? 'border-white/15' : 'border-slate-100'
              }`}
            >
              <span className={`font-semibold tracking-wide ${isPrimary ? 'text-white/85' : 'text-slate-400 uppercase'}`}>
                {row.label}
              </span>
              <span className="font-extrabold tabular-nums whitespace-nowrap">{row.value}</span>
            </div>
          ))}
          {note && (
            <p className={`pt-1.5 text-[10px] font-medium ${inline ? 'md:pt-0 md:max-w-[180px] ' : ''}${isPrimary ? 'text-white/80' : 'text-amber-600'}`}>{note}</p>
          )}
        </div>
      ) : (
        <>
        {/* Indicador de Comparação / Variação */}
        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-1 text-[10px] font-semibold">
          {!showTrend ? null : isPositive ? (
            <TrendingUp className={`w-3 h-3 ${isPrimary ? 'text-white/85' : 'text-emerald-500'}`} />
          ) : (
            <TrendingDown className={`w-3 h-3 ${isPrimary ? 'text-white/85' : 'text-rose-500'}`} />
          )}
          <span className={isPrimary ? 'text-white/90' : !showTrend ? 'text-slate-500' : isPositive ? 'text-emerald-600' : 'text-rose-600'}>
            {changeText}
          </span>
        </div>
        </>
      )}
    </div>
  );
};
