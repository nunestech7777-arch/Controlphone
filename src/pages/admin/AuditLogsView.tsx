// ============================================================================
// CONTROLPHONE — HISTÓRICO DE ATIVIDADES
// Mostra só quem fez, o que fez, em qual módulo e quando. Os detalhes técnicos
// de cada registro continuam guardados no banco para auditoria, fora da tela.
// ============================================================================

import React, { useState } from 'react';
import { History, Search, Clock, User } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { activityAuthor, activityModule, activityText, activityWhen } from '../../lib/activityLabels';

export const AuditLogsView: React.FC = () => {
  const { currentTenant, currentUser, isSupportMode } = useAuth();
  const tenantId = currentTenant?.id;
  // Super Admin fora do modo suporte vê a plataforma inteira; os demais, só a própria loja
  const isGlobal = currentUser.role === 'super_admin' && !isSupportMode;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');

  const entries = store.auditLogs
    .filter(l => isGlobal || (Boolean(tenantId) && l.tenant_id === tenantId))
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)) // mais recente primeiro
    .map(log => ({
      id: log.id,
      author: activityAuthor(log, store.profiles),
      text: activityText(log),
      module: activityModule(log),
      when: activityWhen(log.created_at)
    }));
  const modules = Array.from(new Set(entries.map(e => e.module))).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const term = searchTerm.trim().toLowerCase();
  const filtered = entries.filter(e =>
    (selectedModule === 'all' || e.module === selectedModule) &&
    (!term || e.author.toLowerCase().includes(term) || e.text.toLowerCase().includes(term) || e.module.toLowerCase().includes(term))
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" />
          Histórico de Atividades
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Quem fez o quê no sistema, em qual módulo e quando.
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por pessoa, ação ou módulo..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {['all', ...modules].map((mod) => (
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

      <div className="space-y-3">
        {filtered.map((entry) => (
          <div
            key={entry.id}
            className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-slate-800">
                <User className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{entry.author}</span>
              </p>
              <p className="text-sm text-slate-700">{entry.text}</p>
              <p className="text-xs text-slate-500">
                Módulo: <span className="font-semibold text-slate-600">{entry.module}</span>
              </p>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
              <Clock className="w-3.5 h-3.5" />
              {entry.when}
            </p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="bg-white p-6 rounded-2xl border border-slate-200/80 text-center text-xs text-slate-500">
            Nenhuma atividade encontrada.
          </p>
        )}
      </div>
    </div>
  );
};
