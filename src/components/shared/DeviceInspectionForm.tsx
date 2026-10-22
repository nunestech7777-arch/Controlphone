// ============================================================================
// CONTROLPHONE — "VISTORIA DO APARELHO" (SOMENTE SEMINOVO)
// Usado na Nova Venda e no Upgrade. Cada pergunta começa sem marcação e o
// vendedor precisa escolher SIM ou NÃO em todas antes de concluir a venda.
// ============================================================================

import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import { INSPECTION_ITEMS, InspectionDraft, missingAnswers } from '../../lib/deviceInspection';
import { InspectionKey } from '../../types';

interface DeviceInspectionFormProps {
  /** Identifica o aparelho (vários seminovos na mesma venda) */
  idPrefix: string;
  value: InspectionDraft;
  onChange: (next: InspectionDraft) => void;
}

export const DeviceInspectionForm: React.FC<DeviceInspectionFormProps> = ({ idPrefix, value, onChange }) => {
  const missing = missingAnswers(value);
  const setAnswer = (key: InspectionKey, answer: boolean) =>
    onChange({ ...value, answers: { ...value.answers, [key]: answer } });

  return (
    <fieldset className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <legend className="px-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
        <ClipboardCheck className="w-3.5 h-3.5" />
        Vistoria do Aparelho *
      </legend>

      <div className="space-y-1.5">
        {INSPECTION_ITEMS.map(({ key, label }) => {
          const answer = value.answers[key];
          const name = `${idPrefix}-${key}`;
          return (
            <div key={key} role="radiogroup" aria-label={label} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3">
              <span className="text-[11px] text-slate-700">{label}</span>
              <div className="flex gap-1.5 shrink-0">
                {([[true, 'SIM'], [false, 'NÃO']] as const).map(([option, text]) => (
                  <label
                    key={text}
                    className={`cursor-pointer px-3 py-1 rounded-lg border text-[11px] font-bold transition-all ${
                      answer === option
                        ? option ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-rose-500 bg-rose-50 text-rose-700'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name={name}
                      className="sr-only"
                      checked={answer === option}
                      onChange={() => setAnswer(key, option)}
                    />
                    {text}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <label htmlFor={`${idPrefix}-notes`} className="text-[11px] font-bold text-slate-600 block mb-1">
          Observações da vistoria (opcional)
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={2}
          maxLength={1000}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs focus:outline-none focus:border-blue-500"
        />
      </div>

      {missing > 0 && (
        <p className="text-[11px] font-semibold text-amber-700">
          {missing === 1 ? 'Falta 1 resposta' : `Faltam ${missing} respostas`} para concluir a venda.
        </p>
      )}
    </fieldset>
  );
};
