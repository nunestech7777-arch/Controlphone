// ============================================================================
// CONTROLPHONE — DASHBOARD SUPER ADMIN (GESTÃO DA PLATAFORMA SAAS)
// ============================================================================

import React from 'react';
import { Building2, Users, ShieldCheck, DollarSign, Activity, UserCheck, Wrench, ShoppingBag } from 'lucide-react';
import { MetricCard } from '../../components/shared/MetricCard';
import { PerformanceAreaChart } from '../../components/charts/PerformanceAreaChart';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';

export const SuperDashboard: React.FC<{ onNavigate: (v: string) => void }> = ({ onNavigate }) => {
  const tenants = store.tenants;
  const activeTenants = tenants.filter(t => t.status === 'active');
  const suspendedTenants = tenants.filter(t => t.status === 'suspended');

  const totalUsers = store.profiles.length;
  const adminUsers = store.profiles.filter(p => p.role === 'admin').length;
  const sellerUsers = store.profiles.filter(p => p.role === 'seller').length;
  const techUsers = store.profiles.filter(p => p.role === 'technician').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Painel Geral — Controlphone
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Monitoramento global de estabelecimentos, usuários ativos e integridade da infraestrutura Multi-Tenant.
          </p>
        </div>

        <button
          onClick={() => onNavigate('super-tenants')}
          className="bg-[#1845E8] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all"
        >
          <Building2 className="w-4 h-4" />
          Gerenciar Lojas
        </button>
      </div>

      {/* MÉTRICAS DA PLATAFORMA */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <MetricCard
          title="Lojas Ativas"
          value={`${activeTenants.length} / ${tenants.length}`}
          icon={Building2}
          changeText="100% de estabilidade"
          isPositive={true}
          variant="primary"
        />

        <MetricCard
          title="Total de Usuários"
          value={totalUsers.toString()}
          icon={Users}
          changeText={`${adminUsers} admins, ${sellerUsers} vendedores`}
          isPositive={true}
          variant="light"
        />

        <MetricCard
          title="Equipe Técnica"
          value={techUsers.toString()}
          icon={Wrench}
          changeText="Bancadas ativas"
          isPositive={true}
          variant="light"
        />

        <MetricCard
          title="Sessões de Suporte"
          value={store.supportSessions.length.toString()}
          icon={Activity}
          changeText="Histórico auditado"
          isPositive={true}
          variant="light"
        />
      </div>

      {/* GRÁFICO DE ADESÃO SAAS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PerformanceAreaChart
            title="Crescimento de Lojas e Usuários Conectados"
            badge="+24.5% este trimestre"
          />
        </div>

        {/* DISTRIBUIÇÃO DE CARGOS */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800">Distribuição por Perfil de Acesso</h3>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50">
              <span className="font-semibold text-slate-700">Administradores de Loja</span>
              <span className="font-black text-slate-900 bg-white px-2 py-0.5 rounded shadow-sm">{adminUsers}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-blue-50/50">
              <span className="font-semibold text-blue-900">Vendedores (Frente de Caixa)</span>
              <span className="font-black text-blue-600 bg-white px-2 py-0.5 rounded shadow-sm">{sellerUsers}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-amber-50/50">
              <span className="font-semibold text-amber-900">Técnicos de Bancada</span>
              <span className="font-black text-amber-600 bg-white px-2 py-0.5 rounded shadow-sm">{techUsers}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
