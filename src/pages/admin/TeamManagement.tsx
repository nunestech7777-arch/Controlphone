// ============================================================================
// CONTROLPHONE — EQUIPE DA LOJA (GESTÃO DE VENDEDORES & TÉCNICOS)
// ============================================================================

import React, { useState } from 'react';
import { UserCheck, Plus, KeyRound, Pencil, Eye, X } from 'lucide-react';
import { store } from '../../lib/store';
import { adminApi } from '../../lib/adminApi';
import { passwordIssue } from '../../lib/tenantSetup';
import { useAuth } from '../../context/AuthContext';
import { UserProfile } from '../../types';
import { UserAvatar } from '../../components/shared/UserAvatar';
import { AvatarUploadField } from '../../components/shared/AvatarUploadField';
import { SellerRankingChart } from '../../components/charts/SellerRankingChart';
import { SalesGoalsPanel } from './SalesGoalsAndRanking';
import { removeAvatarFile, uploadAvatar } from '../../lib/avatarStorage';
import { computeSellerRanking, getMonthRange, getSellerGoal, toMonthKey } from '../../lib/sellerRanking';

type TeamTab = 'team' | 'goals' | 'ranking';

// Aba EQUIPE | METAS | RANKING (Metas & Ranking deixou de ser item separado da sidebar)
export const TeamManagement: React.FC = () => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';
  const [tab, setTab] = useState<TeamTab>('team');

  const tabs: { id: TeamTab; label: string }[] = [
    { id: 'team', label: 'Equipe' },
    { id: 'goals', label: 'Metas' },
    { id: 'ranking', label: 'Ranking' }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'team' && <TeamMembersTab />}
      {tab === 'goals' && <SalesGoalsPanel />}
      {tab === 'ranking' && <SellerRankingChart tenantId={tenantId} showGoals title="Ranking de Vendedores" />}
    </div>
  );
};

const TeamMembersTab: React.FC = () => {
  const { currentTenant, currentUser } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState('');
  const [detailMember, setDetailMember] = useState<UserProfile | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [resetModalUser, setResetModalUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'seller' | 'technician'>('seller');
  const [password, setPassword] = useState('');

  const teamMembers = store.profiles.filter(p => p.tenant_id === tenantId && p.role !== 'admin');

  const editingMember = teamMembers.find(m => m.id === editingMemberId);

  const resetForm = () => {
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setRole('seller');
    setPhotoFile(null);
    setPhotoRemoved(false);
    setFormError('');
    setEditingMemberId(null);
  };

  const openCreateModal = () => {
    resetForm();
    setDraftId('user-' + Date.now());
    setIsModalOpen(true);
  };

  const openEditModal = (member: UserProfile) => {
    resetForm();
    setEditingMemberId(member.id);
    setFullName(member.full_name);
    setEmail(member.email);
    setPhone(member.phone || '');
    setRole(member.role === 'technician' ? 'technician' : 'seller');
    setDetailMember(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  // Cria ou edita o funcionário (e-mail, senha e papel de acesso não mudam na edição)
  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || (!editingMember && (!email || !password))) return;

    if (!editingMember && store.profiles.some(p => p.email.toLowerCase() === email.trim().toLowerCase())) {
      setFormError('Já existe um funcionário com este e-mail.');
      return;
    }

    if (!editingMember && store.isRealMode) {
      const issue = passwordIssue(password);
      if (issue) {
        setFormError(issue);
        return;
      }
    }

    setSaving(true);
    setFormError('');
    try {
      // Modo real: o servidor cria o login e a senha e liga o funcionário a esta loja
      let createdRemote: UserProfile | null = null;
      if (!editingMember && store.isRealMode) {
        const remote = await adminApi.createUser(tenantId, role, {
          full_name: fullName.trim(), email: email.trim(), password, phone: phone.trim() || undefined
        });
        if (!remote.ok) throw new Error(remote.error);
        createdRemote = remote.profile;
      }

      const userId = editingMember?.id || createdRemote?.id || draftId;
      let avatarUrl = editingMember?.avatar_url;
      let avatarPath = editingMember?.avatar_path;

      if (photoFile) {
        const stored = await uploadAvatar(photoFile, tenantId, userId, editingMember?.avatar_path);
        avatarUrl = stored.url;
        avatarPath = stored.path;
      } else if (photoRemoved) {
        await removeAvatarFile(editingMember?.avatar_path);
        avatarUrl = undefined;
        avatarPath = undefined;
      }

      if (store.isRealMode) {
        const photoChanged = Boolean(photoFile) || photoRemoved;
        if (editingMember || photoChanged) {
          const remote = await adminApi.updateUser(userId, {
            full_name: fullName.trim(),
            phone: phone.trim() || null,
            ...(photoChanged ? { avatar_url: avatarUrl || null, avatar_path: avatarPath || null } : {})
          });
          if (!remote.ok) throw new Error(remote.error);
        }
      }

      if (editingMember) {
        editingMember.full_name = fullName.trim();
        editingMember.phone = phone.trim() || undefined;
        editingMember.avatar_url = avatarUrl;
        editingMember.avatar_path = avatarPath;
        store.addAuditLog({
          tenant_id: tenantId,
          user_id: currentUser.id,
          user_role: 'admin',
          action: 'FUNCIONARIO_EDITADO',
          module: 'Equipe da Loja',
          record_id: editingMember.id,
          details: { nome: editingMember.full_name, foto_alterada: Boolean(photoFile) || photoRemoved }
        });
      } else {
        const newMember: UserProfile = {
          id: userId,
          tenant_id: tenantId,
          role,
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          avatar_url: avatarUrl,
          avatar_path: avatarPath,
          is_active: true,
          created_at: createdRemote?.created_at || new Date().toISOString()
        };
        store.profiles.push(newMember);
        store.addAuditLog({
          tenant_id: tenantId,
          user_id: currentUser.id,
          user_role: 'admin',
          action: 'FUNCIONARIO_CADASTRADO',
          module: 'Equipe da Loja',
          record_id: newMember.id,
          details: { nome: newMember.full_name, email: newMember.email, cargo: role }
        });
      }

      store.saveToStorage();
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível salvar o funcionário.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (member: UserProfile) => {
    if (store.isRealMode) {
      // O servidor bloqueia (ou libera) o login do funcionário
      const remote = await adminApi.updateUser(member.id, { is_active: !member.is_active });
      if (!remote.ok) {
        alert(remote.error);
        return;
      }
    }
    member.is_active = !member.is_active;
    store.addAuditLog({
      tenant_id: tenantId,
      user_id: currentUser.id,
      user_role: 'admin',
      action: member.is_active ? 'FUNCIONARIO_REATIVADO' : 'FUNCIONARIO_DESATIVADO',
      module: 'Equipe da Loja',
      record_id: member.id,
      details: { nome: member.full_name, ativo: member.is_active }
    });
    store.saveToStorage();
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !newPassword) return;
    if (store.isRealMode) {
      const issue = passwordIssue(newPassword);
      if (issue) {
        alert(issue);
        return;
      }
      const remote = await adminApi.updateUser(resetModalUser.id, { password: newPassword });
      if (!remote.ok) {
        alert(remote.error);
        return;
      }
    }

    store.addAuditLog({
      tenant_id: tenantId,
      user_id: currentUser.id,
      user_role: 'admin',
      action: 'SENHA_REDEFINIDA',
      module: 'Equipe da Loja',
      record_id: resetModalUser.id,
      details: { funcionario: resetModalUser.full_name, email: resetModalUser.email }
    });

    store.saveToStorage();
    alert(`Senha de ${resetModalUser.full_name} alterada com sucesso.`);
    setResetModalUser(null);
    setNewPassword('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-blue-600" />
            Equipe da Loja (Vendedores & Técnicos)
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Cadastro, fotos de perfil, metas e ranking. Funcionários são desativados, nunca excluídos, para preservar o histórico.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Funcionário
        </button>
      </div>

      {/* TABELA DE MEMBROS DA EQUIPE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nome Completo</th>
                <th className="py-3.5 px-4">Função / Perfil</th>
                <th className="py-3.5 px-4">E-mail de Acesso</th>
                <th className="py-3.5 px-4">Telefone</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teamMembers.map((member) => (
                <tr key={member.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar name={member.full_name} src={member.avatar_url} size="md" />
                      <span className="font-bold text-slate-800 truncate max-w-[200px]" title={member.full_name}>
                        {member.full_name}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      member.role === 'seller' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {member.role === 'seller' ? 'Vendedor' : 'Técnico de Manutenção'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-600">{member.email}</td>
                  <td className="py-3.5 px-4 text-slate-500">{member.phone || '—'}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      member.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {member.is_active ? 'Ativo' : 'Desativado'}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                    <button
                      onClick={() => setDetailMember(member)}
                      title="Ver informações e desempenho"
                      aria-label="Ver informações e desempenho"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 inline-flex align-middle"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(member)}
                      title="Editar funcionário"
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Editar
                    </button>
                    <button
                      onClick={() => setResetModalUser(member)}
                      title="Redefinir Senha"
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Redefinir Senha
                    </button>

                    <button
                      onClick={() => handleToggleActive(member)}
                      className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] ${
                        member.is_active
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {member.is_active ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE CADASTRO */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">
                {editingMember ? 'Editar Funcionário' : 'Cadastrar Novo Funcionário'}
              </h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMember} className="space-y-3 text-xs">
              <AvatarUploadField
                name={fullName}
                currentUrl={editingMember?.avatar_url}
                file={photoFile}
                removed={photoRemoved}
                onFileChange={setPhotoFile}
                onRemovedChange={setPhotoRemoved}
              />

              <div>
                <label className="font-bold text-slate-700 block mb-1">Nome Completo *</label>
                <input
                  type="text"
                  placeholder="Nome do colaborador"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Perfil de Acesso *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'seller' | 'technician')}
                    disabled={Boolean(editingMember)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold disabled:bg-slate-50 disabled:text-slate-500"
                  >
                    <option value="seller">Vendedor</option>
                    <option value="technician">Técnico</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Telefone</label>
                  <input
                    type="text"
                    placeholder="(11) 99999-9999"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">E-mail Corporativo *</label>
                <input
                  type="email"
                  placeholder="funcionario@loja.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={Boolean(editingMember)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-medium disabled:bg-slate-50 disabled:text-slate-500"
                  required
                />
              </div>

              {!editingMember ? (
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Senha Inicial de Acesso *</label>
                  <input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  E-mail, perfil de acesso e senha não são alterados aqui. Use "Redefinir Senha" quando necessário.
                </p>
              )}

              {formError && <p className="text-[11px] font-semibold text-rose-600">{formError}</p>}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-tenant-primary px-5 py-2 font-bold rounded-xl disabled:opacity-60"
                >
                  {saving ? 'Salvando...' : editingMember ? 'Salvar Alterações' : 'Criar Acesso'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETALHES DO FUNCIONÁRIO + DESEMPENHO INDIVIDUAL */}
      {detailMember && (() => {
        const monthKey = toMonthKey(new Date());
        const [from, to] = getMonthRange(monthKey);
        const units = computeSellerRanking(tenantId, from, to).find(r => r.id === detailMember.id)?.units || 0;
        const goal = getSellerGoal(tenantId, detailMember.id, monthKey);
        const pct = Math.round((units / goal) * 100);
        return (
          <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-4 min-w-0">
                  <UserAvatar name={detailMember.full_name} src={detailMember.avatar_url} size="xl" />
                  <div className="min-w-0">
                    <h3 className="text-base font-extrabold text-slate-800 truncate">{detailMember.full_name}</h3>
                    <p className="text-xs text-slate-500">
                      {detailMember.role === 'seller' ? 'Vendedor' : 'Técnico de Manutenção'} |{' '}
                      {detailMember.is_active ? 'Ativo' : 'Desativado'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setDetailMember(null)} className="text-slate-400 hover:text-slate-700 shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">E-mail de acesso</span>
                    <span className="font-semibold text-slate-800 break-all">{detailMember.email}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Telefone</span>
                    <span className="font-semibold text-slate-800">{detailMember.phone || 'Não informado'}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 sm:col-span-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Cadastrado em</span>
                    <span className="font-semibold text-slate-800">
                      {new Date(detailMember.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                {detailMember.role === 'seller' && (
                  <div className="rounded-xl p-4 border border-slate-200 space-y-2">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Desempenho em {monthKey}
                    </span>
                    <div className="flex justify-between font-semibold text-slate-700">
                      <span>{units} aparelhos vendidos</span>
                      <span className="tabular-nums">{pct}% da meta de {goal}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-tenant-primary"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDetailMember(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(detailMember)}
                    className="btn-tenant-primary px-5 py-2 rounded-xl font-bold flex items-center gap-2"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL DE REDEFINIÇÃO DE SENHA */}
      {resetModalUser && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" />
                Redefinir Senha de {resetModalUser.full_name}
              </h3>
              <button onClick={() => setResetModalUser(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
              <p className="text-slate-600">
                Por segurança, senhas atuais nunca são exibidas. Digite uma nova senha para o colaborador.
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
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-tenant-primary px-5 py-2 font-bold rounded-xl"
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
