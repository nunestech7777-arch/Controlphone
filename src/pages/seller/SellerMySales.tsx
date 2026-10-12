// ============================================================================
// CONTROLPHONE — MINHAS VENDAS (VENDEDOR) COM EMISSÃO DE COMPROVANTE
// ============================================================================

import React, { useState } from 'react';
import { ShoppingBag, FileDown, Eye } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { generateReceiptPDF } from '../../lib/pdf/generateReceiptPDF';
import { Sale } from '../../types';
import { SaleDetailModal } from '../../components/shared/SaleDetailModal';
import { formatBRL } from '../../lib/labels';

export const SellerMySales: React.FC = () => {
  const { currentTenant, currentUser, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [detailId, setDetailId] = useState<string | null>(null);

  const mySales = store.sales.filter(
    s => s.tenant_id === tenantId && s.seller_id === currentUser.id
  );

  const handleDownloadPDF = (sale: Sale) => {
    if (!currentTenant) return;
    const cust = store.customers.find(c => c.id === sale.customer_id)?.name || 'Cliente';
    generateReceiptPDF(sale, currentTenant, currentUser.full_name, cust, currentTheme);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <ShoppingBag className="w-5 h-5 text-blue-600" />
          Minhas Vendas Realizadas
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Histórico pessoal de atendimentos e reimpressão de comprovantes não fiscais.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nº Venda</th>
                <th className="py-3.5 px-4">Data</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Origem</th>
                <th className="py-3.5 px-4">Valor Total</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Comprovante</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mySales.map((sale) => {
                const customer = store.customers.find(c => c.id === sale.customer_id);
                return (
                  <tr
                    key={sale.id}
                    onClick={() => setDetailId(sale.id)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      #{sale.sale_number}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(sale.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {customer?.name || 'Cliente'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700">
                        {sale.sales_origin}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900">
                      {formatBRL(Number(sale.total_amount))}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        sale.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {sale.status === 'completed' ? 'Concluída' : 'Cancelada'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setDetailId(sale.id)}
                        title="Ver detalhes da venda"
                        aria-label="Ver detalhes da venda"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex align-middle"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(sale)}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1.5"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        Baixar Comprovante
                      </button>
                    </td>
                  </tr>
                );
              })}
              {mySales.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    Você ainda não registrou vendas neste mês.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailId && mySales.find(s => s.id === detailId) && (
        <SaleDetailModal
          sale={mySales.find(s => s.id === detailId) as Sale}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
};
