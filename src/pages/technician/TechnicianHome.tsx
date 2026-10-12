// ============================================================================
// CONTROLPHONE — PAINEL DE BANCADA TÉCNICA (TÉCNICO)
// ============================================================================

import React from 'react';
import { Wrench, CheckCircle2, AlertCircle, RefreshCw, Smartphone, Clock } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';

export const TechnicianHome: React.FC<{ onNavigate: (v: string) => void }> = ({ onNavigate }) => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const orders = store.serviceOrders.filter(o => o.tenant_id === tenantId && o.origin === 'external');
  const internalRepairs = store.internalRepairs.filter(r => r.tenant_id === tenantId);

  const waitingDiagnosis = orders.filter(o => o.status === 'waiting_diagnosis').length;
  const inMaintenance = orders.filter(o => o.status === 'in_maintenance').length;
  const readyForPickup = orders.filter(o => o.status === 'ready_for_pickup').length;
  const pendingInternal = internalRepairs.filter(r => r.status === 'in_progress').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Wrench className="w-5 h-5 text-blue-600" />
            Bancada Técnica — {currentTenant?.trade_name}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Diagnósticos, substituição de peças, laudos técnicos e manutenções do estoque da loja.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('tech-os-queue')}
            className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2"
          >
            Ver Fila de OS ({orders.filter(o => o.status !== 'delivered').length})
          </button>
        </div>
      </div>

      {/* CARDS DE STATUS TÉCNICO */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-1">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>Aguardando Diagnóstico</span>
          </div>
          <span className="text-2xl font-black text-slate-900">{waitingDiagnosis}</span>
          <p className="text-[11px] text-slate-400 mt-1">Aparelhos recebidos no balcão</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-1">
            <Wrench className="w-4 h-4 text-amber-600" />
            <span>Em Manutenção</span>
          </div>
          <span className="text-2xl font-black text-amber-600">{inMaintenance}</span>
          <p className="text-[11px] text-slate-400 mt-1">Aprovados pelo cliente</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Prontos p/ Retirada</span>
          </div>
          <span className="text-2xl font-black text-emerald-600">{readyForPickup}</span>
          <p className="text-[11px] text-slate-400 mt-1">Aguardando entrega do vendedor</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-1">
            <RefreshCw className="w-4 h-4 text-purple-600" />
            <span>Manutenções Estoque</span>
          </div>
          <span className="text-2xl font-black text-purple-700">{pendingInternal}</span>
          <p className="text-[11px] text-slate-400 mt-1">Aparelhos próprios da loja</p>
        </div>
      </div>

      {/* ATALHOS RÁPIDOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div
          onClick={() => onNavigate('tech-os-queue')}
          className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:border-blue-500 cursor-pointer transition-all space-y-3"
        >
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Wrench className="w-5 h-5" />
          </div>
          <h3 className="font-extrabold text-base text-slate-800">Ordens de Serviço de Clientes</h3>
          <p className="text-xs text-slate-500">
            Acesse a fila de clientes, registre testes funcionais, laudos técnicos, peças aplicadas e encaminhe para aprovação de orçamento pelo administrador.
          </p>
        </div>

        <div
          onClick={() => onNavigate('tech-internal-repairs')}
          className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm hover:border-purple-500 cursor-pointer transition-all space-y-3"
        >
          <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <RefreshCw className="w-5 h-5" />
          </div>
          <h3 className="font-extrabold text-base text-slate-800">Manutenções Internas do Estoque</h3>
          <p className="text-xs text-slate-500">
            Repare aparelhos comprados ou recebidos em upgrades (trocas de bateria, tela, carcaça). Os custos são incorporados ao custo acumulado do aparelho.
          </p>
        </div>
      </div>
    </div>
  );
};
