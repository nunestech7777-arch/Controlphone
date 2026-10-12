// ============================================================================
// CONTROLPHONE — GESTÃO GLOBAL DE USUÁRIOS (SUPER ADMIN)
// ============================================================================

import React, { useState } from 'react';
import { Users, Search, KeyRound, Shield, Building2, UserX, X } from 'lucide-react';
import { store } from '../../lib/store';
import { adminApi } from '../../lib/adminApi';
import { passwordIssue } from '../../lib/tenantSetup';
import { useAuth } from '../../context/AuthContext';
import { UserProfile } from '../../types';

export const UsersManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [resetUser, setResetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const users = store.profiles;

  const filteredUsers = users.filter(u =>
    u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleActive = async (user: UserProfile) => {
    if (user.id === currentUser.id) {
      alert('Você não pode desativar a própria conta.');
      return;
    }
    if (store.isRealMode) {
      // O servidor bloqueia (ou libera) o login do usuário
      const remote = await adminApi.updateUser(user.id, { is_active: !user.is_active });
      if (!remote.ok) {
        alert(remote.error);
        return;
      }
    }
    user.is_active = !user.is_active;
    store.addAuditLog({
      tenant_id: user.tenant_id || undefined,
      user_id: currentUser.id,
      user_role: 'super_admin',
      action: user.is_active ? 'USUARIO_REATIVADO_SUPERADMIN' : 'USUARIO_DESATIVADO_SUPERADMIN',
      module: 'Super Admin Usuários',
      record_id: user.id,
      details: { usuario: user.full_name, email: user.email, ativo: user.is_active }
    });
    store.saveToStorage();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser || !newPassword) return;
    const issue = passwordIssue(newPassword);
    if (issue) {
      alert(issue);
      return;
    }
    if (store.isRealMode) {
      const remote = await adminApi.updateUser(resetUser.id, { password: newPassword });
      if (!remote.ok) {
        alert(remote.error);
        return;
      }
    }

    store.addAuditLog({
      tenant_id: resetUser.tenant_id || undefined,
      user_id: currentUser.id,
      user_role: 'super_admin',
      action: 'SENHA_REDEFINIDA_SUPERADMIN',
      module: 'Super Admin Usuários',
      record_id: resetUser.id,
      details: { usuario: resetUser.full_name, email: resetUser.email }
    });

    store.saveToStorage();
    alert(`Senha de ${resetUser.full_name} alterada com sucesso.`);
    setResetUser(null);
    setNewPassword('');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <Users className="w-5 h-5 text-blue-600" />
          Gestão Global de Usuários da Plataforma
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Controle de acesso por loja, redefinição segura de credenciais e desativação sem exclusão de históricos.
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nome ou E-mail..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* TABELA DE USUÁRIOS */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nome Completo</th>
                <th className="py-3.5 px-4">E-mail de Acesso</th>
                <th className="py-3.5 px-4">Loja Vinculada</th>
                <th className="py-3.5 px-4">Perfil</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const tenant = store.tenants.find(t => t.id === u.tenant_id);
                return (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-800">{u.full_name}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-600">{u.email}</td>
                    <td className="py-3.5 px-4">
                      {tenant ? (
                        <span className="font-semibold text-slate-700">{tenant.trade_name}</span>
                      ) : (
                        <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[10px]">
                          Plataforma Geral
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 capitalize font-semibold text-slate-700">
                      {u.role.replace('_', ' ')}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {u.is_active ? 'Ativo' : 'Desativado'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => setResetUser(u)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Redefinir Senha
                      </button>

                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`px-2 py-1 rounded-lg font-semibold text-[11px] ${
                          u.is_active ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {u.is_active ? 'Desativar' : 'Reativar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE REDEFINIÇÃO DE SENHA */}
      {resetUser && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" />
                Redefinir Senha de {resetUser.full_name}
              </h3>
              <button onClick={() => setResetUser(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
              <p className="text-slate-600">
                A redefinição administrativa altera a credencial no Supabase Auth imediatamente.
              </p>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nova Senha *</label>
                <input
                  type="password"
                  placeholder="Digite a nova senha segura"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResetUser(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold bg-[#1845E8] hover:bg-blue-700 text-white rounded-xl shadow-md"
                >
                  Confirmar Nova Senha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
