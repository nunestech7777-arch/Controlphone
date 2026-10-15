// ============================================================================
// CONTROLPHONE — TERMOS E DOCUMENTOS: TEXTOS DOS COMPROVANTES (ADMINISTRADOR)
// O administrador edita só os textos autorizados. Layout, logotipo e cores dos
// documentos continuam com o Super Admin, e os avisos obrigatórios do comprovante
// de lacrado são fixos.
// ============================================================================

import React, { useState } from 'react';
import { FileText, Lock, X } from 'lucide-react';
import { store, DEFAULT_WARRANTY_TERMS } from '../../lib/store';
import { SEALED_RECEIPT_NOTICES } from '../../lib/pdf/sealedReceiptPDF';

interface ReceiptTextsModalProps {
  tenantId: string;
  userId: string;
  userRole: string;
  onClose: () => void;
}

export const ReceiptTextsModal: React.FC<ReceiptTextsModalProps> = ({ tenantId, userId, userRole, onClose }) => {
  const current = store.getDocumentTexts(tenantId);
  const [seminovoTerms, setSeminovoTerms] = useState(current.seminovo_terms || DEFAULT_WARRANTY_TERMS);
  const [lacradoNotes, setLacradoNotes] = useState(current.lacrado_notes || '');
  const [error, setError] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const result = store.saveDocumentTexts({ tenantId, userId, userRole, seminovoTerms, lacradoNotes });
    if (!result.ok) {
      setError(result.error || 'Não foi possível salvar os textos.');
      return;
    }
    onClose();
  };

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Termos e Documentos
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Textos dos comprovantes de venda. Valem para as próximas vendas; os comprovantes já emitidos não mudam.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-5 text-xs">
          <div>
            <label htmlFor="seminovo-terms" className="font-bold text-slate-700 block mb-1">
              Comprovante de Venda — Seminovo: condições da garantia
            </label>
            <textarea
              id="seminovo-terms"
              value={seminovoTerms}
              onChange={(e) => setSeminovoTerms(e.target.value)}
              rows={5}
              maxLength={2000}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">Aparece no comprovante e no Termo de Garantia dos aparelhos seminovos.</p>
          </div>

          <div>
            <label htmlFor="lacrado-notes" className="font-bold text-slate-700 block mb-1">
              Comprovante de Venda — Lacrado: observações da loja (opcional)
            </label>
            <textarea
              id="lacrado-notes"
              value={lacradoNotes}
              onChange={(e) => setLacradoNotes(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Ex.: Troca de acessórios em até 7 dias com a embalagem original."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
            />
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <p className="flex items-center gap-1.5 font-bold text-slate-600">
                <Lock className="w-3.5 h-3.5" />
                Avisos obrigatórios no rodapé (não podem ser alterados)
              </p>
              {SEALED_RECEIPT_NOTICES.map(text => (
                <p key={text} className="text-[11px] text-slate-500">{text}</p>
              ))}
            </div>
          </div>

          {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" className="btn-tenant-primary px-4 py-2 rounded-xl font-bold">
              Salvar textos
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
