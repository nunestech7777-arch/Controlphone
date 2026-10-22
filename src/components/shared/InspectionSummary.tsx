// ============================================================================
// CONTROLPHONE — RESUMO DA VISTORIA DO SEMINOVO (somente leitura)
// Mostrado nos detalhes da venda, na garantia (Garantias e perfil do cliente)
// e na Assistência Técnica, sempre ligado ao IMEI vendido.
// ============================================================================

import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { DeviceInspection } from '../../types';
import { INSPECTION_ITEMS } from '../../lib/deviceInspection';
import { store } from '../../lib/store';

export const InspectionSummary: React.FC<{ inspection: DeviceInspection; title?: string }> = ({ inspection, title }) => {
  const seller = store.profiles.find(p => p.id === inspection.inspected_by)?.full_name;
  const when = new Date(inspection.inspected_at);
  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-slate-700 flex items-center gap-1.5">
          <ClipboardCheck className="w-3.5 h-3.5 text-slate-500" />
          {title || 'Vistoria na venda'}
        </span>
        <span className="text-[11px] text-slate-500">
          IMEI <span className="font-mono">{inspection.imei}</span>
          {' · '}{when.toLocaleDateString('pt-BR')} às {when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {seller ? ` · ${seller}` : ''}
        </span>
      </div>
      <ul className="space-y-1">
        {INSPECTION_ITEMS.map(({ key, label }) => {
          const ok = inspection.answers[key];
          return (
            <li key={key} className="flex items-start justify-between gap-3">
              <span className="text-slate-600">{label}</span>
              <span className={`shrink-0 px-2 py-0.5 rounded border text-[10px] font-bold ${
                ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {ok ? 'SIM' : 'NÃO'}
              </span>
            </li>
          );
        })}
      </ul>
      {inspection.notes && (
        <p className="text-slate-600"><span className="font-semibold">Observações:</span> {inspection.notes}</p>
      )}
    </div>
  );
};
