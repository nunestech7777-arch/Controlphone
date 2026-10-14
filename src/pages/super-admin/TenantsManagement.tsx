// ============================================================================
// CONTROLPHONE — GESTÃO DE LOJAS & SESSÃO DE SUPORTE (SUPER ADMIN)
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Palette, ShieldAlert, Search, Settings2, X } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Tenant } from '../../types';
import { isTenantOperational, planLabel, statusMeta } from '../../lib/tenantSetup';
import { TenantWizard } from './tenant/TenantWizard';
import { TenantDetailModal, TenantDetailTab } from './tenant/TenantDetailModal';
import { BackupOverviewRow, backupsAvailable, fetchBackupOverview, runDueBackups } from '../../lib/backupApi';
import { backupHealth } from '../../lib/backupFormat';

export const TenantsManagement: React.FC = () => {
  const { enterSupportMode, currentUser } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [detail, setDetail] = useState<{ tenantId: string; tab: TenantDetailTab } | null>(null);
  const [supportModalTenant, setSupportModalTenant] = useState<Tenant | null>(null);
  const [supportReason, setSupportReason] = useState('');

  // Status do Backup: último backup de cada loja (uma consulta para a lista inteira)
  const [backupOverview, setBackupOverview] = useState<Record<string, BackupOverviewRow> | null>(null);
  const loadBackupOverview = useCallback(async () => {
    if (!backupsAvailable()) return;
    const result = await fetchBackupOverview();
    if (result.ok) setBackupOverview(result.value);
  }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      await loadBackupOverview();
      // reforço do agendamento do servidor: põe em dia os automáticos atrasados e atualiza a coluna
      if (backupsAvailable() && (await runDueBackups()) > 0 && alive) await loadBackupOverview();
    })();
    return () => { alive = false; };
  }, [loadBackupOverview]);

  const tenants = store.tenants;
  const term = searchTerm.trim().toLowerCase();

  const filteredTenants = tenants.filter(t =>
    t.name.toLowerCase().includes(term) ||
    t.trade_name.toLowerCase().includes(term) ||
    t.email.toLowerCase().includes(term) ||
    (t.cnpj || '').includes(term)
  );

  const handleToggleTenantStatus = (tenant: Tenant) => {
    if (isTenantOperational(tenant.status)) {
      if (!window.confirm(`Suspender a loja "${tenant.trade_name}"? Os dados são preservados e a loja pode ser reativada depois.`)) return;
      store.setTenantStatus(tenant.id, 'suspended', currentUser.id);
    } else {
      store.setTenantStatus(tenant.id, 'active', currentUser.id);
    }
  };

  const handleStartSupport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportModalTenant || !supportReason.trim()) return;

    enterSupportMode(supportModalTenant.id, supportReason);
    setSupportModalTenant(null);
    setSupportReason('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Lojas Cadastradas
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Isolamento de dados rigoroso, personalização visual exclusiva do Super Admin e sessões de suporte temporárias.
          </p>
        </div>

        <button
          onClick={() => setIsWizardOpen(true)}
          className="bg-[#1845E8] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Nova Loja
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Loja, Razão Social, CNPJ ou E-mail..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* TABELA DE LOJAS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Loja</th>
                <th className="py-3.5 px-4">CNPJ</th>
                <th className="py-3.5 px-4">Contato Principal</th>
                <th className="py-3.5 px-4">Localização</th>
                <th className="py-3.5 px-4">Plano</th>
                <th className="py-3.5 px-4">Usuários</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4">Status do Backup</th>
                <th className="py-3.5 px-4 text-right">Ações do Super Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.map((tenant) => {
                const employeesCount = store.profiles.filter(p => p.tenant_id === tenant.id).length;
                const logo = store.themes[tenant.id]?.logo_compact_url || store.themes[tenant.id]?.logo_url;
                const status = statusMeta(tenant.status);
                const operational = isTenantOperational(tenant.status);
                const backup = backupOverview ? backupHealth(backupOverview[tenant.id]?.last_backup_at) : null;
                return (
                  <tr key={tenant.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => setDetail({ tenantId: tenant.id, tab: 'overview' })}
                        className="flex items-center gap-3 text-left group"
                      >
                        <span className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 p-1 flex items-center justify-center shrink-0">
                          {logo
                            ? <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
                            : <span className="font-black text-slate-500">{tenant.trade_name.charAt(0).toUpperCase()}</span>}
                        </span>
                        <span className="min-w-0">
                          <span className="font-bold text-slate-800 group-hover:text-blue-600 block transition-colors">{tenant.trade_name}</span>
                          <span className="text-[10px] text-slate-400 block">{tenant.name}</span>
                        </span>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {tenant.cnpj || '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-700 whitespace-nowrap">{tenant.phone}</div>
                      <span className="text-[10px] text-slate-400">{tenant.email}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                      {tenant.address_city ? `${tenant.address_city} - ${tenant.address_state}` : '—'}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                      {planLabel(tenant.plan)}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                      {employeesCount}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${status.badge}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {backup ? (
                        <button
                          type="button"
                          onClick={() => setDetail({ tenantId: tenant.id, tab: 'backups' })}
                          className="text-left group"
                          title="Abrir os backups desta loja"
                        >
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${backup.badge}`}>{backup.label}</span>
                          <span className="block mt-1 text-[10px] text-slate-400 group-hover:text-slate-600">{backup.text}</span>
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => setDetail({ tenantId: tenant.id, tab: 'overview' })}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                        title="Dados, usuários, documentos, plano e configurações da loja"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                        Gerenciar
                      </button>

                      <button
                        onClick={() => setDetail({ tenantId: tenant.id, tab: 'brand' })}
                        className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                        title="Personalizar Identidade Visual da Loja"
                      >
                        <Palette className="w-3.5 h-3.5" />
                        Personalizar
                      </button>

                      <button
                        onClick={() => setSupportModalTenant(tenant)}
                        className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                        title="Acessar Loja para Suporte Técnico"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Suporte
                      </button>

                      <button
                        onClick={() => handleToggleTenantStatus(tenant)}
                        className={`px-2 py-1 rounded-lg font-semibold text-[11px] ${
                          operational
                            ? 'text-rose-600 hover:bg-rose-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {operational ? 'Suspender' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredTenants.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 px-4 text-center text-slate-400">
                    Nenhuma loja encontrada para esta busca.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ASSISTENTE DE CADASTRO DE LOJA */}
      {isWizardOpen && (
        <TenantWizard
          onClose={() => setIsWizardOpen(false)}
          onOpenTenant={(tenantId) => {
            setIsWizardOpen(false);
            setDetail({ tenantId, tab: 'overview' });
          }}
        />
      )}

      {/* GESTÃO DA LOJA */}
      {detail && (
        <TenantDetailModal
          key={detail.tenantId + detail.tab}
          tenantId={detail.tenantId}
          initialTab={detail.tab}
          onClose={() => {
            setDetail(null);
            void loadBackupOverview(); // um backup pode ter sido criado ou excluído lá dentro
          }}
          onStartSupport={(tenant) => {
            setDetail(null);
            setSupportModalTenant(tenant);
          }}
        />
      )}

      {/* MODAL DE SESSÃO DE SUPORTE */}
      {supportModalTenant && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-amber-700 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Iniciar Sessão de Suporte — {supportModalTenant.trade_name}
              </h3>
              <button onClick={() => setSupportModalTenant(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleStartSupport} className="space-y-4 text-xs">
              <p className="text-slate-600">
                A sessão de suporte permite que o Super Admin acesse temporariamente o ambiente da loja de forma identificada e auditada, sem utilizar a senha do cliente.
              </p>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Motivo / Ticket do Suporte *</label>
                <textarea
                  rows={3}
                  value={supportReason}
                  onChange={(e) => setSupportReason(e.target.value)}
                  placeholder="Ex: Investigação de divergência de estoque ou auxílio em configuração..."
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSupportModalTenant(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-md"
                >
                  Iniciar Acesso Seguro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
