// ============================================================================
// CONTROLPHONE — CAMPOS DE FORMULÁRIO DO CADASTRO E DA GESTÃO DE LOJAS
// Peças compartilhadas pelo assistente "Cadastrar Nova Loja" e pela gestão posterior.
// ============================================================================

import React, { useRef, useState } from 'react';
import { Check, Eye, EyeOff, RotateCcw, Trash2, Upload } from 'lucide-react';
import { TenantFeatures, TenantPlan, TenantStatus } from '../../../types';
import { CORE_MODULES, OPTIONAL_MODULES } from '../../../modules/registry';
import {
  BRAND_IMAGE_ACCEPT, FEATURE_OPTIONS, PLAN_OPTIONS, STATUS_OPTIONS, isHexColor, readBrandImage
} from '../../../lib/tenantSetup';

export type FormErrors = Record<string, string>;

export const inputCls = (error?: string) =>
  `w-full px-3 py-2.5 rounded-xl border bg-white text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:ring-2 transition-colors ${
    error
      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
      : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
  }`;

interface FieldProps {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({ label, required, optional, error, hint, className, children }) => (
  <label className={`block text-xs ${className || ''}`}>
    <span className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
      {label}
      {required && <span className="text-rose-500">*</span>}
      {optional && <span className="font-medium text-slate-400">(opcional)</span>}
    </span>
    {children}
    {error ? (
      <span role="alert" className="block mt-1 text-[11px] font-semibold text-rose-600">{error}</span>
    ) : hint ? (
      <span className="block mt-1 text-[11px] text-slate-400">{hint}</span>
    ) : null}
  </label>
);

interface TextFieldProps extends Omit<FieldProps, 'children'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  onBlur?: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}

export const TextField: React.FC<TextFieldProps> = ({
  value, onChange, placeholder, type = 'text', mono, maxLength, inputMode, onBlur, disabled, trailing, ...field
}) => (
  <Field {...field}>
    <span className="relative block">
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={Boolean(field.error)}
        className={`${inputCls(field.error)} ${mono ? 'font-mono' : ''} ${trailing ? 'pr-10' : ''} disabled:bg-slate-50 disabled:text-slate-400`}
      />
      {trailing && <span className="absolute inset-y-0 right-3 flex items-center">{trailing}</span>}
    </span>
  </Field>
);

export const PasswordField: React.FC<Omit<TextFieldProps, 'type' | 'trailing'>> = ({ value, onChange, placeholder, ...field }) => {
  const [visible, setVisible] = useState(false);
  return (
    <Field {...field}>
      <span className="relative block">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          aria-invalid={Boolean(field.error)}
          className={`${inputCls(field.error)} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute inset-y-0 right-2 px-1.5 flex items-center text-slate-400 hover:text-slate-700"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </span>
    </Field>
  );
};

// ---- Cor ----

interface ColorFieldProps {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  /** Quando definido, a cor está herdando de outra (ex.: "Segue a cor principal") */
  inheritedFrom?: string;
  onReset?: () => void;
  warning?: string;
}

export const ColorField: React.FC<ColorFieldProps> = ({ label, hint, value, onChange, inheritedFrom, onReset, warning }) => {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value.toUpperCase();

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="font-bold text-slate-700">{label}</span>
        {inheritedFrom ? (
          <span className="text-[10px] font-medium text-slate-400">{inheritedFrom}</span>
        ) : onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            Redefinir
          </button>
        ) : null}
      </div>
      <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 focus-within:border-blue-500">
        <input
          type="color"
          value={isHexColor(value) && value.length === 7 ? value : '#000000'}
          onChange={(e) => { setText(null); onChange(e.target.value.toUpperCase()); }}
          aria-label={label}
          className="w-8 h-8 rounded-lg border-0 cursor-pointer p-0 bg-transparent shrink-0"
        />
        <input
          type="text"
          value={shown}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value.trim();
            setText(next);
            if (isHexColor(next) && next.length === 7) onChange(next.toUpperCase());
          }}
          onBlur={() => setText(null)}
          aria-label={`${label} (hexadecimal)`}
          className="w-full text-[11px] font-mono font-bold uppercase text-slate-700 focus:outline-none bg-transparent"
        />
      </div>
      <p className={`mt-1 text-[11px] ${warning ? 'text-amber-600 font-semibold' : 'text-slate-400'}`}>{warning || hint}</p>
    </div>
  );
};

// ---- Imagem da marca ----

interface ImageUploadFieldProps {
  label: string;
  hint: string;
  optional?: boolean;
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  maxSide: number;
  square?: boolean;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({ label, hint, optional, value, onChange, maxSide, square }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onChange(await readBrandImage(file, maxSide));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ler a imagem.');
    }
  };

  return (
    <div className="text-xs">
      <span className="font-bold text-slate-700 flex items-center gap-1.5 mb-1.5">
        {label}
        {optional && <span className="font-medium text-slate-400">(opcional)</span>}
      </span>

      {value ? (
        <div className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-slate-200">
          <div className={`${square ? 'w-12' : 'w-20'} h-12 rounded-lg bg-slate-100 border border-slate-200 p-1.5 flex items-center justify-center shrink-0`}>
            <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
          </div>
          <span className="flex-1 min-w-0 font-semibold text-slate-600 truncate">Enviada</span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="px-2.5 py-1 font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            Substituir
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Remover ${label}`}
            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl px-3 py-3.5 flex items-center gap-3 text-left bg-white transition-colors group"
        >
          <span className="w-9 h-9 rounded-xl bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center shrink-0 transition-colors">
            <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </span>
          <span className="min-w-0">
            <span className="font-bold text-slate-700 block">Enviar imagem</span>
            <span className="text-[11px] text-slate-400 block truncate">PNG, JPG, WEBP ou SVG</span>
          </span>
        </button>
      )}

      <input ref={inputRef} type="file" accept={BRAND_IMAGE_ACCEPT} onChange={handleFile} className="hidden" />
      <p className={`mt-1 text-[11px] ${error ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>{error || hint}</p>
    </div>
  );
};

// ---- Recursos da loja ----

const FeatureOption: React.FC<{
  option: (typeof FEATURE_OPTIONS)[number];
  checked: boolean;
  onToggle: (checked: boolean) => void;
}> = ({ option, checked, onToggle }) => (
  <label
    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors text-xs ${
      checked ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300'
    }`}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onToggle(e.target.checked)}
      className="sr-only peer"
    />
    <span
      className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-200 ${
        checked ? 'bg-[#1845E8] border-[#1845E8]' : 'bg-white border-slate-300'
      }`}
    >
      {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </span>
    <span className="min-w-0">
      <span className="font-bold text-slate-800 block">{option.label}</span>
      <span className="text-[11px] text-slate-500 block">{option.description}</span>
    </span>
  </label>
);

export const FeatureChecklist: React.FC<{
  value: TenantFeatures;
  onChange: (next: TenantFeatures) => void;
}> = ({ value, onChange }) => {
  const moduleKeys = new Set(OPTIONAL_MODULES.map(m => m.featureKey));
  const resources = FEATURE_OPTIONS.filter(opt => !moduleKeys.has(opt.key));
  const modules = FEATURE_OPTIONS.filter(opt => moduleKeys.has(opt.key));
  const toggle = (key: keyof TenantFeatures) => (checked: boolean) => onChange({ ...value, [key]: checked });

  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Módulos da Loja</h3>
        <p className="text-[11px] text-slate-500 mt-0.5 mb-2.5">
          Só o Super Administrador contrata módulos. Módulo desligado some do menu, não abre telas e não consulta o banco.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2.5">
          {CORE_MODULES.map(m => (
            <span key={m.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
              <Check className="w-3 h-3" strokeWidth={3} />
              {m.label}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {modules.map(opt => (
            <FeatureOption key={opt.key} option={opt} checked={value[opt.key]} onToggle={toggle(opt.key)} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">Recursos do varejo</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {resources.map(opt => (
            <FeatureOption key={opt.key} option={opt} checked={value[opt.key]} onToggle={toggle(opt.key)} />
          ))}
        </div>
      </section>
    </div>
  );
};

// ---- Plano e situação ----

export interface PlanDraft {
  plan: TenantPlan | '';
  planStart: string;
  planDue: string;
  status: TenantStatus;
}

export const PlanFields: React.FC<{
  value: PlanDraft;
  onChange: (patch: Partial<PlanDraft>) => void;
  errors?: FormErrors;
  /** No cadastro da loja o plano pode ser definido depois */
  optional?: boolean;
}> = ({ value, onChange, errors = {}, optional }) => (
  <div className="space-y-5 text-xs">
    <div>
      <span className="font-bold text-slate-700 block mb-1.5">Plano {!optional && <span className="text-rose-500">*</span>}</span>
      <div role="radiogroup" aria-label="Plano" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {PLAN_OPTIONS.map((plan) => {
          const selected = value.plan === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ plan: plan.id })}
              className={`p-3.5 rounded-xl border text-left transition-colors ${
                selected ? 'border-[#1845E8] bg-blue-50/60 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-slate-800 text-sm">{plan.label}</span>
                <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${selected ? 'border-[#1845E8]' : 'border-slate-300'}`}>
                  {selected && <span className="w-2 h-2 rounded-full bg-[#1845E8]" />}
                </span>
              </span>
              <span className="text-[11px] text-slate-500 block mt-1">{plan.description}</span>
            </button>
          );
        })}
      </div>
      {errors.plan && <span role="alert" className="block mt-1 text-[11px] font-semibold text-rose-600">{errors.plan}</span>}
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <TextField label="Data de início" required={!optional} type="date" value={value.planStart} onChange={(v) => onChange({ planStart: v })} error={errors.planStart} />
      <TextField label="Data de vencimento" required={!optional} type="date" value={value.planDue} onChange={(v) => onChange({ planDue: v })} error={errors.planDue} />
      <Field label="Status" required>
        <select
          value={value.status}
          onChange={(e) => onChange({ status: e.target.value as TenantStatus })}
          className={inputCls()}
        >
          {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </Field>
    </div>
  </div>
);
