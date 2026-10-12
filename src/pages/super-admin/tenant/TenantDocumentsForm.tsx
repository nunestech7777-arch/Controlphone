// ============================================================================
// CONTROLPHONE — MODELOS DE DOCUMENTO DA LOJA (UPLOAD DE PDF POR TIPO)
// O componente só exibe e coleta: quem o usa decide quando gravar o arquivo
// (ao criar a loja, no assistente; imediatamente, na gestão posterior).
// ============================================================================

import React, { useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, FileText, Info, Loader2, Trash2, Upload } from 'lucide-react';
import { TenantDocumentType } from '../../../types';
import { DOCUMENT_TYPES, formatFileSize } from '../../../lib/tenantSetup';
import { TEMPLATE_ACCEPT, TEMPLATE_FIELDS } from '../../../lib/tenantDocuments';

export interface DocumentSlot {
  file_name: string;
  size: number;
  fields_total: number;
  fields_matched: number;
}

interface TenantDocumentsFormProps {
  slots: Partial<Record<TenantDocumentType, DocumentSlot>>;
  /** Deve validar e analisar o PDF; lançar Error com a mensagem para o usuário em caso de falha */
  onSelect: (type: TenantDocumentType, file: File) => Promise<void>;
  onRemove: (type: TenantDocumentType) => void | Promise<void>;
  onView?: (type: TenantDocumentType) => void;
  errors?: Record<string, string>;
  /** Nenhum modelo é exigido (cadastro da loja): todos aparecem como opcionais */
  allOptional?: boolean;
}

export const TenantDocumentsForm: React.FC<TenantDocumentsFormProps> = ({ slots, onSelect, onRemove, onView, errors = {}, allOptional }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<TenantDocumentType | null>(null);
  const [busyType, setBusyType] = useState<TenantDocumentType | null>(null);
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});
  const [showFields, setShowFields] = useState(false);

  const pick = (type: TenantDocumentType) => {
    setPendingType(type);
    inputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const type = pendingType;
    if (!file || !type) return;
    setBusyType(type);
    try {
      await onSelect(type, file);
      setLocalErrors(prev => ({ ...prev, [type]: '' }));
    } catch (err) {
      setLocalErrors(prev => ({ ...prev, [type]: err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.' }));
    } finally {
      setBusyType(null);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-2.5">
        {DOCUMENT_TYPES.map((def) => {
          const slot = slots[def.type];
          const error = localErrors[def.type] || errors[def.type];
          const busy = busyType === def.type;
          return (
            <div
              key={def.type}
              className={`rounded-xl border p-3.5 bg-white ${error ? 'border-rose-300' : 'border-slate-200'}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${slot ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {slot ? <CheckCircle2 className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </span>

                <div className="flex-1 min-w-0">
                  <span className="font-bold text-slate-800 flex flex-wrap items-center gap-x-1.5">
                    {def.label}
                    {def.required && !allOptional
                      ? <span className="text-rose-500">*</span>
                      : <span className="font-medium text-slate-400">(opcional)</span>}
                  </span>
                  {slot ? (
                    <span className="text-[11px] text-slate-500 block truncate">
                      {slot.file_name} · {formatFileSize(slot.size)}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400 block">{def.description}</span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {slot && onView && (
                    <button type="button" onClick={() => onView(def.type)} className="px-2.5 py-1.5 font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                      Ver
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pick(def.type)}
                    className={`px-3 py-1.5 rounded-lg font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
                      slot ? 'text-blue-600 hover:bg-blue-50' : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {slot ? 'Substituir' : 'Enviar PDF'}
                  </button>
                  {slot && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onRemove(def.type)}
                      aria-label={`Remover ${def.label}`}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-60"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {slot && !error && (
                <p className={`mt-2.5 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 ${
                  slot.fields_matched > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {slot.fields_matched > 0
                    ? `${slot.fields_matched} de ${slot.fields_total} campos do modelo serão preenchidos automaticamente.`
                    : slot.fields_total > 0
                      ? `O modelo tem ${slot.fields_total} campos, mas nenhum com nome reconhecido. Até ser ajustado, este documento sai no layout padrão do sistema.`
                      : 'Este PDF não tem campos preenchíveis. Até ser substituído por um modelo com campos, este documento sai no layout padrão do sistema.'}
                </p>
              )}
              {error && <p role="alert" className="mt-2 text-[11px] font-semibold text-rose-600">{error}</p>}
            </div>
          );
        })}
      </div>

      <input ref={inputRef} type="file" accept={TEMPLATE_ACCEPT} onChange={handleFile} className="hidden" />

      {/* COMO O PREENCHIMENTO AUTOMÁTICO FUNCIONA */}
      <div className="rounded-xl border border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setShowFields(v => !v)}
          aria-expanded={showFields}
          className="w-full px-3.5 py-3 flex items-center gap-2.5 text-left"
        >
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="font-bold text-slate-800 block">Como o sistema preenche os modelos</span>
            <span className="text-[11px] text-slate-500 block">
              O PDF precisa ter campos de formulário com os nomes abaixo. PDF de até 10 MB.
            </span>
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showFields ? 'rotate-180' : ''}`} />
        </button>

        {showFields && (
          <div className="px-3.5 pb-3.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-200 pt-3">
            {TEMPLATE_FIELDS.map(group => (
              <div key={group.group}>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">{group.group}</span>
                <ul className="space-y-0.5">
                  {group.keys.map(k => (
                    <li key={k.key} className="flex items-baseline justify-between gap-2">
                      <code className="font-mono text-[11px] text-slate-800 select-all">{k.key}</code>
                      <span className="text-[11px] text-slate-400 text-right">{k.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
