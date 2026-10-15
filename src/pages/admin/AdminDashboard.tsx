// ============================================================================
// CONTROLPHONE — DASHBOARD DO ADMINISTRADOR (ESTRUTURA FIEL À IMAGEM)
// ============================================================================

import React, { useState } from 'react';
import { ShoppingBag, DollarSign, Smartphone, CalendarDays } from 'lucide-react';
import { MetricCard } from '../../components/shared/MetricCard';
import { StoreBackupStatus } from '../../components/shared/StoreBackupStatus';
import { SellerRankingChart } from '../../components/charts/SellerRankingChart';
import { TopProductsDonutChart } from '../../components/charts/TopProductsDonutChart';
import { TrafficSourceBars } from '../../components/charts/TrafficSourceBars';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { computeStockMetrics, formatBRL, pendingStockNote } from '../../lib/stockMetrics';
import { salesByOrigin } from '../../lib/salesOrigins';
import { DASHBOARD_PERIODS, PERIOD_LABELS, PeriodKey, getPeriodRange, toInputDate } from '../../lib/sellerRanking';

export const AdminDashboard: React.FC = () => {
  const { currentTenant, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  // FILTRO GLOBAL: única referência de período para os indicadores comerciais do Dashboard
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [customFrom, setCustomFrom] = useState(() => toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(() => toInputDate(new Date()));
  const range = getPeriodRange(period, customFrom, customTo);
  const [from, to] = range;

  // --- SITUAÇÃO ATUAL (não segue o filtro de período) ---
  const storeDevices = store.devices.filter(d => d.tenant_id === tenantId);
  const availableDevices = storeDevices.filter(d => d.status === 'available');
  // Mesma fonte usada na tela de Estoque (lib/stockMetrics)
  const { stockSaleValue, investedCapital, potentialProfit, pendingDevices } = computeStockMetrics(tenantId);

  const storeOS = store.serviceOrders.filter(o => o.tenant_id === tenantId);

  // Ordens de serviço ativas por etapa (situação atual; não segue o filtro de período)
  const activeOS = storeOS.filter(o => !o.closed_at && !['delivered', 'cancelled', 'rejected', 'repair_completed'].includes(o.status));
  const osGroups: { label: string; statuses: string[] }[] = [
    { label: 'Aguardando diagnóstico', statuses: ['waiting_diagnosis', 'in_diagnosis'] },
    { label: 'Orçamento / aprovação', statuses: ['quote_pending_admin', 'quote_ready', 'waiting_client_approval', 'approved'] },
    { label: 'Em manutenção', statuses: ['in_maintenance'] },
    { label: 'Aguardando peça', statuses: ['waiting_parts'] },
    { label: 'Aguardando retirada', statuses: ['ready_for_pickup'] }
  ];
  const osSources = osGroups
    .map(g => ({ label: g.label, count: activeOS.filter(o => g.statuses.includes(o.status)).length }))
    .filter(g => g.count > 0)
    .map(g => ({
      name: g.label,
      percentage: Math.round((g.count / activeOS.length) * 100),
      valueText: `${g.count} OS`
    }));

  const allCompletedSales = store.sales.filter(s => s.tenant_id === tenantId && s.status === 'completed');

  // --- INDICADORES COMERCIAIS DO PERÍODO (seguem o filtro) ---
  // Vendas com todos os itens devolvidos deixam de contar; devolução parcial afeta só o item
  const periodSales = allCompletedSales.filter(s => {
    const date = new Date(s.created_at);
    return date >= from && date <= to && (s.items || []).some(it => !it.returned_at);
  });

  // Origem das vendas (canal de atração): cada origem separada, com quantidade e faturamento.
  // "Instagram" e "Instagram Ads" são linhas diferentes (orgânico x anúncio pago), nunca somadas.
  const trafficSources = salesByOrigin(periodSales).map(row => ({
    name: row.origin,
    percentage: Math.round((row.count / periodSales.length) * 100),
    valueText: `${row.count} ${row.count === 1 ? 'venda' : 'vendas'} · ${formatBRL(row.revenue)}`
  }));

  // Produtos mais vendidos (unidades por modelo de aparelho ou acessório)
  const productUnits: Record<string, number> = {};
  periodSales.forEach(sale => {
    (sale.items || []).filter(it => !it.returned_at).forEach(it => {
      let name = 'Produto';
      if (it.item_type === 'device') {
        const dev = store.devices.find(d => d.id === it.device_id);
        name = dev ? `${dev.brand} ${dev.model}` : 'Aparelho';
      } else {
        name = store.accessories.find(a => a.id === it.accessory_id)?.name || 'Acessório';
      }
      productUnits[name] = (productUnits[name] || 0) + Number(it.quantity || 1);
    });
  });
  const totalProductUnits = Object.values(productUnits).reduce((a, b) => a + b, 0);
  const sortedProducts = Object.entries(productUnits).sort((a, b) => b[1] - a[1]);
  const topProducts = sortedProducts.slice(0, 4);
  const otherUnits = sortedProducts.slice(4).reduce((acc, [, units]) => acc + units, 0);
  if (otherUnits > 0) topProducts.push(['Outros', otherUnits]);
  const productColors = [currentTheme.primary_color, '#0B0F17', '#94A3B8', '#CBD5E1', '#E2E8F0'];
  const productItems = topProducts.map(([name, units], idx) => ({
    name,
    value: Math.round((units / totalProductUnits) * 100),
    color: productColors[idx % productColors.length]
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* TÍTULO E BOAS-VINDAS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">
            Painel Executivo — {currentTenant?.trade_name || 'Loja'}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Resumo de vendas, estoque, assistência técnica e resultado da loja.
          </p>
          <StoreBackupStatus />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* FILTRO GLOBAL DE PERÍODO */}
          {period === 'custom' && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="Data inicial"
                className="px-2 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-xs bg-white"
              />
              <span>até</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="Data final"
                className="px-2 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-xs bg-white"
              />
            </div>
          )}
          <label className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-xl border border-slate-200 bg-white">
            <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Período</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              className="py-1 pr-1 text-xs font-semibold text-slate-700 bg-transparent focus:outline-none"
            >
              {DASHBOARD_PERIODS.map((key) => (
                <option key={key} value={key}>{PERIOD_LABELS[key]}</option>
              ))}
            </select>
          </label>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Operação em Tempo Real
          </span>
        </div>
      </div>

      {/* LINHA SUPERIOR: 3 CARDS DE KPI IDÊNTICOS À IMAGEM DE REFERÊNCIA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
        <MetricCard
          title="Aparelhos em Estoque"
          value={`${availableDevices.length} ${availableDevices.length === 1 ? 'aparelho' : 'aparelhos'}`}
          icon={Smartphone}
          changeText="Disponíveis para venda agora"
          showTrend={false}
          variant="light"
        />

        <MetricCard
          title="Vendas"
          value={`${periodSales.length} ${periodSales.length === 1 ? 'venda realizada' : 'vendas realizadas'}`}
          icon={ShoppingBag}
          changeText={`Vendas concluídas | ${PERIOD_LABELS[period]}`}
          showTrend={false}
          variant="light"
        />

        {/* CARD DESTACADO NA COR DA LOJA: potencial do estoque disponível (não segue o período) */}
        <MetricCard
          title="Valor Total do Estoque"
          value={formatBRL(stockSaleValue)}
          icon={DollarSign}
          variant="primary"
          details={[
            { label: 'Capital Investido', value: formatBRL(investedCapital) },
            { label: 'Lucro Potencial', value: formatBRL(potentialProfit) }
          ]}
          note={pendingStockNote(pendingDevices)}
        />
      </div>

      {/* ÁREA CENTRAL: Ranking (2/3) | Produtos Mais Vendidos + Origem das Vendas (1/3), com a mesma altura */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2">
          <SellerRankingChart tenantId={tenantId} range={range} externalPeriod={period} />
        </div>

        <div className="lg:col-span-1 flex flex-col gap-6">
          <TopProductsDonutChart totalSaleText={`${totalProductUnits} un.`} items={productItems} />
          <TrafficSourceBars
            title="Origem das Vendas"
            sources={trafficSources}
            className="flex-1"
          />
        </div>
      </div>

      {/* FAIXA INFERIOR EM LARGURA TOTAL: Ordens de Serviço por etapa */}
      <TrafficSourceBars
        title="Ordens de Serviço"
        sources={osSources}
        emptyText="Nenhuma ordem de serviço ativa."
        columns
      />
    </div>
  );
};
