// ============================================================================
// CONTROLPHONE — VENDAS EXCLUÍDAS (área restrita ao administrador, só auditoria)
// Nada aqui entra em faturamento, juros, lucro, ranking ou metas.
// ============================================================================

import React, { useState } from 'react';
import { store } from '../../lib/store';
import { formatBRL } from '../../lib/labels';
import { saleRevenue } from '../../lib/saleFinance';
import { Sale, SaleRefundStatus } from '../../types';
import { REFUND_LABELS } from '../../components/shared/DeleteSaleModal';

const DEVICE_LABELS = {
  in_store: 'Voltou ao estoque',
  with_customer: 'Com o cliente — retorno pendente',
  awaiting_evaluation: 'Aguardando avaliação'
} as const;

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const DeletedSalesPanel: React.FC<{ tenantId: string; userId: string; onChanged: () => void }> = ({ tenantId, userId, onChanged }) => {
  const [editing, setEditing] = useState<Sale | null>(null);
  const [status, setStatus] = useState<SaleRefundStatus>('pending');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');

  const deleted = store.sales
    .filter(s => s.tenant_id === tenantId && s.deleted_at)
    .sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''));
  const nameOf = (id?: string) => store.profiles.find(p => p.id === id)?.full_name || '—';

  const openRefund = (s: Sale) => {
    setEditing(s); setStatus(s.refund_status || 'pending'); setAmount(s.refund_amount ? String(s.refund_amount) : '');
    setNote(s.refund_note || ''); setConfirmed(false); setMessage('');
  };
  const saveRefund = () => {
    if (!editing) return;
    const r = store.updateDeletedSaleRefund(editing.id, tenantId, userId, {
      status, amount: Number(amount.replace(',', '.')), note, confirmed
    });
    if (!r.ok) { setMessage(r.error || 'Não foi possível salvar.'); return; }
    setEditing(null); onChanged();
  };
  const confirmReturn = (s: Sale, destination: 'available' | 'awaiting_evaluation') => {
    const r = store.confirmDeletedSaleReturn(s.id, tenantId, userId, destination);
    setMessage(r.ok ? '' : r.error || 'Não foi possível confirmar o retorno.');
    if (r.ok) onChanged();
  };

  const field = 'w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:border-blue-500';

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Registro de auditoria: estas vendas não entram nos indicadores. Para refazer uma venda, registre uma nova.
      </p>
      {message && <p role="alert" className="text-xs font-semibold text-rose-600">{message}</p>}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold">
            <tr>
              {['Nº', 'Cliente', 'Vendedor', 'Valor', 'Venda', 'Exclusão', 'Excluída por', 'Motivo', 'Estorno', 'Aparelho'].map(h => (
                <th key={h} className="py-3 px-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {deleted.map(s => (
              <tr key={s.id}>
                <td className="py-3 px-3 font-mono font-bold">#{s.sale_number}</td>
                <td className="py-3 px-3">{store.customers.find(c => c.id === s.customer_id)?.name || 'Cliente Balcão'}</td>
                <td className="py-3 px-3">{nameOf(s.seller_id)}</td>
                <td className="py-3 px-3 font-bold whitespace-nowrap">{formatBRL(saleRevenue(s))}</td>
                <td className="py-3 px-3 whitespace-nowrap">{when(s.created_at)}</td>
                <td className="py-3 px-3 whitespace-nowrap">{when(s.deleted_at)}</td>
                <td className="py-3 px-3">{nameOf(s.deleted_by)}</td>
                <td className="py-3 px-3 max-w-[220px]">{s.deletion_reason}</td>
                <td className="py-3 px-3">
                  <span className="block font-semibold">{REFUND_LABELS[s.refund_status || 'pending']}</span>
                  {s.refund_status === 'partial' && s.refund_amount ? <span className="block text-slate-500">{formatBRL(s.refund_amount)}</span> : null}
                  <button onClick={() => openRefund(s)} className="text-blue-600 font-semibold hover:underline">Atualizar</button>
                </td>
                <td className="py-3 px-3">
                  <span className="block font-semibold">{DEVICE_LABELS[s.deletion_device_situation || 'in_store']}</span>
                  {s.deletion_return_pending && (
                    <span className="flex flex-col gap-0.5 mt-1">
                      <button onClick={() => confirmReturn(s, 'available')} className="text-blue-600 font-semibold hover:underline text-left">Retornou: voltar ao estoque</button>
                      <button onClick={() => confirmReturn(s, 'awaiting_evaluation')} className="text-blue-600 font-semibold hover:underline text-left">Retornou: avaliar antes</button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {deleted.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-slate-400 font-medium">Nenhuma venda excluída.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-3" role="dialog" aria-label="Situação do estorno">
            <h3 className="text-sm font-extrabold text-slate-800">Estorno da venda #{editing.sale_number}</h3>
            <select value={status} onChange={e => setStatus(e.target.value as SaleRefundStatus)} className={field} aria-label="Situação do estorno">
              {(Object.keys(REFUND_LABELS) as SaleRefundStatus[]).map(k => <option key={k} value={k}>{REFUND_LABELS[k]}</option>)}
            </select>
            {status === 'partial' && <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="Valor devolvido (R$)" className={field} aria-label="Valor devolvido" />}
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Observação / referência" className={field} aria-label="Observação" />
            {(status === 'done' || status === 'partial') && (
              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mt-0.5" />
                Confirmo que o dinheiro foi realmente devolvido ao cliente.
              </label>
            )}
            {message && <p role="alert" className="text-xs font-semibold text-rose-600">{message}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Voltar</button>
              <button onClick={saveRefund} className="px-4 py-2 text-xs font-bold bg-slate-900 text-white rounded-xl">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
