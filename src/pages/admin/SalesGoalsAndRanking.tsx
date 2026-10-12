// ============================================================================
// CONTROLPHONE — METAS DOS VENDEDORES (ABA "METAS" DA EQUIPE DA LOJA)
// Meta = quantidade de aparelhos vendidos no mês (vendas concluídas; acessórios,
// brindes e vendas canceladas não contam). Mesma fonte do ranking: lib/sellerRanking.
// ============================================================================

import React, { useState } from 'react';
import { Target, Plus, X } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../../components/shared/UserAvatar';
import {
  computeSellerRanking,
  getMonthRange,
  getSellerGoal,
  hasExplicitGoal,
  toMonthKey
} from '../../lib/sellerRanking';

export const SalesGoalsPanel: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [monthKey, setMonthKey] = useState(toMonthKey(new Date()));
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [selectedSellerId, setSelectedSellerId] = useState('');
  const [targetCount, setTargetCount] = useState('15');

  const sellers = store.profiles.filter(p => p.tenant_id === tenantId && p.role === 'seller' && p.is_active);

  const [from, to] = getMonthRange(monthKey);
  const ranking = computeSellerRanking(tenantId, from, to);

  const rows = sellers
    .map((seller) => {
      const units = ranking.find(r => r.id === seller.id)?.units || 0;
      const goal = getSellerGoal(tenantId, seller.id, monthKey);
      const progressPct = Math.round((units / goal) * 100);
      return {
        seller,
        units,
        goal,
        progressPct,
        remaining: Math.max(0, goal - units),
        explicit: hasExplicitGoal(tenantId, seller.id, monthKey)
      };
    })
    .sort((a, b) => b.progressPct - a.progressPct || a.seller.full_name.localeCompare(b.seller.full_name, 'pt-BR'));

  const openGoalModal = (sellerId: string) => {
    const current = rows.find(r => r.seller.id === sellerId);
    setSelectedSellerId(sellerId);
    setTargetCount(String(current?.goal ?? 15));
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(targetCount);
    if (!selectedSellerId || !(target >= 1)) return;
    // Somente o administrador da loja (esta tela) altera metas
    if (currentUser.role !== 'admin' && currentUser.role !== 'super_admin') return;

    const existing = store.goals.find(
      g => g.tenant_id === tenantId && g.seller_id === selectedSellerId && g.month_year === monthKey
    );

    if (existing) {
      existing.target_device_count = target;
    } else {
      store.goals.push({
        id: 'goal-' + Date.now(),
        tenant_id: tenantId,
        seller_id: selectedSellerId,
        month_year: monthKey,
        target_device_count: target
      });
    }

    store.addAuditLog({
      tenant_id: tenantId,
      user_id: currentUser.id,
      user_role: currentUser.role,
      action: 'META_ATUALIZADA',
      module: 'Equipe da Loja',
      record_id: selectedSellerId,
      details: { mes: monthKey, meta_aparelhos: target }
    });

    store.saveToStorage();
    setIsGoalModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="goals-month" className="text-xs font-bold text-slate-600">Mês de referência</label>
          <input
            id="goals-month"
            type="month"
            value={monthKey}
            onChange={(e) => e.target.value && setMonthKey(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-xs font-semibold bg-white"
          />
        </div>

        <button
          onClick={() => openGoalModal(sellers[0]?.id || '')}
          disabled={sellers.length === 0}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Ajustar Metas do Mês
        </button>
      </div>

      {/* PROGRESSO POR VENDEDOR */}
      {rows.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div key={r.seller.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <UserAvatar name={r.seller.full_name} src={r.seller.avatar_url} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-slate-800 truncate" title={r.seller.full_name}>
                    {r.seller.full_name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Meta: {r.goal} un.{!r.explicit && <span className="text-slate-400"> (padrão)</span>}
                  </div>
                </div>
                <button
                  onClick={() => openGoalModal(r.seller.id)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] shrink-0"
                >
                  Definir
                </button>
              </div>

              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-[11px] font-semibold">
                  <span className="text-slate-500">{r.units} vendidos</span>
                  <span className="text-tenant-primary tabular-nums">{r.progressPct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-tenant-primary transition-all duration-500"
                    style={{ width: `${Math.min(r.progressPct, 100)}%` }}
                  />
                </div>
                <div className="text-[11px] font-medium text-slate-500">
                  {r.progressPct >= 100 ? 'Meta superada' : `${r.remaining} un. restantes para a meta`}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-8 text-center text-xs font-medium text-slate-400">
          Nenhum vendedor ativo cadastrado. Cadastre vendedores na aba Equipe.
        </div>
      )}

      {/* TABELA DE ACOMPANHAMENTO */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Acompanhamento das Metas — {monthKey}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4 whitespace-nowrap">Vendedor</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Aparelhos Vendidos</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Meta do Mês</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Restante</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Atingimento</th>
                  <th className="py-3.5 px-4 whitespace-nowrap text-right">Status da Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.seller.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar name={r.seller.full_name} src={r.seller.avatar_url} size="sm" />
                        <span className="font-bold text-slate-800 truncate max-w-[180px]">{r.seller.full_name}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-extrabold text-blue-600 whitespace-nowrap">{r.units} un.</td>
                    <td className="py-3.5 px-4 text-right font-semibold text-slate-700 whitespace-nowrap">{r.goal} un.</td>
                    <td className="py-3.5 px-4 text-right font-semibold text-slate-700 whitespace-nowrap">{r.remaining} un.</td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">{r.progressPct}%</td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        r.progressPct >= 100
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : r.progressPct >= 70
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {r.progressPct >= 100 ? 'Meta Superada' : `${r.remaining} un. restantes`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE DEFINIÇÃO DE METAS */}
      {isGoalModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-600" />
                Definir Meta de Aparelhos do Vendedor
              </h3>
              <button onClick={() => setIsGoalModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGoal} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Vendedor *</label>
                <select
                  value={selectedSellerId}
                  onChange={(e) => {
                    setSelectedSellerId(e.target.value);
                    setTargetCount(String(getSellerGoal(tenantId, e.target.value, monthKey)));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                >
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Quantidade Alvo de Aparelhos ({monthKey}) *</label>
                <input
                  type="number"
                  min="1"
                  value={targetCount}
                  onChange={(e) => setTargetCount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-black text-sm text-blue-600"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  A meta conta apenas aparelhos vendidos. Acessórios, brindes e vendas canceladas são desconsiderados.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsGoalModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">
                  Salvar Meta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
