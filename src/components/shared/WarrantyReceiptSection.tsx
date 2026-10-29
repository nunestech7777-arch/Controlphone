// ============================================================================
// CONTROLPHONE — DETALHES DA VENDA: COMPROVANTE DE GARANTIA (RUBRICA DO CLIENTE)
// Status do link enviado por WhatsApp, atualizado em tempo real, e o PDF assinado
// para visualizar, baixar ou enviar ao cliente pelo WhatsApp. A leitura segue as
// permissões das vendas (migration 28).
// ============================================================================

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Eye, FileDown, MessageCircle } from 'lucide-react';
import { Sale } from '../../types';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import {
  WarrantySignatureRow, fetchWarrantySignature, openSignedReceipt, sendSignedReceiptByWhatsApp, watchWarrantySignature
} from '../../lib/warrantySignature';

const dateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export const WarrantyReceiptSection: React.FC<{ sale: Sale; onNotice: (message: string) => void }> = ({ sale, onNotice }) => {
  const [row, setRow] = useState<WarrantySignatureRow | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const { currentUser, currentTheme, currentTenant } = useAuth();
  // o envio por WhatsApp segue a configuração da loja, como nos demais documentos
  const canWhatsApp = store.getTenantFeatures(sale.tenant_id).send_whatsapp;

  useEffect(() => {
    let active = true;
    const load = () => void fetchWarrantySignature(sale.tenant_id, sale.id).then(r => { if (active) setRow(r); });
    load();
    const stop = watchWarrantySignature(sale.tenant_id, sale.id, load);
    return () => { active = false; stop(); };
  }, [sale.tenant_id, sale.id]);

  // Nenhum link enviado ainda: a seção não aparece
  if (!row) return null;

  const signed = row.status === 'signed';
  const open = async (mode: 'view' | 'download') => {
    if (busy) return;
    setBusy(true);
    const message = await openSignedReceipt(row, sale.sale_number, mode);
    setBusy(false);
    if (message) onNotice(message);
  };

  const sendWhatsApp = async () => {
    if (busy) return;
    setBusy(true);
    const customer = store.customers.find(c => c.id === sale.customer_id);
    const message = await sendSignedReceiptByWhatsApp(row, {
      saleNumber: sale.sale_number,
      storeName: currentTheme?.display_name || currentTenant?.trade_name || 'loja',
      customerName: customer?.name,
      phone: customer?.whatsapp || customer?.phone
    });
    setBusy(false);
    if (message) onNotice(message);
    if (!message.startsWith('O cliente não') && !message.startsWith('Não foi possível')) {
      store.addAuditLog({
        tenant_id: sale.tenant_id, user_id: currentUser.id, user_role: currentUser.role,
        action: 'DOCUMENTO_ENVIADO', module: 'Vendas', record_id: sale.id,
        details: { documento: 'Comprovante de Garantia assinado', canal: 'WhatsApp', venda: sale.sale_number }
      });
      store.saveToStorage();
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-slate-800">Comprovante de Garantia</span>
        {signed ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Comprovante confirmado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-amber-50 text-amber-700 border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Aguardando rubrica do cliente
          </span>
        )}
      </div>
      <p className="text-slate-500">
        Link enviado por WhatsApp em {dateTime(row.link_sent_at)}
        {signed && ` · confirmado pelo cliente em ${dateTime(row.signed_at)}`}
      </p>
      {signed && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => open('view')}
            disabled={busy}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Eye className="w-3.5 h-3.5" /> Visualizar comprovante
          </button>
          <button
            type="button"
            onClick={() => open('download')}
            disabled={busy}
            className="btn-tenant-primary px-3.5 py-2 rounded-xl font-bold text-[11px] inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" /> Baixar comprovante
          </button>
          {canWhatsApp && (
            <button
              type="button"
              onClick={sendWhatsApp}
              disabled={busy}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Enviar por WhatsApp
            </button>
          )}
        </div>
      )}
    </div>
  );
};
