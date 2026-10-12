// ============================================================================
// CONTROLPHONE — GRÁFICO DONUT "TOP PRODUCT SALE" IDÊNTICO À REFERÊNCIA
// ============================================================================

import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../../context/AuthContext';

interface TopProductsDonutChartProps {
  totalSaleText?: string;
  items?: { name: string; value: number; color: string }[];
}

export const TopProductsDonutChart: React.FC<TopProductsDonutChartProps> = ({
  totalSaleText = '95 un.',
  items
}) => {
  const { currentTheme } = useAuth();
  const primaryColor = currentTheme?.primary_color || '#1845E8';

  const chartItems = items || [
    { name: 'iPhone 15 Pro / Max', value: 55, color: primaryColor },
    { name: 'Linha iPhone 14', value: 30, color: '#0B0F17' },
    { name: 'Acessórios & Brindes', value: 15, color: '#CBD5E1' }
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800 tracking-wide mb-3">Produtos Mais Vendidos</h3>

      {chartItems.length === 0 && (
        <p className="text-xs font-medium text-slate-400 py-10 text-center">Nenhuma venda registrada neste período.</p>
      )}

      <div className={`flex-col sm:flex-row items-center justify-between gap-4 ${chartItems.length === 0 ? 'hidden' : 'flex'}`}>
        {/* Gráfico Donut com texto centralizado */}
        <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartItems}
                cx="50%"
                cy="50%"
                innerRadius={46}
                outerRadius={62}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
              >
                {chartItems.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Texto no centro da rosca: "Total Vendas" */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
            <span className="text-[10px] text-slate-400 font-medium uppercase leading-tight">Total Vendas</span>
            <span className="text-sm font-extrabold text-slate-800 leading-tight">{totalSaleText}</span>
          </div>
        </div>

        {/* Legenda Lateral com marcadores quadrados */}
        <div className="space-y-2.5 flex-1 w-full pl-2">
          {chartItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-slate-600 font-medium truncate flex-1" title={item.name}>{item.name}</span>
              <span className="text-slate-400 font-semibold text-[11px]">{item.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
