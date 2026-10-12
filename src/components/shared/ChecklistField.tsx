// ============================================================================
// CONTROLPHONE — CHECKLIST DE ENTRADA (OK | COM PROBLEMA | NÃO TESTADO)
// ============================================================================

import React from 'react';
import { Check, X } from 'lucide-react';
import { CHECKLIST_ITEMS, ChecklistState, IntakeChecklist } from '../../lib/assistanceChecklist';

interface ChecklistFieldProps {
  value: IntakeChecklist;
  onChange: (value: IntakeChecklist) => void;
}

// Um clique alterna: não testado -> OK -> com problema -> não testado
const NEXT: Record<ChecklistState, ChecklistState> = { untested: 'ok', ok: 'fail', fail: 'untested' };

export const ChecklistField: React.FC<ChecklistFieldProps> = ({ value, onChange }) => {
  const setAll = (state: ChecklistState) =>
    onChange(Object.fromEntries(CHECKLIST_ITEMS.map(i => [i.id, state])));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <label className="font-bold text-slate-700">Checklist de Entrada</label>
        <div className="flex items-center gap-2 text-[11px]">
          <button type="button" onClick={() => setAll('ok')} className="font-semibold text-blue-600 hover:underline">Marcar tudo OK</button>
          <button type="button" onClick={() => setAll('untested')} className="font-semibold text-slate-500 hover:underline">Limpar</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {CHECKLIST_ITEMS.map((item) => {
          const state = value[item.id] || 'untested';
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange({ ...value, [item.id]: NEXT[state] })}
              aria-label={`${item.label}: ${state === 'ok' ? 'OK' : state === 'fail' ? 'com problema' : 'não testado'}`}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors ${
                state === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : state === 'fail'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  state === 'ok' ? 'bg-emerald-600 border-emerald-600 text-white'
                  : state === 'fail' ? 'bg-rose-600 border-rose-600 text-white'
                  : 'border-slate-300 bg-white'
                }`}
              >
                {state === 'ok' && <Check className="w-3 h-3" />}
                {state === 'fail' && <X className="w-3 h-3" />}
              </span>
              <span className="text-[11px] font-semibold truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 mt-1.5">
        Clique para alternar: OK, com problema ou não testado. O checklist sai impresso na Ordem de Serviço.
      </p>
    </div>
  );
};
