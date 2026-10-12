// ============================================================================
// CONTROLPHONE — HISTÓRICO DE ATIVIDADES E AUDITORIA COMPLETA
// ============================================================================

import React, { useState } from 'react';
import { History, Search, Filter, ShieldCheck, User, Clock, Terminal } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';

export const AuditLogsView: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');

  const logs = store.auditLogs.filter(l => !l.tenant_id || l.tenant_id === tenantId);

  const filteredLogs = logs.filter(l => {
    const matchesModule = selectedModule === 'all' || l.module === selectedModule;
    const matchesSearch =
      l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.module.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.user_email && l.user_email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.details && JSON.stringify(l.details).toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesModule && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" />
          Histórico de Atividades
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Rastreabilidade total: quem fez, o que fez, quando fez e quais registros foram modificados no sistema.
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por ação, usuário ou detalhes..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {['all', 'Vendas', 'Estoque', 'Garantias', 'Assistência Técnica', 'Manutenção Interna'].map((mod) => (
            <button
              key={mod}
              onClick={() => setSelectedModule(mod)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
                selectedModule === mod
                  ? 'bg-[#0B0F17] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {mod === 'all' ? 'Todos os Módulos' : mod}
            </button>
          ))}
        </div>
      </div>

      {/* LISTA DE LOGS DE AUDITORIA */}
      <div className="space-y-3">
        {filteredLogs.map((log) => {
          const user = store.profiles.find(p => p.id === log.user_id);
          return (
            <div
              key={log.id}
              className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm hover:border-slate-300 transition-all text-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-tenant-primary text-white">
                    {log.module}
                  </span>
                  <span className="font-extrabold text-slate-800 tracking-wide font-mono">
                    {log.action}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-slate-600">
                <div className="flex items-center gap-1.5 shrink-0">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-800">
                    {user?.full_name || log.user_email || 'Sistema'}
                  </span>
                  <span className="text-slate-400">({log.user_role})</span>
                </div>

                {log.details && (
                  <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100 font-mono text-[11px] text-slate-700 break-all min-w-0">
                    {JSON.stringify(log.details)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
