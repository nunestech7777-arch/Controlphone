// ============================================================================
// CONTROLPHONE — GESTÃO DE VENDAS & CANCELAMENTOS COM AUDITORIA
// ============================================================================

import React, { useState } from 'react';
import { ShoppingBag, Search, FileDown, Ban, AlertTriangle, X, Eye } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { generateReceiptPDF } from '../../lib/pdf/generateReceiptPDF';
import { Sale } from '../../types';
import { SaleDetailModal } from '../../components/shared/SaleDetailModal';
import { consumeIntent } from '../../lib/navIntent';

export const SalesManagement: React.FC = () => {
  const { currentTenant, currentUser, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [searchTerm, setSearchTerm] = useState(
    () => String(consumeIntent('admin-sales', 'view-sale')?.saleNumber || '')
  );
  const [cancelModalSale, setCancelModalSale] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<'all' | 'normal' | 'upgrade' | 'mine'>('all');

  // Um único histórico: vendas normais e upgrades (que são vendas com aparelho recebido)
  const sales = store.sales
    .filter(s => s.tenant_id === tenantId)
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

  const handleCancelSale = () => {
    if (!cancelModalSale || !cancelReason.trim()) {
      alert('Informe o motivo do cancelamento!');
      return;
    }

    const result = store.cancelSale(cancelModalSale.id, tenantId, currentUser.id, cancelReason);
    if (!result.ok) {
      alert(result.error || 'Não foi possível cancelar a venda.');
      return;
    }
    alert('Venda cancelada com sucesso! O estoque foi reestabelecido e a auditoria registrada.');
    setCancelModalSale(null);
    setCancelReason('');
  };

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
            Todas as vendas, de onde vieram os clientes e os cancelamentos (o estoque volta automaticamente).
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 overflow-x-auto order-2 sm:order-none">
          {([['all', 'Todas'], ['normal', 'Vendas normais'], ['upgrade', 'Upgrades'], ['mine', 'Minhas vendas']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTypeFilter(id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
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
                      R$ {Number(sale.total_amount).toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-600 whitespace-nowrap">
                      {isCancelled ? '—' : `R$ ${Number(sale.gross_profit).toFixed(2)}`}
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

                      {!isCancelled && (
                        <button
                          onClick={() => setCancelModalSale(sale)}
                          title="Cancelar Venda"
                          className="p-1.5 hover:bg-rose-50 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Ban className="w-4 h-4 inline" />
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
      {detailSale && !cancelModalSale && (
        <SaleDetailModal
          sale={detailSale}
          onClose={() => setDetailId(null)}
          onCancel={() => setCancelModalSale(detailSale)}
        />
      )}

      {/* MODAL DE CANCELAMENTO DE VENDA */}
      {cancelModalSale && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-rose-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Cancelar Venda #{cancelModalSale.sale_number}
              </h3>
              <button onClick={() => setCancelModalSale(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Ao cancelar a venda, todos os aparelhos e acessórios retornarão automaticamente ao estoque da loja e o histórico será registrado na auditoria.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Motivo do Cancelamento *</label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Cliente desistiu da compra / Erro na forma de pagamento..."
                  className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-rose-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setCancelModalSale(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleCancelSale}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md"
                >
                  Confirmar Cancelamento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
