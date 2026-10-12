// ============================================================================
// CONTROLPHONE — GESTÃO DA LOJA (EXCLUSIVO SUPER ADMIN)
// Visão completa da loja após o cadastro: dados, assinatura, usuários,
// identidade visual, documentos, plano e configurações.
// ============================================================================

import React, { useState } from 'react';
import {
  Ban, Building2, Check, CheckCircle2, CreditCard, FileText, KeyRound, LayoutGrid, Palette, Pencil, RotateCcw,
  ShieldAlert, SlidersHorizontal, Trash2, Users, X
} from 'lucide-react';
import { adminApi } from '../../../lib/adminApi';
import { store, toLocalDay } from '../../../lib/store';
import { useAuth } from '../../../context/AuthContext';
import { Tenant, TenantDocumentType, TenantFeatures, UserProfile, UserRole } from '../../../types';
import {
  formatDateBR, formatDateTimeBR, isTenantOperational, isValidEmail, maskCEP, maskCNPJ, maskPhone,
  passwordIssue, planLabel, statusMeta
} from '../../../lib/tenantSetup';
import {
  analyzeTemplate, deleteTemplateFile, openTemplateFile, saveTemplateFile, validateTemplateFile
} from '../../../lib/tenantDocuments';
import { FeatureChecklist, Field, PasswordField, PlanDraft, PlanFields, TextField, inputCls } from './fields';
import { BrandDraft, BrandIdentityForm, brandDraftOf } from './BrandIdentityForm';
import { DocumentSlot, TenantDocumentsForm } from './TenantDocumentsForm';

export type TenantDetailTab = 'overview' | 'users' | 'brand' | 'documents' | 'plan' | 'features';

const TABS: { id: TenantDetailTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutGrid },
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'brand', label: 'Identidade Visual', icon: Palette },
  { id: 'documents', label: 'Documentos', icon: FileText },
  { id: 'plan', label: 'Plano', icon: CreditCard },
  { id: 'features', label: 'Configurações', icon: SlidersHorizontal }
];

const ROLE_GROUPS: { role: UserRole; title: string; empty: string }[] = [
  { role: 'admin', title: 'Administrador', empty: 'Nenhum administrador cadastrado.' },
  { role: 'seller', title: 'Vendedores', empty: 'Nenhum vendedor cadastrado.' },
  { role: 'technician', title: 'Técnicos', empty: 'Nenhum técnico cadastrado.' }
];

const primaryBtn = 'px-5 py-2.5 rounded-xl bg-[#1845E8] hover:bg-blue-700 text-white font-extrabold text-xs shadow-md shadow-blue-600/20 inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-60';
const ghostBtn = 'px-4 py-2.5 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-100 text-xs inline-flex items-center gap-2 transition-colors';

const Info: React.FC<{ label: string; value?: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
    <dd className={`mt-0.5 text-xs font-semibold text-slate-800 break-words ${mono ? 'font-mono' : ''}`}>{value || '—'}</dd>
  </div>
);

interface TenantDetailModalProps {
  tenantId: string;
  initialTab?: TenantDetailTab;
  onClose: () => void;
  onStartSupport: (tenant: Tenant) => void;
}

type CompanyDraft = Record<
  'trade_name' | 'name' | 'cnpj' | 'state_registration' | 'email' | 'phone' | 'whatsapp' | 'website'
  | 'address_zipcode' | 'address_street' | 'address_number' | 'address_complement'
  | 'address_neighborhood' | 'address_city' | 'address_state',
  string
>;

export const TenantDetailModal: React.FC<TenantDetailModalProps> = ({ tenantId, initialTab = 'overview', onClose, onStartSupport }) => {
  const { currentUser, updateTheme, resetTheme } = useAuth();
  const tenant = store.tenants.find(t => t.id === tenantId);
  const theme = store.getTenantTheme(tenantId);

  const [tab, setTab] = useState<TenantDetailTab>(initialTab);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // Rascunhos de edição (cada aba salva o seu)
  const [notes, setNotes] = useState(tenant?.internal_notes || '');
  const [brand, setBrand] = useState<BrandDraft>(() => brandDraftOf(theme));
  const [displayName, setDisplayName] = useState(theme.display_name || tenant?.trade_name || '');
  const [plan, setPlan] = useState<PlanDraft>({
    plan: tenant?.plan || '',
    planStart: tenant?.plan_start_date || '',
    planDue: tenant?.plan_due_date || '',
    status: tenant?.status || 'active'
  });
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const [features, setFeatures] = useState<TenantFeatures>(() => store.getTenantFeatures(tenantId));
  const [resetUser, setResetUser] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [company, setCompany] = useState<CompanyDraft | null>(null); // preenchido enquanto os dados são editados

  if (!tenant) return null;

  const users = store.profiles.filter(p => p.tenant_id === tenantId);
  const admin = users.find(u => u.role === 'admin');
  const status = statusMeta(tenant.status);
  const operational = isTenantOperational(tenant.status);
  const today = toLocalDay(new Date());
  const overdue = Boolean(tenant.plan_due_date && tenant.plan_due_date < today);
  const lastAccess = store.getTenantLastAccess(tenantId);

  const say = (result: { ok: boolean; error?: string }, success: string) =>
    setNotice({ ok: result.ok, text: result.ok ? success : result.error || 'Não foi possível concluir a ação.' });

  const patchCompany = (p: Partial<CompanyDraft>) => setCompany(c => (c ? { ...c, ...p } : c));

  const changeTab = (next: TenantDetailTab) => {
    setTab(next);
    setNotice(null);
  };

  // ---- Ações ----

  const handleToggleStatus = () => {
    if (operational) {
      if (!window.confirm(`Suspender a loja "${tenant.trade_name}"? Os dados são preservados e a loja pode ser reativada a qualquer momento.`)) return;
      say(store.setTenantStatus(tenantId, 'suspended', currentUser.id), 'Loja suspensa.');
      setPlan(p => ({ ...p, status: 'suspended' }));
    } else {
      say(store.setTenantStatus(tenantId, 'active', currentUser.id), 'Loja reativada.');
      setPlan(p => ({ ...p, status: 'active' }));
    }
  };

  const handleSaveNotes = () =>
    say(store.updateTenantCompany(tenantId, { internal_notes: notes.trim() || undefined }, currentUser.id), 'Observações salvas.');

  const handleSaveBrand = () => {
    updateTheme({ ...theme, ...brand, display_name: displayName.trim() || tenant.trade_name });
    setNotice({ ok: true, text: 'Identidade visual salva e aplicada ao ambiente da loja.' });
  };

  const handleResetBrand = () => {
    if (!window.confirm(`Restaurar a identidade visual padrão de "${tenant.trade_name}"? Logos e cores personalizadas serão removidos.`)) return;
    const def = resetTheme(tenantId);
    setBrand(brandDraftOf(def));
    setDisplayName(def.display_name);
    setNotice({ ok: true, text: 'Identidade visual restaurada para o padrão.' });
  };

  const handleSavePlan = () => {
    const errors: Record<string, string> = {};
    if (!plan.plan) errors.plan = 'Selecione o plano da loja.';
    if (!plan.planStart) errors.planStart = 'Informe a data de início.';
    if (!plan.planDue) errors.planDue = 'Informe a data de vencimento.';
    else if (plan.planStart && plan.planDue < plan.planStart) errors.planDue = 'O vencimento não pode ser anterior ao início.';
    setPlanErrors(errors);
    if (Object.keys(errors).length || !plan.plan) return;

    const saved = store.updateTenantPlan(
      tenantId, { plan: plan.plan, plan_start_date: plan.planStart, plan_due_date: plan.planDue }, currentUser.id
    );
    const result = saved.ok ? store.setTenantStatus(tenantId, plan.status, currentUser.id) : saved;
    say(result, 'Plano e situação atualizados.');
  };

  const handleSaveFeatures = () =>
    say(store.updateTenantFeatures(tenantId, features, currentUser.id), 'Configurações da loja atualizadas.');

  const handleToggleUser = async (user: UserProfile) => {
    const success = `${user.full_name} ${user.is_active ? 'desativado' : 'reativado'}.`;
    if (store.isRealMode) {
      // O servidor bloqueia (ou libera) o login do usuário
      const remote = await adminApi.updateUser(user.id, { is_active: !user.is_active });
      if (!remote.ok) return say(remote, '');
    }
    say(store.setUserActive(user.id, !user.is_active, currentUser.id), success);
  };

  const closeReset = () => {
    setResetUser(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    const issue = passwordIssue(newPassword) || (newPassword !== confirmPassword ? 'As senhas não conferem.' : null);
    if (issue) {
      setPasswordError(issue);
      return;
    }
    if (store.isRealMode) {
      const remote = await adminApi.updateUser(resetUser.id, { password: newPassword });
      if (!remote.ok) {
        setPasswordError(remote.error);
        return;
      }
    }
    say(
      store.registerPasswordReset(resetUser.id, currentUser.id),
      store.isRealMode ? `Senha de ${resetUser.full_name} alterada.` : `Redefinição de senha de ${resetUser.full_name} registrada.`
    );
    closeReset();
  };

  // Exclusão definitiva: exige digitar o nome da loja
  const handleDeleteTenant = async () => {
    const typed = window.prompt(
      `Excluir a loja "${tenant.trade_name}" e todos os seus usuários? Esta ação não pode ser desfeita.\n\nPara confirmar, digite o nome da loja:`
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== tenant.trade_name.trim().toLowerCase()) {
      setNotice({ ok: false, text: 'O nome digitado não confere. A loja não foi excluída.' });
      return;
    }
    setDeleting(true);
    try {
      if (store.isRealMode) {
        const remote = await adminApi.deleteTenant(tenantId);
        if (!remote.ok) {
          setNotice({ ok: false, text: remote.error });
          return;
        }
      }
      const result = store.deleteTenant(tenantId, currentUser.id);
      if (!result.ok) {
        setNotice({ ok: false, text: result.error || 'Não foi possível excluir a loja.' });
        return;
      }
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  // Edição dos dados da empresa
  const startEditCompany = () => {
    setCompany({
      trade_name: tenant.trade_name, name: tenant.name, cnpj: tenant.cnpj || '',
      state_registration: tenant.state_registration || '', email: tenant.email, phone: tenant.phone,
      whatsapp: tenant.whatsapp || '', website: tenant.website || '',
      address_zipcode: tenant.address_zipcode || '', address_street: tenant.address_street || '',
      address_number: tenant.address_number || '', address_complement: tenant.address_complement || '',
      address_neighborhood: tenant.address_neighborhood || '', address_city: tenant.address_city || '',
      address_state: tenant.address_state || ''
    });
    setNotice(null);
  };

  const handleSaveCompany = () => {
    if (!company) return;
    if (!company.trade_name.trim() || !company.name.trim()) return setNotice({ ok: false, text: 'Informe o nome fantasia e a razão social.' });
    if (!isValidEmail(company.email.trim())) return setNotice({ ok: false, text: 'Informe um e-mail válido para a loja.' });
    if (!company.phone.trim()) return setNotice({ ok: false, text: 'Informe o telefone da loja.' });

    const opt = (v: string) => v.trim() || undefined;
    const result = store.updateTenantCompany(tenantId, {
      trade_name: company.trade_name.trim(), name: company.name.trim(), cnpj: opt(company.cnpj),
      state_registration: opt(company.state_registration), email: company.email.trim().toLowerCase(),
      phone: company.phone.trim(), whatsapp: opt(company.whatsapp), website: opt(company.website),
      address_zipcode: opt(company.address_zipcode), address_street: opt(company.address_street),
      address_number: opt(company.address_number), address_complement: opt(company.address_complement),
      address_neighborhood: opt(company.address_neighborhood), address_city: opt(company.address_city),
      address_state: opt(company.address_state)?.toUpperCase().slice(0, 2)
    }, currentUser.id);
    say(result, 'Dados da loja atualizados.');
    if (result.ok) {
      store.saveToStorage();
      setCompany(null);
    }
  };

  // ---- Documentos ----

  const slots: Partial<Record<TenantDocumentType, DocumentSlot>> = {};
  store.tenantDocuments.filter(d => d.tenant_id === tenantId).forEach(d => { slots[d.type] = d; });

  const handleSelectDocument = async (type: TenantDocumentType, file: File) => {
    const invalid = validateTemplateFile(file);
    if (invalid) throw new Error(invalid);
    const analysis = await analyzeTemplate(file);
    const storage_path = await saveTemplateFile(tenantId, type, file);
    const result = store.saveTenantDocument({
      id: store.getTenantDocument(tenantId, type)?.id || 'doc-' + Date.now(),
      tenant_id: tenantId,
      type,
      file_name: file.name,
      size: file.size,
      storage_path,
      ...analysis,
      uploaded_by: currentUser.id,
      uploaded_at: new Date().toISOString()
    }, currentUser.id);
    if (!result.ok) throw new Error(result.error);
    setNotice({ ok: true, text: 'Modelo atualizado. Os próximos documentos desta loja já usam o novo arquivo.' });
  };

  const handleRemoveDocument = async (type: TenantDocumentType) => {
    const doc = store.getTenantDocument(tenantId, type);
    if (!doc || !window.confirm(`Remover o modelo "${doc.file_name}"? O documento volta a ser gerado no layout padrão do sistema.`)) return;
    try {
      await deleteTemplateFile(doc);
      say(store.removeTenantDocument(tenantId, type, currentUser.id), 'Modelo removido.');
    } catch (err) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Não foi possível remover o modelo.' });
    }
  };

  const handleViewDocument = async (type: TenantDocumentType) => {
    const doc = store.getTenantDocument(tenantId, type);
    if (doc && !(await openTemplateFile(doc))) {
      setNotice({ ok: false, text: 'O arquivo deste modelo não foi encontrado neste navegador. Envie-o novamente.' });
    }
  };

  // ---- Abas ----

  const address = [
    [tenant.address_street, tenant.address_number].filter(Boolean).join(', '),
    tenant.address_complement,
    tenant.address_neighborhood,
    [tenant.address_city, tenant.address_state].filter(Boolean).join(' - '),
    tenant.address_zipcode && `CEP ${tenant.address_zipcode}`
  ].filter(Boolean).join(' · ');

  const renderOverview = () => (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Dados da empresa</h4>
          {!company && (
            <button type="button" onClick={startEditCompany} className={ghostBtn}>
              <Pencil className="w-3.5 h-3.5" /> Editar dados
            </button>
          )}
        </div>
        {company ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="Nome Fantasia" required value={company.trade_name} onChange={(v) => patchCompany({ trade_name: v })} />
              <TextField label="Razão Social" required value={company.name} onChange={(v) => patchCompany({ name: v })} />
              <TextField label="CNPJ" mono inputMode="numeric" value={company.cnpj} onChange={(v) => patchCompany({ cnpj: maskCNPJ(v) })} />
              <TextField label="Inscrição Estadual" optional mono value={company.state_registration} onChange={(v) => patchCompany({ state_registration: v })} maxLength={20} />
              <TextField label="Telefone Principal" required inputMode="tel" value={company.phone} onChange={(v) => patchCompany({ phone: maskPhone(v) })} />
              <TextField label="WhatsApp" optional inputMode="tel" value={company.whatsapp} onChange={(v) => patchCompany({ whatsapp: maskPhone(v) })} />
              <TextField label="E-mail" required value={company.email} onChange={(v) => patchCompany({ email: v })} />
              <TextField label="Site" optional value={company.website} onChange={(v) => patchCompany({ website: v })} />
              <TextField label="CEP" optional mono inputMode="numeric" value={company.address_zipcode} onChange={(v) => patchCompany({ address_zipcode: maskCEP(v) })} />
              <TextField label="Rua" optional value={company.address_street} onChange={(v) => patchCompany({ address_street: v })} />
              <TextField label="Número" optional value={company.address_number} onChange={(v) => patchCompany({ address_number: v })} />
              <TextField label="Complemento" optional value={company.address_complement} onChange={(v) => patchCompany({ address_complement: v })} />
              <TextField label="Bairro" optional value={company.address_neighborhood} onChange={(v) => patchCompany({ address_neighborhood: v })} />
              <TextField label="Cidade" optional value={company.address_city} onChange={(v) => patchCompany({ address_city: v })} />
              <TextField label="Estado (UF)" optional value={company.address_state} onChange={(v) => patchCompany({ address_state: v.toUpperCase().slice(0, 2) })} maxLength={2} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCompany(null)} className={ghostBtn}>Cancelar</button>
              <button type="button" onClick={handleSaveCompany} className="btn-tenant-primary px-4 py-2 rounded-xl font-bold text-xs">Salvar Dados</button>
            </div>
          </div>
        ) : (
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
          <Info label="Razão social" value={tenant.name} />
          <Info label="CNPJ" value={tenant.cnpj} mono />
          <Info label="Inscrição estadual" value={tenant.state_registration} mono />
          <Info label="Site" value={tenant.website} />
          <Info label="Telefone" value={tenant.phone} />
          <Info label="WhatsApp" value={tenant.whatsapp} />
          <div className="col-span-2"><Info label="E-mail" value={tenant.email} /></div>
          <div className="col-span-2 lg:col-span-4"><Info label="Endereço" value={address} /></div>
        </dl>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 p-5">
        <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-3">Assinatura e acesso</h4>
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
          <Info label="Plano contratado" value={planLabel(tenant.plan)} />
          <Info
            label="Situação da assinatura"
            value={
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status.badge}`}>{status.label}</span>
                {overdue && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700">Vencida</span>}
              </span>
            }
          />
          <Info label="Início" value={formatDateBR(tenant.plan_start_date)} />
          <Info label="Vencimento" value={formatDateBR(tenant.plan_due_date)} />
          <Info label="Data de criação" value={formatDateTimeBR(tenant.created_at)} />
          <Info label="Último acesso" value={lastAccess ? formatDateTimeBR(lastAccess) : 'Nenhum acesso registrado'} />
          <Info label="Administrador" value={admin?.full_name} />
          <Info label="E-mail do administrador" value={admin?.email} />
        </dl>
        {admin && (
          <button type="button" onClick={() => { changeTab('users'); setResetUser(admin); }} className={`${ghostBtn} mt-4`}>
            <KeyRound className="w-4 h-4 text-slate-400" />
            Redefinir senha do administrador
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 p-5">
        <Field label="Observações internas" hint="Visível apenas ao Super Administrador.">
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls()} font-medium leading-relaxed resize-y`} />
        </Field>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={handleSaveNotes} disabled={notes.trim() === (tenant.internal_notes || '')} className={primaryBtn}>
            Salvar observações
          </button>
        </div>
      </section>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-5">
      {resetUser && (
        <form onSubmit={handleResetPassword} className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600" />
              Redefinir senha de {resetUser.full_name}
            </h4>
            <button type="button" onClick={closeReset} aria-label="Cancelar redefinição" className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-600">Por segurança, a senha atual nunca é exibida. Defina uma nova senha de acesso.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PasswordField label="Nova senha" required placeholder="Mínimo de 8 caracteres" value={newPassword} onChange={setNewPassword} error={passwordError} />
            <PasswordField label="Confirmar nova senha" required placeholder="Repita a senha" value={confirmPassword} onChange={setConfirmPassword} />
          </div>
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={closeReset} className={ghostBtn}>Cancelar</button>
            <button type="submit" className={primaryBtn}>Confirmar nova senha</button>
          </div>
        </form>
      )}

      {ROLE_GROUPS.map(group => {
        const list = users.filter(u => u.role === group.role);
        return (
          <section key={group.role} className="rounded-2xl border border-slate-200 overflow-hidden">
            <h4 className="px-5 py-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-200">
              {group.title} ({list.length})
            </h4>
            {list.length === 0 ? (
              <p className="px-5 py-4 text-xs text-slate-500">{group.empty}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {list.map(u => (
                  <li key={u.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
                    <span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 font-extrabold flex items-center justify-center shrink-0">
                      {u.full_name.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-800 flex flex-wrap items-center gap-2">
                        {u.full_name}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {u.is_active ? 'Ativo' : 'Desativado'}
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-500 block truncate">
                        {u.email}{u.phone ? ` · ${u.phone}` : ''}
                      </span>
                      <span className="text-[11px] text-slate-400 block">
                        Último acesso: {u.last_access_at ? formatDateTimeBR(u.last_access_at) : 'nunca'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => { setResetUser(u); setPasswordError(''); }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Redefinir senha
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleUser(u)}
                        className={`px-2.5 py-1.5 rounded-lg font-semibold text-[11px] transition-colors ${
                          u.is_active ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {u.is_active ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );

  const renderBrand = () => (
    <div className="space-y-6">
      <TextField
        className="max-w-sm"
        label="Nome de exibição da loja"
        hint="Usado em comprovantes e documentos. Não altera a razão social."
        value={displayName}
        onChange={setDisplayName}
      />
      <BrandIdentityForm value={brand} onChange={(p) => setBrand(prev => ({ ...prev, ...p }))} displayName={displayName} />
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
        <button type="button" onClick={handleResetBrand} className={ghostBtn}>
          <RotateCcw className="w-4 h-4 text-slate-400" />
          Restaurar padrão
        </button>
        <button type="button" onClick={handleSaveBrand} className={primaryBtn}>
          <Check className="w-4 h-4" />
          Salvar identidade visual
        </button>
      </div>
    </div>
  );

  const renderPlan = () => (
    <div className="space-y-5">
      <PlanFields value={plan} onChange={(p) => setPlan(prev => ({ ...prev, ...p }))} errors={planErrors} />
      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button type="button" onClick={handleSavePlan} className={primaryBtn}>
          <Check className="w-4 h-4" />
          Salvar plano e situação
        </button>
      </div>
    </div>
  );

  const renderFeatures = () => (
    <div className="space-y-5">
      <FeatureChecklist value={features} onChange={setFeatures} />
      <div className="flex justify-end pt-4 border-t border-slate-100">
        <button type="button" onClick={handleSaveFeatures} className={primaryBtn}>
          <Check className="w-4 h-4" />
          Salvar configurações
        </button>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Gestão da loja ${tenant.trade_name}`}
        className="bg-white rounded-3xl w-full max-w-5xl h-[94vh] flex flex-col overflow-hidden select-text"
      >
        {/* CABEÇALHO: LOGO, NOME E SITUAÇÃO */}
        <header className="px-5 sm:px-7 pt-5 border-b border-slate-100 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <span className="w-24 h-14 rounded-2xl bg-slate-100 border border-slate-200 p-2 flex items-center justify-center shrink-0">
                {theme.logo_url ? (
                  <img src={theme.logo_url} alt={`Logo de ${tenant.trade_name}`} className="max-h-full max-w-full object-contain" />
                ) : (
                  <Building2 className="w-6 h-6 text-slate-400" />
                )}
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-slate-800 tracking-tight truncate">{tenant.trade_name}</h3>
                <p className="text-xs text-slate-500 font-medium truncate">{tenant.name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status.badge}`}>{status.label}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">{planLabel(tenant.plan)}</span>
                </div>
              </div>
            </div>
            <button onClick={onClose} aria-label="Fechar" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onStartSupport(tenant)} className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold text-[11px] inline-flex items-center gap-1.5 transition-colors">
              <ShieldAlert className="w-3.5 h-3.5" />
              Acessar para suporte
            </button>
            <button
              type="button"
              onClick={handleToggleStatus}
              className={`px-3 py-2 rounded-xl font-bold text-[11px] inline-flex items-center gap-1.5 transition-colors ${
                operational ? 'bg-rose-50 hover:bg-rose-100 text-rose-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
              }`}
            >
              {operational ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {operational ? 'Suspender loja' : 'Reativar loja'}
            </button>
            <button
              type="button"
              onClick={handleDeleteTenant}
              disabled={deleting}
              className="px-3 py-2 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-[11px] inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 sm:ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? 'Excluindo...' : 'Excluir loja'}
            </button>
          </div>

          <div role="tablist" className="mt-4 flex gap-1 overflow-x-auto -mb-px">
            {TABS.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => changeTab(t.id)}
                  className={`px-3.5 py-2.5 text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 border-b-2 transition-colors ${
                    active ? 'border-[#1845E8] text-[#1845E8]' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-6">
          {notice && (
            <p
              role="status"
              className={`mb-5 text-xs font-semibold rounded-xl px-3.5 py-2.5 border ${
                notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {notice.text}
            </p>
          )}

          {tab === 'overview' && renderOverview()}
          {tab === 'users' && renderUsers()}
          {tab === 'brand' && renderBrand()}
          {tab === 'documents' && (
            <TenantDocumentsForm slots={slots} onSelect={handleSelectDocument} onRemove={handleRemoveDocument} onView={(type) => void handleViewDocument(type)} />
          )}
          {tab === 'plan' && renderPlan()}
          {tab === 'features' && renderFeatures()}
        </div>
      </div>
    </div>
  );
};
