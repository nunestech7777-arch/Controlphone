// ============================================================================
// CONTROLPHONE — LIXEIRA DE VENDAS (somente administrador)
// Vendas canceladas tiradas do histórico principal. Restaurar devolve ao
// histórico ainda cancelada; excluir definitivamente tira da interface, mas o
// registro e a auditoria continuam no banco.
// ============================================================================

import React, { useState } from 'react';
import { RotateCcw, Trash2, AlertTriangle } from 'lucide-react';
import { store } from '../../lib/store';
import { formatBRL } from '../../lib/labels';
import { saleRevenue } from '../../lib/saleFinance';
import { Sale } from '../../types';

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const SalesTrashPanel: React.FC<{ tenantId: string; userId: string; onFeedback: (text: string) => void }> = ({ tenantId, userId, onFeedback }) => {
  const [purging, setPurging] = useState<Sale | null>(null);
  const [error, setError] = useState('');

  const trashed = store.sales
    .filter(s => s.tenant_id === tenantId && s.trashed_at && !s.purged_at && !s.deleted_at)
    .sort((a, b) => (b.trashed_at || '').localeCompare(a.trashed_at || ''));
  const customer = (s: Sale) => store.customers.find(c => c.id === s.customer_id)?.name || 'Cliente Balcão';
  const seller = (s: Sale) => store.profiles.find(p => p.id === s.seller_id)?.full_name || 'Vendedor';

  const restore = (s: Sale) => {
    const r = store.restoreSaleFromTrash(s.id, tenantId, userId);
    if (!r.ok) { setError(r.error || 'Não foi possível restaurar.'); return; }
    setError('');
    onFeedback(`Venda #${s.sale_number} restaurada para o histórico (continua cancelada).`);
  };
  const purge = () => {
    if (!purging) return;
    const r = store.purgeSaleFromTrash(purging.id, tenantId, userId);
    if (!r.ok) { setError(r.error || 'Não foi possível excluir.'); return; }
    setError('');
    onFeedback(`Venda #${purging.sale_number} excluída definitivamente da lixeira. O registro de auditoria foi preservado.`);
    setPurging(null);
  };

  const actions = (s: Sale) => (
    <span className="inline-flex gap-1">
      <button onClick={() => restore(s)} title="Restaurar" aria-label={`Restaurar venda ${s.sale_number}`} className="px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-blue-600 inline-flex items-center gap-1 font-semibold">
        <RotateCcw className="w-3.5 h-3.5" /> Restaurar
      </button>
      <button onClick={() => setPurging(s)} title="Excluir definitivamente" aria-label={`Excluir definitivamente a venda ${s.sale_number}`} className="px-2.5 py-1.5 rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-600 inline-flex items-center gap-1 font-semibold">
        <Trash2 className="w-3.5 h-3.5" /> Excluir definitivamente
      </button>
    </span>
  );
  const status = <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Cancelada</span>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Vendas canceladas que saíram do histórico principal. Elas não contam em faturamento, lucro nem metas.
      </p>
      {error && <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}

      {/* computador: tabela */}
      <div className="hidden sm:block bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wide text-[10px]">
            <tr>
              {['Nº Venda', 'Data & Horário', 'Cliente', 'Vendedor', 'Valor', 'Status', 'Excluída em', 'Ações'].map(h => (
                <th key={h} className={`py-3.5 px-4 whitespace-nowrap ${h === 'Ações' ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {trashed.map(s => (
              <tr key={s.id}>
                <td className="py-3.5 px-4 font-mono font-bold text-slate-800">#{s.sale_number}</td>
                <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">{when(s.created_at)}</td>
                <td className="py-3.5 px-4 font-semibold text-slate-800">{customer(s)}</td>
                <td className="py-3.5 px-4 text-slate-600">{seller(s)}</td>
                <td className="py-3.5 px-4 font-black text-slate-900 whitespace-nowrap">{formatBRL(saleRevenue(s))}</td>
                <td className="py-3.5 px-4">{status}</td>
                <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">{when(s.trashed_at)}</td>
                <td className="py-3.5 px-4 text-right whitespace-nowrap">{actions(s)}</td>
              </tr>
            ))}
            {trashed.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-slate-400 font-medium">A lixeira está vazia.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* celular: cartões */}
      <ul className="sm:hidden space-y-2">
        {trashed.map(s => (
          <li key={s.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-slate-800">#{s.sale_number}</span>
              {status}
            </div>
            <div className="font-semibold text-slate-800">{customer(s)} <span className="font-normal text-slate-500">· {seller(s)}</span></div>
            <div className="flex justify-between text-slate-500">
              <span>Venda: {when(s.created_at)}</span>
              <span className="font-black text-slate-900">{formatBRL(saleRevenue(s))}</span>
            </div>
            <div className="text-slate-500">Excluída em {when(s.trashed_at)}</div>
            <div className="pt-1 border-t border-slate-100 flex justify-end">{actions(s)}</div>
          </li>
        ))}
        {trashed.length === 0 && <li className="py-8 text-center text-xs text-slate-400 font-medium">A lixeira está vazia.</li>}
      </ul>

      {purging && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in space-y-4" role="dialog" aria-label="Excluir definitivamente">
            <h3 className="text-sm font-extrabold text-rose-600 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Excluir venda #{purging.sale_number} definitivamente
            </h3>
            <p className="text-xs text-slate-600">Esta ação removerá a venda da lixeira. Os registros necessários para auditoria serão preservados.</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setPurging(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
              <button type="button" onClick={purge} className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md">Excluir definitivamente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
