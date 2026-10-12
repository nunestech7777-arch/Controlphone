// ============================================================================
// CONTROLPHONE — MENU DE DOCUMENTOS (GENÉRICO)
// Recebe a lista de documentos e oferece para cada um: Visualizar, Baixar PDF,
// Imprimir, Enviar por WhatsApp e Enviar por E-mail.
// Usado em "Documentos da Venda" e "Documentos da Assistência".
// ============================================================================

import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronRight, Eye, FileDown, Printer, MessageCircle, Mail } from 'lucide-react';
import { DocumentAction, DocumentMenuItem } from '../../lib/pdf/documentActions';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';

interface DocumentsMenuProps {
  label: string;
  items: DocumentMenuItem[];
  /** 'up' abre o menu para cima (rodapé de modais); 'down' para baixo */
  placement?: 'up' | 'down';
  variant?: 'primary' | 'neutral';
  onNotice?: (message: string) => void;
  /** Chamado após um envio por WhatsApp ou e-mail (para registrar no histórico) */
  onSent?: (item: DocumentMenuItem, channel: 'WhatsApp' | 'E-mail') => void;
}

const ACTIONS: { id: DocumentAction; label: string; icon: React.ElementType }[] = [
  { id: 'view', label: 'Visualizar', icon: Eye },
  { id: 'download', label: 'Baixar PDF', icon: FileDown },
  { id: 'print', label: 'Imprimir', icon: Printer },
  { id: 'whatsapp', label: 'Enviar por WhatsApp', icon: MessageCircle },
  { id: 'email', label: 'Enviar por E-mail', icon: Mail }
];

export const DocumentsMenu: React.FC<DocumentsMenuProps> = ({
  label, items, placement = 'up', variant = 'neutral', onNotice, onSent
}) => {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Canais de envio seguem as configurações da loja
  const { currentTenant } = useAuth();
  const features = store.getTenantFeatures(currentTenant?.id);
  const actions = ACTIONS.filter(a =>
    (a.id !== 'whatsapp' || features.send_whatsapp) && (a.id !== 'email' || features.send_email)
  );

  const close = () => { setOpen(false); setSelectedId(null); };

  const handleAction = async (item: DocumentMenuItem, action: DocumentAction) => {
    if (busy || !item.run) return;
    setBusy(true);
    try {
      const message = await item.run(action);
      if (action === 'whatsapp') onSent?.(item, 'WhatsApp');
      if (action === 'email') onSent?.(item, 'E-mail');
      onNotice?.(message);
      close();
    } catch (err) {
      onNotice?.(err instanceof Error ? err.message : 'Não foi possível gerar o documento.');
    } finally {
      setBusy(false);
    }
  };

  const buttonCls = variant === 'primary'
    ? 'btn-tenant-primary px-5 py-2.5 rounded-xl font-bold text-xs inline-flex items-center gap-2'
    : 'px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50 inline-flex items-center gap-1.5';

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonCls}
      >
        <FileText className="w-3.5 h-3.5" />
        {label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
          <div
            role="menu"
            className={`absolute z-50 right-0 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-xl p-2 text-xs ${
              placement === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            {items.map((item) => {
              const expanded = selectedId === item.id;
              if (item.comingSoon || !item.run) {
                return (
                  <div key={item.id} className="px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 opacity-60" aria-disabled="true">
                    <span className="font-bold text-slate-700">{item.label}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">Em breve</span>
                  </div>
                );
              }
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setSelectedId(expanded ? null : item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 transition-colors ${
                      expanded ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block font-bold text-slate-800">{item.label}</span>
                      <span className="block text-[11px] text-slate-500 truncate">{item.description}</span>
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                  </button>

                  {expanded && (
                    <div className="py-1 pl-2">
                      {actions.map((action) => {
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            role="menuitem"
                            disabled={busy}
                            onClick={() => handleAction(item, action.id)}
                            className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Icon className="w-3.5 h-3.5 text-slate-400" />
                            {action.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
