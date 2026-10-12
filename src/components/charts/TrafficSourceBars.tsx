// ============================================================================
// CONTROLPHONE — BARRAS HORIZONTAIS DE ORIGEM DAS VENDAS (TRAFFIC SOURCE)
// ============================================================================

import React from 'react';
import { useAuth } from '../../context/AuthContext';

interface TrafficSourceItem {
  name: string;
  /** Define o tamanho da barra (0 a 100) */
  percentage: number;
  /** Texto exibido à direita; por padrão, a própria porcentagem */
  valueText?: string;
}

interface TrafficSourceBarsProps {
  sources?: TrafficSourceItem[];
  title?: string;
  emptyText?: string;
  className?: string;
  /** Card largo: distribui os itens em colunas em vez de uma única coluna */
  columns?: boolean;
}

export const TrafficSourceBars: React.FC<TrafficSourceBarsProps> = ({
  sources = [],
  title = 'Origem das Vendas',
  emptyText = 'Nenhuma venda registrada para exibir os canais.',
  className = '',
  columns = false
}) => {
  const { currentTheme } = useAuth();
  const primaryColor = currentTheme?.primary_color || '#1845E8';

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm ${className}`}>
      <h3 className="text-sm font-bold text-slate-800 tracking-wide mb-4">{title}</h3>

      {sources.length === 0 && (
        <p className="text-xs font-medium text-slate-400 py-4">{emptyText}</p>
      )}

      <div className={columns ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-x-8 gap-y-4' : 'space-y-4'}>
        {sources.map((item, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 font-medium truncate" title={item.name}>{item.name}</span>
              <span className="text-slate-800 font-bold shrink-0">{item.valueText ?? `${item.percentage}%`}</span>
            </div>

            {/* Barra de Progresso com estilo da referência e cores dinâmicas da loja */}
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(item.percentage, 100)}%`,
                  backgroundColor: primaryColor
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
