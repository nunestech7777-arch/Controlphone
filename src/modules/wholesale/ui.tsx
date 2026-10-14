// ============================================================================
// CONTROLPHONE — ATACADO: PEÇAS DE INTERFACE
// ============================================================================

import React, { useEffect } from 'react';
import { X, LucideIcon } from 'lucide-react';

export const inputCls =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 disabled:bg-slate-50';

export const btnPrimary =
  'px-4 py-2.5 rounded-xl text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition disabled:opacity-50 disabled:pointer-events-none';
export const btnGhost =
  'px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 disabled:opacity-50';
export const btnDanger =
  'px-3 py-2.5 rounded-xl border border-rose-200 bg-white font-bold text-xs text-rose-600 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5 disabled:opacity-50';

export const Field: React.FC<{ label: string; required?: boolean; hint?: string; children: React.ReactNode }> = ({
  label, required, hint, children
}) => (
  <label className="block text-xs">
    <span className="font-bold text-slate-700 block mb-1">
      {label} {required && <span className="text-rose-500">*</span>}
    </span>
    {children}
    {hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
  </label>
);

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white rounded-2xl border border-slate-200/80 shadow-sm ${className}`}>{children}</div>
);

export const StatCard: React.FC<{
  title: string; value: string; icon: LucideIcon; note?: string; tone?: 'default' | 'good' | 'bad';
}> = ({ title, value, icon: Icon, note, tone = 'default' }) => (
  <Card className="p-4">
    <div className="flex items-center gap-2.5 mb-2">
      <span className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</span>
    </div>
    <span className={`block text-xl font-black tracking-tight ${
      tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-rose-600' : 'text-slate-900'
    }`}>
      {value}
    </span>
    {note && <span className="block text-[11px] text-slate-400 mt-0.5">{note}</span>}
  </Card>
);

export const Modal: React.FC<{
  title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}> = ({ title, onClose, children, footer, wide }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[92dvh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-sm font-extrabold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">{footer}</div>}
      </div>
    </div>
  );
};

export const Empty: React.FC<{ icon: LucideIcon; text: string }> = ({ icon: Icon, text }) => (
  <div className="py-12 text-center text-slate-400">
    <Icon className="w-8 h-8 mx-auto mb-2 opacity-60" />
    <p className="text-xs font-medium">{text}</p>
  </div>
);

export const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export const PAYMENT_METHODS = [
  'PIX', 'Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Boleto', 'A prazo'
];

export const BRAZIL_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];
