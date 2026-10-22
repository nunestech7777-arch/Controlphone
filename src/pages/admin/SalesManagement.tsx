// ============================================================================
// CONTROLPHONE — GESTÃO DE VENDAS & CANCELAMENTOS COM AUDITORIA
// ============================================================================

import React, { useState } from 'react';
import { ShoppingBag, Search, FileDown, Trash2, Eye } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { generateReceiptPDF } from '../../lib/pdf/generateReceiptPDF';
import { Sale } from '../../types';
import { SaleDetailModal } from '../../components/shared/SaleDetailModal';
import { consumeIntent } from '../../lib/navIntent';
import { formatBRL } from '../../lib/labels';
import { saleRevenue } from '../../lib/saleFinance';
import { DeleteSaleModal } from '../../components/shared/DeleteSaleModal';
import { DeletedSalesPanel } from './DeletedSalesPanel';
import { SalesTrashPanel } from './SalesTrashPanel';

export const SalesManagement: React.FC = () => {
  const { currentTenant, currentUser, currentTheme, isSupportMode } = useAuth();
  const isAdmin = currentUser.role === 'admin' || isSupportMode;
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [searchTerm, setSearchTerm] = useState(
    () => String(consumeIntent('admin-sales', 'view-sale')?.saleNumber || '')
  );
  const [deleteModalSale, setDeleteModalSale] = useState<Sale | null>(null);
  const [view, setView] = useState<'list' | 'trash' | 'deleted'>('list');
  const [trashSale, setTrashSale] = useState<Sale | null>(null);
  const [trashError, setTrashError] = useState('');
  const [flash, setFlash] = useState('');
  const [, setTick] = useState(0);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'normal' | 'upgrade' | 'mine'>('all');

  // Um único histórico: vendas normais e upgrades (que são vendas com aparelho recebido)
  const sales = store.sales
    .filter(s => s.tenant_id === tenantId && !s.deleted_at && !s.trashed_at)
    .sort((a, b) => b.sale_number - a.sale_number);

  const filteredSales = sales.filter(s => {
    if (typeFilter === 'upgrade' && !s.trade_in_id) return false;
    if (typeFilter === 'normal' && s.trade_in_id) return false;
    if (typeFilter === 'mine' && s.seller_id !== currentUser.id) return false;
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    const cust = store.customers.find(c => c.id === s.customer_id);
    return (
      s.sale_number.toString().includes(term) ||
      (cust?.name || '').toLowerCase().includes(term) ||
      s.sales_origin.toLowerCase().includes(term) ||
      (s.trade_in_id ? 'upgrade'.includes(term) : false)
    );
  });

  const detailSale = sales.find(s => s.id === detailId);

  const handleDownloadPDF = (sale: Sale) => {
    if (!currentTenant) return;
    const cust = store.customers.find(c => c.id === sale.customer_id)?.name || 'Cliente';
    const seller = store.profiles.find(p => p.id === sale.seller_id)?.full_name || 'Vendedor';
    generateReceiptPDF(sale, currentTenant, seller, cust, currentTheme);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-600" />
            Histórico de Vendas
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Todas as vendas e de onde vieram os clientes. Vendas lançadas por engano podem ser excluídas pelo administrador.
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="flex gap-2">
          {([['list', 'Histórico'], ['trash', 'Lixeira'], ['deleted', 'Vendas Excluídas']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${view === id ? 'btn-tenant-primary' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {flash && <p role="status" className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">{flash}</p>}

      {view === 'trash' && isAdmin && (
        <SalesTrashPanel tenantId={tenantId} userId={currentUser.id} onFeedback={text => { setFlash(text); setTick(t => t + 1); }} />
      )}

      {view === 'deleted' && isAdmin && (
        <DeletedSalesPanel tenantId={tenantId} userId={currentUser.id} onChanged={() => setTick(t => t + 1)} />
      )}

      {view === 'list' && <>
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto order-2 sm:order-none">
          {([['all', 'Todas'], ['normal', 'Vendas normais'], ['upgrade', 'Upgrades'], ['mine', 'Minhas vendas']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTypeFilter(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                typeFilter === id ? 'bg-[#0B0F17] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nº Venda, Cliente ou Origem..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* TABELA DE VENDAS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nº Venda</th>
                <th className="py-3.5 px-4">Data & Horário</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Vendedor</th>
                <th className="py-3.5 px-4">Origem</th>
                <th className="py-3.5 px-4">Total Pago</th>
                <th className="py-3.5 px-4">Lucro</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSales.map((sale) => {
                const customer = store.customers.find(c => c.id === sale.customer_id);
                const seller = store.profiles.find(p => p.id === sale.seller_id);
                const isCancelled = sale.status === 'cancelled';

                return (
                  <tr
                    key={sale.id}
                    onClick={() => setDetailId(sale.id)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                      #{sale.sale_number}
                      {sale.trade_in_id && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-100 text-purple-700 font-sans">
                          Upgrade
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(sale.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {customer?.name || 'Cliente Balcão'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {seller?.full_name || 'Vendedor'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {sale.sales_origin}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900 whitespace-nowrap">
                      {formatBRL(saleRevenue(sale))}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-600 whitespace-nowrap">
                      {isCancelled ? '—' : `${formatBRL(Number(sale.gross_profit))}`}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {isCancelled ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          Cancelada
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Concluída
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setDetailId(sale.id)}
                        title="Ver detalhes da venda"
                        aria-label="Ver detalhes da venda"
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(sale)}
                        title="Baixar Comprovante PDF"
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-blue-600 transition-colors"
                      >
                        <FileDown className="w-4 h-4 inline" />
                      </button>

                      {isAdmin && isCancelled && (
                        <button
                          onClick={() => { setTrashError(''); setTrashSale(sale); }}
                          title="Mover para a lixeira"
                          aria-label={`Mover a venda ${sale.sale_number} para a lixeira`}
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      )}
                      {!isCancelled && (isAdmin || sale.seller_id === currentUser.id) && (
                        <button
                          onClick={() => setDeleteModalSale(sale)}
                          title="Excluir Venda"
                          aria-label="Excluir Venda"
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    Nenhuma venda registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETALHES COMPLETOS DA VENDA (INCLUI UPGRADE) */}
      {detailSale && !deleteModalSale && (
        <SaleDetailModal
          sale={detailSale}
          onClose={() => setDetailId(null)}
          onDelete={() => setDeleteModalSale(detailSale)}
        />
      )}
      </>}

      {trashSale && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in space-y-4" role="dialog" aria-label="Mover para a lixeira">
            <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-rose-600" /> Mover venda #{trashSale.sale_number} para a lixeira
            </h3>
            <p className="text-xs text-slate-600">Deseja mover esta venda para a lixeira? Ela deixará de aparecer no histórico principal.</p>
            {trashError && <p role="alert" className="text-xs font-semibold text-rose-600">{trashError}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setTrashSale(null)} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
              <button
                type="button"
                onClick={() => {
                  const r = store.moveSaleToTrash(trashSale.id, tenantId, currentUser.id);
                  if (!r.ok) { setTrashError(r.error || 'Não foi possível mover para a lixeira.'); return; }
                  setFlash(`Venda #${trashSale.sale_number} movida para a lixeira.`);
                  setTrashSale(null);
                  setDetailId(null);
                }}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md"
              >
                Mover para lixeira
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModalSale && (
        <DeleteSaleModal
          sale={deleteModalSale}
          tenantId={tenantId}
          userId={currentUser.id}
          restrictRefund={!isAdmin}
          onClose={() => setDeleteModalSale(null)}
          onDeleted={() => {
            setFlash(`Venda #${deleteModalSale.sale_number} excluída. Os indicadores foram atualizados e o registro ficou em Vendas Excluídas.`);
            setDeleteModalSale(null);
            setDetailId(null);
          }}
        />
      )}
    </div>
  );
};
