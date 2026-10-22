// ============================================================================
// CONTROLPHONE — INÍCIO DO VENDEDOR (FOCO NO ATENDIMENTO & META INDIVIDUAL)
// ============================================================================

import React from 'react';
import { ShoppingBag, RefreshCw, Wrench, Award, Target, TrendingUp, Smartphone, Plus } from 'lucide-react';
import { store } from '../../lib/store';
import { computeSellerRanking, getMonthRange, getSellerGoal, toMonthKey } from '../../lib/sellerRanking';
import { useAuth } from '../../context/AuthContext';
import { formatBRL } from '../../lib/labels';
import { saleRevenue } from '../../lib/saleFinance';

export const SellerHome: React.FC<{ onNavigate: (v: string) => void }> = ({ onNavigate }) => {
  const { currentTenant, currentUser, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';
  const primaryColor = currentTheme?.primary_color || '#1845E8';

  // Vendas do vendedor logado
  const mySales = store.sales.filter(
    s => s.tenant_id === tenantId && s.seller_id === currentUser.id && s.status === 'completed'
  );

  // Contagem de aparelhos vendidos pelo vendedor (acessórios não contam)
  // no mês corrente: mesma regra do ranking (itens trocados/devolvidos e vendas canceladas não contam)
  const currentMonth = toMonthKey(new Date());
  const [monthFrom, monthTo] = getMonthRange(currentMonth);
  const myDevicesSold =
    computeSellerRanking(tenantId, monthFrom, monthTo).find(r => r.id === currentUser.id)?.units || 0;
  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Meta individual do vendedor para o mês atual
  const myGoal = getSellerGoal(tenantId, currentUser.id, currentMonth);

  const progressPct = Math.round((myDevicesSold / myGoal) * 100);
  const remainingDevices = Math.max(0, myGoal - myDevicesSold);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* BOAS-VINDAS E STATUS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">
            Olá, {currentUser.full_name}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Atendimento comercial na loja {currentTenant?.trade_name}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('seller-pos')}
            className="text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-md transition-all active:scale-95"
            style={{
              backgroundColor: primaryColor,
              boxShadow: `0 4px 14px rgba(var(--tenant-primary-rgb), 0.35)`
            }}
          >
            <Plus className="w-4 h-4" />
            Nova Venda
          </button>
        </div>
      </div>

      {/* CARD DA META INDIVIDUAL DO VENDEDOR (SEM RANKING OU CUSTOS) */}
      <div className="bg-gradient-to-br from-[#0B0F17] to-[#1E293B] text-white rounded-3xl p-6 shadow-xl border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
              style={{
                backgroundColor: primaryColor,
                boxShadow: `0 6px 18px rgba(var(--tenant-primary-rgb), 0.4)`
              }}
            >
              <Target className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs uppercase font-extrabold tracking-wider" style={{ color: primaryColor }}>
                Minha Meta Individual — {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
              </span>
              <h3 className="text-2xl font-black mt-0.5">
                {myDevicesSold} de {myGoal} <span className="text-xs font-normal text-slate-400">aparelhos vendidos</span>
              </h3>
            </div>
          </div>

          <div className="text-right">
            <span className="text-3xl font-black text-amber-400">{progressPct}%</span>
            <p className="text-xs text-slate-400 font-medium">
              {remainingDevices > 0 ? `Restam ${remainingDevices} aparelhos para bater a meta` : 'Meta do mês alcançada!'}
            </p>
          </div>
        </div>

        {/* Barra de Progresso */}
        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 border border-slate-700">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(progressPct, 100)}%`, backgroundColor: primaryColor }}
          />
        </div>
      </div>

      {/* ATALHOS RÁPIDOS DE BALCÃO */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('seller-pos')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-slate-400 hover:shadow-md transition-all text-left group"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors"
            style={{ backgroundColor: `rgba(var(--tenant-primary-rgb), 0.12)`, color: primaryColor }}
          >
            <ShoppingBag className="w-5 h-5" />
          </div>
          <h4 className="font-extrabold text-sm text-slate-800">Nova Venda (Frente de Caixa)</h4>
          <p className="text-xs text-slate-400 mt-1">Aparelhos, acessórios, brindes e comprovante.</p>
        </button>

        <button
          onClick={() => onNavigate('seller-trade-in')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-indigo-500 hover:shadow-md transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <RefreshCw className="w-5 h-5" />
          </div>
          <h4 className="font-extrabold text-sm text-slate-800">Realizar Upgrade (Troca)</h4>
          <p className="text-xs text-slate-400 mt-1">Avaliação livre do aparelho usado e entrada automática.</p>
        </button>

        <button
          onClick={() => onNavigate('seller-os-intake')}
          className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:border-amber-500 hover:shadow-md transition-all text-left group"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <Wrench className="w-5 h-5" />
          </div>
          <h4 className="font-extrabold text-sm text-slate-800">Assistência (Entrada & Entrega)</h4>
          <p className="text-xs text-slate-400 mt-1">Receber aparelho, informar orçamento e entregar com pagamento.</p>
        </button>
      </div>

      {/* MINHAS OPERAÇÕES RECENTES */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800">Minhas Vendas Recentes</h3>
          <button
            onClick={() => onNavigate('seller-my-sales')}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Ver todas
          </button>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {mySales.slice(0, 5).map((sale) => {
            const customer = store.customers.find(c => c.id === sale.customer_id);
            return (
              <div key={sale.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div>
                  <span className="font-mono font-bold text-slate-800">Venda #{sale.sale_number}</span>
                  <div className="font-semibold text-slate-700">{customer?.name || 'Cliente Balcão'}</div>
                  <span className="text-[10px] text-slate-400">{new Date(sale.created_at).toLocaleString('pt-BR')}</span>
                </div>

                <div className="text-right">
                  <div className="font-black text-slate-900 text-sm">
                    {formatBRL(saleRevenue(sale))}
                  </div>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                    {sale.sales_origin}
                  </span>
                </div>
              </div>
            );
          })}
          {mySales.length === 0 && (
            <div className="p-6 text-center text-slate-400">
              Nenhuma venda registrada ainda. Clique em "Nova Venda" para começar!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
