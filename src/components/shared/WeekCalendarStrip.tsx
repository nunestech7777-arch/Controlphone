// ============================================================================
// CONTROLPHONE — SELETOR DE CALENDÁRIO SEMANAL EM PÍLULA IDÊNTICO À REFERÊNCIA
// ============================================================================

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface DayItem {
  dayName: string;
  dayNumber: number;
}

export const WeekCalendarStrip: React.FC = () => {
  const { currentTheme } = useAuth();
  const primaryColor = currentTheme?.primary_color || '#1845E8';
  const [selectedDay, setSelectedDay] = useState<number>(7);

  const days: DayItem[] = [
    { dayName: 'Seg', dayNumber: 5 },
    { dayName: 'Ter', dayNumber: 6 },
    { dayName: 'Qua', dayNumber: 7 }, // Destaque na imagem de referência
    { dayName: 'Qui', dayNumber: 8 },
    { dayName: 'Sex', dayNumber: 9 },
    { dayName: 'Sáb', dayNumber: 10 },
    { dayName: 'Dom', dayNumber: 11 }
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-800 tracking-wide">Outubro 2026</h3>

        <div className="flex items-center gap-1">
          <button
            title="Semana anterior"
            className="p-1 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            title="Próxima semana"
            className="p-1 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Faixa de Dias com Destaque Circular com cor dinâmica da loja */}
      <div className="grid grid-cols-7 gap-2 text-center">
        {days.map((item) => {
          const isSelected = item.dayNumber === selectedDay;
          return (
            <button
              key={item.dayNumber}
              onClick={() => setSelectedDay(item.dayNumber)}
              className="flex flex-col items-center gap-1.5 focus:outline-none group"
            >
              <span className="text-[11px] font-medium text-slate-400 group-hover:text-slate-600 transition-colors">
                {item.dayName}
              </span>

              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                  isSelected
                    ? 'text-white shadow-md'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: primaryColor,
                        boxShadow: `0 4px 12px rgba(var(--tenant-primary-rgb), 0.35)`
                      }
                    : undefined
                }
              >
                {item.dayNumber}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
