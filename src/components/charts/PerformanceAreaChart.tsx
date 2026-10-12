// ============================================================================
// CONTROLPHONE — GRÁFICO DE ONDA COM GRADIENTE AZUL (AREA CHART)
// ============================================================================

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { useAuth } from '../../context/AuthContext';

interface PerformanceAreaChartProps {
  data?: { name: string; value: number }[];
  title?: string;
  badge?: string;
}

const defaultData = [
  { name: 'Jan', value: 30 },
  { name: 'Fev', value: 45 },
  { name: 'Mar', value: 38 },
  { name: 'Abr', value: 55 },
  { name: 'Mai', value: 40 },
  { name: 'Jun', value: 85 }, // Pico da onda azul igual à referência
  { name: 'Jul', value: 65 },
  { name: 'Ago', value: 50 },
  { name: 'Set', value: 60 }
];

export const PerformanceAreaChart: React.FC<PerformanceAreaChartProps> = ({
  data = defaultData,
  title,
  badge = '+48.56%'
}) => {
  const { currentTheme } = useAuth();
  const primaryColor = currentTheme?.primary_color || '#1845E8';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm relative">
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-800 tracking-wide">{title}</h3>
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full border"
            style={{
              backgroundColor: `rgba(var(--tenant-primary-rgb), 0.1)`,
              color: primaryColor,
              borderColor: `rgba(var(--tenant-primary-rgb), 0.25)`
            }}
          >
            {badge}
          </span>
        </div>
      )}

      {/* Badge Flutuante no Pico com cor dinâmica da loja */}
      <div
        className="absolute top-12 right-1/3 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md z-10 hidden sm:block"
        style={{ backgroundColor: primaryColor }}
      >
        {badge}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="tenantWaveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={primaryColor} stopOpacity={0.7} />
                <stop offset="95%" stopColor={primaryColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />

            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94A3B8', fontSize: 11, fontWeight: 500 }}
              dy={8}
            />

            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94A3B8', fontSize: 11 }}
              domain={[0, 100]}
              ticks={[20, 40, 60, 80, 100]}
            />

            <Tooltip
              contentStyle={{
                backgroundColor: '#0B0F17',
                borderRadius: '12px',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
              }}
              formatter={(val: any) => [`${val} Vendas`, 'Volume']}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke={primaryColor}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#tenantWaveGradient)"
              activeDot={{ r: 6, fill: primaryColor, stroke: '#ffffff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
