// ============================================================================
// CONTROLPHONE — TERMO DE GARANTIA — APPLE (1 ANO)
// Aparece na venda quando o carrinho tem aparelho Apple lacrado, ao lado do
// componente de venda (que não muda). Mostra a identificação, deixa ler o termo
// integral e registra a ciência de que o documento foi apresentado ao cliente.
// Não interfere em preço, pagamento ou desconto.
// ============================================================================

import React, { useState } from 'react';
import { ShieldCheck, FileText, X } from 'lucide-react';
import { APPLE_WARRANTY_COMPONENT_TITLE, AppleWarrantyTermVersion, APPLE_WARRANTY_CURRENT } from '../../lib/appleWarranty';

export interface AppleWarrantyDevice {
  key: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  imei: string;
}

/** Texto integral do termo (usado no modal de leitura). */
export const AppleWarrantyText: React.FC<{ term: AppleWarrantyTermVersion }> = ({ term }) => (
  <article className="space-y-4 text-xs leading-relaxed text-slate-700">
    <header>
      <h4 className="text-base font-extrabold text-slate-900">{term.title}</h4>
      <p className="text-slate-600 font-semibold">{term.subtitle}</p>
    </header>
    {term.sections.map((section, i) => (
      <section key={i} className="space-y-2">
        {section.heading && <h5 className="font-extrabold text-slate-900 text-[11px] tracking-wide">{section.heading}</h5>}
        {section.paragraphs.map((p, j) => <p key={j} className="break-words">{p}</p>)}
      </section>
    ))}
    <p className="text-[10px] text-slate-400">Versão do termo: {term.version}</p>
  </article>
);

interface Props {
  devices: AppleWarrantyDevice[];
  customerName?: string;
  sellerName: string;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}

export const AppleWarrantyPanel: React.FC<Props> = ({ devices, customerName, sellerName, acknowledged, onAcknowledgedChange }) => {
  const [open, setOpen] = useState(false);
  const term = APPLE_WARRANTY_CURRENT;
  const today = new Date().toLocaleDateString('pt-BR');
  const label = 'text-[10px] font-bold uppercase tracking-wide text-slate-400 block';

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 space-y-3 text-xs" aria-label={APPLE_WARRANTY_COMPONENT_TITLE}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          {APPLE_WARRANTY_COMPONENT_TITLE}
        </h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5 self-start"
        >
          <FileText className="w-3.5 h-3.5" /> Ler termo completo
        </button>
      </div>

      <p className="text-slate-600">
        Aparelho Apple novo e lacrado: o cliente recebe a <strong>{term.title} — {term.subtitle}</strong>. O termo completo sai em um PDF próprio, junto com o comprovante.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
        <div><span className={label}>Cliente</span><span className="font-semibold text-slate-800">{customerName || 'Selecione o cliente'}</span></div>
        <div><span className={label}>Data da venda</span><span className="font-semibold text-slate-800">{today}</span></div>
        <div><span className={label}>Vendedor</span><span className="font-semibold text-slate-800">{sellerName}</span></div>
      </div>

      <ul className="space-y-2">
        {devices.map(d => (
          <li key={d.key} className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-slate-200 p-3">
            <div className="col-span-2 sm:col-span-1"><span className={label}>Modelo</span><span className="font-semibold text-slate-800">{d.brand} {d.model}</span></div>
            <div><span className={label}>Capacidade</span><span className="font-semibold text-slate-800">{d.storage}</span></div>
            <div><span className={label}>Cor</span><span className="font-semibold text-slate-800">{d.color || '—'}</span></div>
            <div className="col-span-2 sm:col-span-1"><span className={label}>IMEI</span><span className="font-mono font-semibold text-slate-800 break-all">{d.imei}</span></div>
          </li>
        ))}
      </ul>

      <label className="flex items-start gap-2 text-slate-700 cursor-pointer">
        <input type="checkbox" checked={acknowledged} onChange={e => onAcknowledgedChange(e.target.checked)} className="mt-0.5" />
        <span>
          O Termo de Garantia Apple (1 ano) foi apresentado ao cliente.
          <span className="block text-[11px] text-slate-500">Registra apenas a ciência do documento apresentado; não é renúncia a nenhum direito legal do consumidor.</span>
        </span>
      </label>

      {open && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl animate-fade-in" role="dialog" aria-label="Termo de Garantia Apple completo">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-4 shrink-0">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" /> {APPLE_WARRANTY_COMPONENT_TITLE}
              </h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto px-4 sm:px-6 py-4">
              <AppleWarrantyText term={term} />
            </div>
            <div className="shrink-0 border-t border-slate-100 px-4 sm:px-6 py-3 flex justify-end">
              <button type="button" onClick={() => setOpen(false)} className="btn-tenant-primary px-5 py-2 rounded-xl font-bold text-xs">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
