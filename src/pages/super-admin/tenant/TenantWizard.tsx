// ============================================================================
// CONTROLPHONE — ASSISTENTE "CADASTRAR NOVA LOJA" (EXCLUSIVO SUPER ADMIN)
// Dez etapas que deixam a loja pronta para uso: dados, endereço, identidade
// visual, documentos, administrador, equipe inicial, configurações, plano,
// observações e resumo. A loja só é criada no final, de uma vez só.
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle, Building2, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, CreditCard,
  FileText, Loader2, MapPin, Palette, Plus, ShieldCheck, SlidersHorizontal, StickyNote, Trash2, Users, X
} from 'lucide-react';
import { store, addDays, toLocalDay, TenantSetupPayload, TenantSetupResult, TenantSetupUser } from '../../../lib/store';
import { adminApi } from '../../../lib/adminApi';
import { refreshRealData } from '../../../lib/realSession';
import { useAuth } from '../../../context/AuthContext';
import { TenantDocument, TenantDocumentType, TenantFeatures } from '../../../types';
import {
  BRAZIL_STATES, DEFAULT_COLORS, DEFAULT_FEATURES, DOCUMENT_TYPES, FEATURE_OPTIONS, formatDateBR,
  isValidEmail, lookupCep, maskCEP, maskCNPJ, maskCPF, maskPhone, passwordIssue,
  planLabel, resolveThemeColors, statusMeta
} from '../../../lib/tenantSetup';
import { analyzeTemplate, deleteTemplateFile, saveTemplateFile, validateTemplateFile } from '../../../lib/tenantDocuments';
import { Field, FeatureChecklist, FormErrors, PasswordField, PlanDraft, PlanFields, TextField, inputCls } from './fields';
import { BrandDraft, BrandIdentityForm } from './BrandIdentityForm';
import { DocumentSlot, TenantDocumentsForm } from './TenantDocumentsForm';

type StepId = 'company' | 'address' | 'brand' | 'documents' | 'admin' | 'team' | 'features' | 'plan' | 'notes' | 'summary';

const STEPS: { id: StepId; label: string; description: string; icon: React.ElementType; optional?: boolean }[] = [
  { id: 'company', label: 'Dados da Loja', description: 'Identificação e contatos da empresa.', icon: Building2 },
  { id: 'address', label: 'Endereço', description: 'Informe o CEP para preencher o restante automaticamente.', icon: MapPin },
  { id: 'brand', label: 'Identidade Visual', description: 'Logos e cores aplicadas em todo o ambiente da loja.', icon: Palette },
  { id: 'documents', label: 'Documentos da Loja', description: 'Modelos em PDF usados para gerar os documentos desta loja.', icon: FileText },
  { id: 'admin', label: 'Administrador da Loja', description: 'Usuário criado com o perfil Administrador.', icon: ShieldCheck },
  { id: 'team', label: 'Usuários Iniciais', description: 'Vendedores e técnicos. Podem ser cadastrados depois.', icon: Users, optional: true },
  { id: 'features', label: 'Configurações da Loja', description: 'Recursos habilitados. Podem ser alterados depois.', icon: SlidersHorizontal },
  { id: 'plan', label: 'Plano da Loja', description: 'Plano contratado, vigência e situação da assinatura.', icon: CreditCard },
  { id: 'notes', label: 'Observações', description: 'Anotações internas, visíveis apenas ao Super Administrador.', icon: StickyNote, optional: true },
  { id: 'summary', label: 'Resumo', description: 'Confira tudo antes de criar a loja.', icon: ClipboardCheck }
];

interface TeamRow {
  key: string;
  full_name: string;
  email: string;
  password: string;
  phone: string;
}

interface WizardForm extends PlanDraft {
  trade_name: string;
  name: string;
  cnpj: string;
  state_registration: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
  zipcode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  brand: BrandDraft;
  docs: Partial<Record<TenantDocumentType, DocumentSlot & { file: File }>>;
  admin: { full_name: string; email: string; password: string; confirm: string; phone: string; cpf: string };
  sellers: TeamRow[];
  technicians: TeamRow[];
  features: TenantFeatures;
  notes: string;
}

const newId = (prefix: string) => prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
const newRow = (): TeamRow => ({ key: newId('row-'), full_name: '', email: '', password: '', phone: '' });

const initialForm = (): WizardForm => {
  const today = toLocalDay(new Date());
  return {
    trade_name: '', name: '', cnpj: '', state_registration: '', phone: '', whatsapp: '', email: '', website: '',
    zipcode: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '',
    brand: {
      primary_color: DEFAULT_COLORS.primary,
      secondary_color: DEFAULT_COLORS.secondary,
      accent_color: DEFAULT_COLORS.accent,
      action_button_color: DEFAULT_COLORS.accent
    },
    docs: {},
    admin: { full_name: '', email: '', password: '', confirm: '', phone: '', cpf: '' },
    sellers: [],
    technicians: [],
    features: { ...DEFAULT_FEATURES },
    plan: '',
    planStart: today,
    planDue: addDays(today, 30),
    status: 'active',
    notes: ''
  };
};

// ---- Validação ----
// Nenhuma etapa bloqueia o avanço. Ao criar a loja, só é exigido o indispensável
// para ela existir: o nome e as credenciais de quem vai acessá-la.

function validateStep(step: StepId, form: WizardForm): FormErrors {
  const e: FormErrors = {};
  const need = (key: string, value: string, message: string) => { if (!value.trim()) e[key] = message; };

  if (step === 'company') {
    need('trade_name', form.trade_name, 'Informe o nome fantasia.');
    need('name', form.name, 'Informe a razão social.');
  }

  // E-mails de acesso: únicos entre si e em toda a plataforma
  const accessEmails = [form.admin.email, ...form.sellers.map(r => r.email), ...form.technicians.map(r => r.email)]
    .map(v => v.trim().toLowerCase());
  const emailIssue = (email: string): string | null => {
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) return 'Informe um e-mail válido.';
    if (store.isEmailTaken(clean)) return 'Já existe um usuário com este e-mail.';
    if (accessEmails.filter(v => v === clean).length > 1) return 'E-mail repetido neste cadastro.';
    return null;
  };

  if (step === 'admin') {
    need('admin.full_name', form.admin.full_name, 'Informe o nome completo.');
    const mail = emailIssue(form.admin.email);
    if (mail) e['admin.email'] = mail;
    const pass = passwordIssue(form.admin.password);
    if (pass) e['admin.password'] = pass;
    if (form.admin.confirm !== form.admin.password) e['admin.confirm'] = 'As senhas não conferem.';
  }

  if (step === 'team') {
    (['sellers', 'technicians'] as const).forEach(group => {
      form[group].forEach(row => {
        const base = `${group}.${row.key}`;
        need(`${base}.full_name`, row.full_name, 'Informe o nome.');
        const mail = emailIssue(row.email);
        if (mail) e[`${base}.email`] = mail;
        const pass = passwordIssue(row.password);
        if (pass) e[`${base}.password`] = pass;
      });
    });
  }

  if (step === 'plan' && form.planStart && form.planDue && form.planDue < form.planStart) {
    e.planDue = 'O vencimento não pode ser anterior ao início.';
  }

  return e;
}

const SummaryBlock: React.FC<{ title: string; onEdit: () => void; children: React.ReactNode }> = ({ title, onEdit, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center justify-between gap-3 mb-2.5">
      <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{title}</h4>
      <button type="button" onClick={onEdit} className="text-[11px] font-bold text-blue-600 hover:underline">
        Editar
      </button>
    </div>
    <div className="text-xs text-slate-600 space-y-1">{children}</div>
  </section>
);

const Row: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4">
    <span className="text-slate-400 shrink-0">{label}</span>
    <span className="font-semibold text-slate-800 text-right min-w-0 break-words">{value || '—'}</span>
  </div>
);

// ---- Componente ----

interface TenantWizardProps {
  onClose: () => void;
  /** Abre a gestão da loja recém-criada */
  onOpenTenant: (tenantId: string) => void;
}

export const TenantWizard: React.FC<TenantWizardProps> = ({ onClose, onOpenTenant }) => {
  const { currentUser } = useAuth();
  // No modo real o id já nasce no formato do banco (os arquivos da loja usam esse id como pasta)
  const [tenantId] = useState(() => (store.isRealMode ? crypto.randomUUID() : newId('tenant-')));
  const [form, setFormState] = useState<WizardForm>(initialForm);
  const [stepIndex, setStepIndex] = useState(0);
  const [maxVisited, setMaxVisited] = useState(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'error'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [created, setCreated] = useState<TenantSetupResult | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const cepRequest = useRef(0);
  const step = STEPS[stepIndex];

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [stepIndex, created]);

  // Qualquer edição limpa os avisos da validação anterior
  const setForm = (updater: (prev: WizardForm) => WizardForm) => {
    setFormState(updater);
    setErrors(prev => (Object.keys(prev).length ? {} : prev));
  };

  const patch = (p: Partial<WizardForm>) => setForm(prev => ({ ...prev, ...p }));
  const patchAdmin = (p: Partial<WizardForm['admin']>) => setForm(prev => ({ ...prev, admin: { ...prev.admin, ...p } }));
  const patchBrand = (p: Partial<BrandDraft>) => setForm(prev => ({ ...prev, brand: { ...prev.brand, ...p } }));
  const patchRow = (group: 'sellers' | 'technicians', key: string, p: Partial<TeamRow>) =>
    setForm(prev => ({ ...prev, [group]: prev[group].map(r => (r.key === key ? { ...r, ...p } : r)) }));

  const isDirty = Boolean(form.trade_name || form.name || form.cnpj || form.email || form.admin.email);

  const requestClose = () => {
    if (submitting) return;
    if (!created && isDirty && !window.confirm('Sair do cadastro? Os dados preenchidos serão perdidos.')) return;
    onClose();
  };

  const goTo = (index: number) => {
    setErrors({});
    setSubmitError('');
    setStepIndex(index);
    setMaxVisited(v => Math.max(v, index));
  };

  const handleNext = () => goTo(stepIndex + 1);

  // CEP: ao completar 8 dígitos, busca o endereço e preenche o que vier
  const handleCepChange = async (raw: string) => {
    const masked = maskCEP(raw);
    patch({ zipcode: masked });
    const clean = masked.replace(/\D/g, '');
    const requestId = ++cepRequest.current;
    if (clean.length !== 8) {
      setCepStatus('idle');
      return;
    }
    setCepStatus('loading');
    try {
      const address = await lookupCep(clean);
      if (requestId !== cepRequest.current) return;
      if (!address) {
        setCepStatus('not_found');
        return;
      }
      setForm(prev => ({
        ...prev,
        street: address.street || prev.street,
        neighborhood: address.neighborhood || prev.neighborhood,
        city: address.city || prev.city,
        state: address.state || prev.state
      }));
      setCepStatus('found');
    } catch {
      if (requestId === cepRequest.current) setCepStatus('error');
    }
  };

  const handleSelectDocument = async (type: TenantDocumentType, file: File) => {
    const invalid = validateTemplateFile(file);
    if (invalid) throw new Error(invalid);
    const analysis = await analyzeTemplate(file);
    setForm(prev => ({
      ...prev,
      docs: { ...prev.docs, [type]: { file, file_name: file.name, size: file.size, ...analysis } }
    }));
  };

  const handleRemoveDocument = (type: TenantDocumentType) =>
    setForm(prev => {
      const docs = { ...prev.docs };
      delete docs[type];
      return { ...prev, docs };
    });

  const handleCreate = async () => {
    // Revalida tudo: uma etapa anterior pode ter ficado inválida (ex.: e-mail repetido adicionado depois)
    const invalidIndex = STEPS.findIndex(s => Object.keys(validateStep(s.id, form)).length > 0);
    if (invalidIndex >= 0) {
      setStepIndex(invalidIndex);
      setErrors(validateStep(STEPS[invalidIndex].id, form));
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    const savedDocs: TenantDocument[] = [];
    try {
      // 1. Arquivos dos modelos (pasta exclusiva do tenant)
      for (const def of DOCUMENT_TYPES) {
        const entry = form.docs[def.type];
        if (!entry) continue;
        const storage_path = await saveTemplateFile(tenantId, def.type, entry.file);
        savedDocs.push({
          id: newId('doc-'),
          tenant_id: tenantId,
          type: def.type,
          file_name: entry.file_name,
          size: entry.size,
          storage_path,
          fields_total: entry.fields_total,
          fields_matched: entry.fields_matched,
          uploaded_by: currentUser.id,
          uploaded_at: new Date().toISOString()
        });
      }

      // 2. Loja, identidade visual, usuários, configurações e plano em uma única operação
      const toUser = (r: TeamRow): TenantSetupUser => ({ full_name: r.full_name, email: r.email, phone: r.phone, password: r.password });
      const payload: TenantSetupPayload = {
        tenantId,
        company: {
          name: form.name, trade_name: form.trade_name, cnpj: form.cnpj, state_registration: form.state_registration,
          email: form.email, phone: form.phone, whatsapp: form.whatsapp, website: form.website,
          address_zipcode: form.zipcode, address_street: form.street, address_number: form.number,
          address_complement: form.complement, address_neighborhood: form.neighborhood,
          address_city: form.city, address_state: form.state
        },
        theme: {
          ...form.brand,
          display_name: form.trade_name.trim(),
          theme_mode: 'light',
          dashboard_style: 'reference',
          pdf_header_style: 'standard'
        },
        admin: {
          full_name: form.admin.full_name, email: form.admin.email, phone: form.admin.phone,
          cpf: form.admin.cpf, password: form.admin.password
        },
        sellers: form.sellers.map(toUser),
        technicians: form.technicians.map(toUser),
        features: form.features,
        plan: form.plan || undefined,
        planStartDate: form.planStart || undefined,
        planDueDate: form.planDue || undefined,
        status: form.status,
        notes: form.notes,
        documents: savedDocs
      };

      if (store.isRealMode) {
        // Servidor cria a loja, os logins e as senhas; depois a tela relê tudo do banco
        const remote = await adminApi.createTenant(payload);
        if (!remote.ok) throw new Error(remote.error);
        await refreshRealData();
        const tenant = store.tenants.find(t => t.id === remote.tenantId);
        const admin = store.profiles.find(p => p.id === remote.adminId);
        if (!tenant || !admin) {
          setSubmitError('A loja foi criada, mas não foi possível recarregar os dados. Atualize a página.');
          return;
        }
        setCreated({ tenant, admin, sellers: remote.sellers, technicians: remote.technicians });
        return;
      }

      const result = store.createTenantWithSetup(payload, currentUser.id);
      if (!result.ok || !result.data) throw new Error(result.error || 'Não foi possível criar a loja.');
      setCreated(result.data);
    } catch (err) {
      // Nada fica pela metade: os arquivos já enviados são removidos
      await Promise.all(savedDocs.map(d => deleteTemplateFile(d).catch(() => undefined)));
      setSubmitError(err instanceof Error ? err.message : 'Não foi possível criar a loja.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Etapas ----

  const renderCompany = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TextField label="Nome Fantasia" required placeholder="Ex: iTech Concept" value={form.trade_name} onChange={(v) => patch({ trade_name: v })} error={errors.trade_name} />
      <TextField label="Razão Social" required placeholder="Ex: iTech Comércio LTDA" value={form.name} onChange={(v) => patch({ name: v })} error={errors.name} />
      <TextField label="CNPJ" mono inputMode="numeric" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(v) => patch({ cnpj: maskCNPJ(v) })} error={errors.cnpj} />
      <TextField label="Inscrição Estadual" optional mono placeholder="Isento ou número" value={form.state_registration} onChange={(v) => patch({ state_registration: v })} maxLength={20} />
      <TextField label="Telefone Principal" inputMode="tel" placeholder="(11) 3333-4444" value={form.phone} onChange={(v) => patch({ phone: maskPhone(v) })} error={errors.phone} />
      <TextField label="WhatsApp" inputMode="tel" placeholder="(11) 99999-9999" value={form.whatsapp} onChange={(v) => patch({ whatsapp: maskPhone(v) })} error={errors.whatsapp} />
      <TextField label="E-mail da Loja" type="email" placeholder="contato@loja.com.br" value={form.email} onChange={(v) => patch({ email: v })} error={errors.email} />
      <TextField label="Site" optional placeholder="www.loja.com.br" value={form.website} onChange={(v) => patch({ website: v })} />
    </div>
  );

  const cepHint = {
    idle: 'Os demais campos são preenchidos automaticamente.',
    loading: 'Buscando endereço...',
    found: 'Endereço preenchido. Confira e informe o número.',
    not_found: 'CEP não encontrado. Preencha o endereço manualmente.',
    error: 'Não foi possível consultar o CEP agora. Preencha o endereço manualmente.'
  }[cepStatus];

  const renderAddress = () => (
    <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
      <TextField
        className="sm:col-span-2"
        label="CEP" mono inputMode="numeric" placeholder="00000-000"
        value={form.zipcode} onChange={(v) => void handleCepChange(v)} error={errors.zipcode} hint={cepHint}
        trailing={
          cepStatus === 'loading' ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            : cepStatus === 'found' ? <Check className="w-4 h-4 text-emerald-600" />
            : undefined
        }
      />
      <TextField className="sm:col-span-4" label="Rua" placeholder="Avenida Paulista" value={form.street} onChange={(v) => patch({ street: v })} error={errors.street} />
      <TextField className="sm:col-span-2" label="Número" placeholder="1578" value={form.number} onChange={(v) => patch({ number: v })} error={errors.number} maxLength={10} />
      <TextField className="sm:col-span-4" label="Complemento" optional placeholder="Loja 12, Piso Térreo" value={form.complement} onChange={(v) => patch({ complement: v })} />
      <TextField className="sm:col-span-2" label="Bairro" placeholder="Bela Vista" value={form.neighborhood} onChange={(v) => patch({ neighborhood: v })} error={errors.neighborhood} />
      <TextField className="sm:col-span-3" label="Cidade" placeholder="São Paulo" value={form.city} onChange={(v) => patch({ city: v })} error={errors.city} />
      <Field className="sm:col-span-1" label="Estado" error={errors.state}>
        <select value={form.state} onChange={(e) => patch({ state: e.target.value })} className={inputCls(errors.state)}>
          <option value="">UF</option>
          {BRAZIL_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </Field>
    </div>
  );

  const renderAdmin = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TextField className="sm:col-span-2" label="Nome completo" required placeholder="Nome e sobrenome" value={form.admin.full_name} onChange={(v) => patchAdmin({ full_name: v })} error={errors['admin.full_name']} />
      <TextField label="E-mail" required type="email" placeholder="admin@loja.com.br" hint="Usado para entrar no sistema." value={form.admin.email} onChange={(v) => patchAdmin({ email: v })} error={errors['admin.email']} />
      <TextField label="Telefone" inputMode="tel" placeholder="(11) 99999-9999" value={form.admin.phone} onChange={(v) => patchAdmin({ phone: maskPhone(v) })} error={errors['admin.phone']} />
      <PasswordField label="Senha" required placeholder="Mínimo de 8 caracteres" hint="Letras e números, ao menos 8 caracteres." value={form.admin.password} onChange={(v) => patchAdmin({ password: v })} error={errors['admin.password']} />
      <PasswordField label="Confirmar senha" required placeholder="Repita a senha" value={form.admin.confirm} onChange={(v) => patchAdmin({ confirm: v })} error={errors['admin.confirm']} />
      <TextField label="CPF" optional mono inputMode="numeric" placeholder="000.000.000-00" value={form.admin.cpf} onChange={(v) => patchAdmin({ cpf: maskCPF(v) })} error={errors['admin.cpf']} />
      <div className="sm:col-span-2 flex items-start gap-2.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>Este usuário recebe automaticamente o perfil <strong className="text-slate-800">Administrador</strong>, com acesso completo ao ambiente desta loja e a nenhuma outra.</span>
      </div>
    </div>
  );

  const renderTeamGroup = (group: 'sellers' | 'technicians', title: string, singular: string) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-extrabold text-slate-800">
          {title} <span className="text-slate-400 font-bold">({form[group].length})</span>
        </h4>
        <button
          type="button"
          onClick={() => patch({ [group]: [...form[group], newRow()] } as Partial<WizardForm>)}
          className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 inline-flex items-center gap-1.5 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Adicionar {singular}
        </button>
      </div>

      {form[group].length === 0 ? (
        <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-xl px-4 py-5 text-center">
          Nenhum {singular.toLowerCase()} adicionado. O administrador da loja poderá cadastrá-los depois em Equipe da Loja.
        </p>
      ) : (
        form[group].map((row, i) => {
          const base = `${group}.${row.key}`;
          return (
            <div key={row.key} className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{singular} {i + 1}</span>
                <button
                  type="button"
                  onClick={() => patch({ [group]: form[group].filter(r => r.key !== row.key) } as Partial<WizardForm>)}
                  aria-label={`Remover ${singular.toLowerCase()} ${i + 1}`}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField label="Nome" required placeholder="Nome completo" value={row.full_name} onChange={(v) => patchRow(group, row.key, { full_name: v })} error={errors[`${base}.full_name`]} />
                <TextField label="E-mail" required type="email" placeholder="usuario@loja.com.br" value={row.email} onChange={(v) => patchRow(group, row.key, { email: v })} error={errors[`${base}.email`]} />
                <PasswordField label="Senha" required placeholder="Mínimo de 8 caracteres" value={row.password} onChange={(v) => patchRow(group, row.key, { password: v })} error={errors[`${base}.password`]} />
                <TextField label="Telefone" inputMode="tel" placeholder="(11) 99999-9999" value={row.phone} onChange={(v) => patchRow(group, row.key, { phone: maskPhone(v) })} error={errors[`${base}.phone`]} />
              </div>
            </div>
          );
        })
      )}
    </section>
  );

  const colors = resolveThemeColors(form.brand);
  const enabledFeatures = FEATURE_OPTIONS.filter(f => form.features[f.key]);
  const sentDocs = DOCUMENT_TYPES.filter(d => form.docs[d.type]);

  const editStep = (target: StepId) => goTo(STEPS.findIndex(st => st.id === target));

  const renderSummary = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <SummaryBlock title="Dados da loja" onEdit={() => editStep('company')}>
        <Row label="Nome fantasia" value={form.trade_name} />
        <Row label="Razão social" value={form.name} />
        <Row label="CNPJ" value={<span className="font-mono">{form.cnpj}</span>} />
        <Row label="Inscrição estadual" value={form.state_registration} />
        <Row label="Telefone" value={form.phone} />
        <Row label="WhatsApp" value={form.whatsapp} />
        <Row label="E-mail" value={form.email} />
        <Row label="Site" value={form.website} />
      </SummaryBlock>

      <SummaryBlock title="Endereço" onEdit={() => editStep('address')}>
        <Row label="Logradouro" value={[form.street, form.number].filter(Boolean).join(', ')} />
        <Row label="Complemento" value={form.complement} />
        <Row label="Bairro" value={form.neighborhood} />
        <Row label="Cidade" value={[form.city, form.state].filter(Boolean).join(' - ')} />
        <Row label="CEP" value={<span className="font-mono">{form.zipcode}</span>} />
      </SummaryBlock>

      <SummaryBlock title="Administrador criado" onEdit={() => editStep('admin')}>
        <Row label="Nome" value={form.admin.full_name} />
        <Row label="E-mail" value={form.admin.email} />
        <Row label="Telefone" value={form.admin.phone} />
        <Row label="Perfil" value="Administrador" />
      </SummaryBlock>

      <SummaryBlock title="Usuários iniciais" onEdit={() => editStep('team')}>
        <Row label="Vendedores" value={String(form.sellers.length)} />
        <Row label="Técnicos" value={String(form.technicians.length)} />
        {form.sellers.length + form.technicians.length === 0 && (
          <p className="text-slate-400 pt-1">Nenhum usuário além do administrador. Podem ser cadastrados depois.</p>
        )}
      </SummaryBlock>

      <SummaryBlock title="Plano escolhido" onEdit={() => editStep('plan')}>
        <Row label="Plano" value={form.plan ? planLabel(form.plan) : ''} />
        <Row label="Início" value={formatDateBR(form.planStart)} />
        <Row label="Vencimento" value={formatDateBR(form.planDue)} />
        <Row label="Status" value={statusMeta(form.status).label} />
      </SummaryBlock>

      <SummaryBlock title="Identidade visual" onEdit={() => editStep('brand')}>
        <div className="flex items-center gap-3">
          <span className="w-20 h-12 rounded-lg bg-slate-100 border border-slate-200 p-1.5 flex items-center justify-center shrink-0">
            {form.brand.logo_url
              ? <img src={form.brand.logo_url} alt="Logo principal" className="max-h-full max-w-full object-contain" />
              : <span className="text-[10px] text-slate-400 text-center leading-tight">Sem logo</span>}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {([['Principal', colors.primary], ['Secundária', colors.secondary], ['Botões', colors.button],
              ['Sidebar', colors.sidebar], ['Cards', colors.card], ['Ação', colors.action]] as const).map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-600">
                <span className="w-3 h-3 rounded-full border border-slate-200" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
        </div>
        {!form.brand.logo_url && <p className="text-slate-400 pt-1.5">Sem logo principal, a loja exibe a inicial do nome fantasia.</p>}
      </SummaryBlock>

      <SummaryBlock title={`Configurações ativadas (${enabledFeatures.length} de ${FEATURE_OPTIONS.length})`} onEdit={() => editStep('features')}>
        {enabledFeatures.length === 0 ? <p className="text-slate-400">Nenhum recurso ativado.</p> : (
          <ul className="space-y-1">
            {enabledFeatures.map(f => (
              <li key={f.key} className="flex items-center gap-2 font-semibold text-slate-700">
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                {f.label}
              </li>
            ))}
          </ul>
        )}
      </SummaryBlock>

      <SummaryBlock title={`Documentos enviados (${sentDocs.length})`} onEdit={() => editStep('documents')}>
        {sentDocs.length === 0 ? <p className="text-slate-400">Nenhum documento enviado.</p> : (
          <ul className="space-y-1.5">
            {sentDocs.map(d => (
              <li key={d.type} className="flex items-start gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="font-semibold text-slate-700 block">{d.label}</span>
                  <span className="text-[11px] text-slate-400 block truncate">{form.docs[d.type]?.file_name}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SummaryBlock>

      {form.notes.trim() && (
        <div className="lg:col-span-2">
          <SummaryBlock title="Observações internas" onEdit={() => editStep('notes')}>
            <p className="whitespace-pre-wrap text-slate-700">{form.notes.trim()}</p>
          </SummaryBlock>
        </div>
      )}
    </div>
  );

  const renderStep = () => {
    switch (step.id) {
      case 'company': return renderCompany();
      case 'address': return renderAddress();
      case 'brand': return <BrandIdentityForm value={form.brand} onChange={patchBrand} displayName={form.trade_name} />;
      case 'documents':
        return <TenantDocumentsForm allOptional slots={form.docs} onSelect={handleSelectDocument} onRemove={handleRemoveDocument} errors={errors} />;
      case 'admin': return renderAdmin();
      case 'team':
        return (
          <div className="space-y-7">
            {renderTeamGroup('sellers', 'Vendedores', 'Vendedor')}
            {renderTeamGroup('technicians', 'Técnicos', 'Técnico')}
          </div>
        );
      case 'features': return <FeatureChecklist value={form.features} onChange={(features) => patch({ features })} />;
      case 'plan': return <PlanFields optional value={form} onChange={patch} errors={errors} />;
      case 'notes':
        return (
          <Field label="Anotações internas" optional hint="Visível apenas ao Super Administrador. Nunca é exibido à loja.">
            <textarea
              rows={9}
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Ex: condições comerciais negociadas, contato do responsável, pendências de implantação..."
              className={`${inputCls()} font-medium leading-relaxed resize-y`}
            />
          </Field>
        );
      case 'summary': return renderSummary();
    }
  };

  // ---- Tela final ----

  const renderCreated = (result: TenantSetupResult) => {
    const done = [
      'Tenant e loja criados com dados isolados',
      `Administrador ${result.admin.full_name} criado com o perfil Administrador`,
      result.sellers + result.technicians > 0
        ? `${result.sellers} vendedor(es) e ${result.technicians} técnico(s) criados com seus perfis de acesso`
        : 'Perfis de acesso de vendedor e técnico prontos para novos usuários',
      'Identidade visual aplicada ao ambiente da loja',
      `${sentDocs.length} modelo(s) de documento vinculados à loja`,
      result.tenant.plan
        ? `Plano ${planLabel(result.tenant.plan)} configurado (${statusMeta(result.tenant.status).label})`
        : `Situação definida como ${statusMeta(result.tenant.status).label}; plano a definir na gestão da loja`,
      `${enabledFeatures.length} recurso(s) habilitados nas configurações`
    ];
    return (
      <div className="max-w-xl mx-auto py-6 text-center">
        <span className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7" />
        </span>
        <h3 className="mt-4 text-lg font-extrabold text-slate-800 tracking-tight">{result.tenant.trade_name} está pronta para uso</h3>
        <p className="mt-1 text-xs text-slate-500">
          O administrador já pode entrar com o e-mail <strong className="text-slate-700">{result.admin.email}</strong>.
        </p>
        <ul className="mt-6 text-left space-y-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
          {done.map(item => (
            <li key={item} className="flex items-start gap-2.5 text-xs font-semibold text-slate-700">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button type="button" onClick={onClose} className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-100 text-xs transition-colors">
            Concluir
          </button>
          <button
            type="button"
            onClick={() => onOpenTenant(result.tenant.id)}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#1845E8] hover:bg-blue-700 text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 transition-all active:scale-95"
          >
            Abrir gestão da loja
          </button>
        </div>
      </div>
    );
  };

  const isLast = stepIndex === STEPS.length - 1;
  const StepIcon = step.icon;

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cadastrar Nova Loja"
        className="bg-white rounded-3xl w-full max-w-6xl h-[94vh] flex flex-col overflow-hidden select-text"
      >
        {/* CABEÇALHO */}
        <header className="flex items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-800 tracking-tight truncate">Cadastrar Nova Loja</h3>
              <p className="text-xs text-slate-500 font-medium truncate">
                {form.trade_name.trim() || 'Assistente de criação completa da loja'}
              </p>
            </div>
          </div>
          <button onClick={requestClose} aria-label="Fechar" className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </header>

        {created ? (
          <div ref={contentRef} className="flex-1 overflow-y-auto px-5 sm:px-7 py-6">{renderCreated(created)}</div>
        ) : (
          <>
            {/* PROGRESSO (TELAS PEQUENAS) */}
            <div className="lg:hidden px-5 py-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-slate-800">{step.label}</span>
                <span className="font-semibold text-slate-400">Etapa {stepIndex + 1} de {STEPS.length}</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-[#1845E8] transition-all duration-300" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
              </div>
            </div>

            <div className="flex-1 flex min-h-0">
              {/* ETAPAS (TELAS GRANDES) */}
              <nav aria-label="Etapas do cadastro" className="hidden lg:block w-64 shrink-0 border-r border-slate-100 bg-slate-50/70 p-4 overflow-y-auto">
                <ol className="space-y-1">
                  {STEPS.map((s, i) => {
                    const current = i === stepIndex;
                    const completed = i < maxVisited && !current;
                    const reachable = true;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          disabled={!reachable || submitting}
                          onClick={() => goTo(i)}
                          aria-current={current ? 'step' : undefined}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs transition-colors ${
                            current ? 'bg-white shadow-sm border border-slate-200' : reachable ? 'hover:bg-white/70' : 'opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                              current ? 'bg-[#1845E8] text-white' : completed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                            }`}
                          >
                            {completed ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                          </span>
                          <span className="min-w-0">
                            <span className={`block truncate ${current ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-600'}`}>{s.label}</span>
                            {s.optional && <span className="block text-[10px] text-slate-400">Opcional</span>}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>

              {/* CONTEÚDO DA ETAPA */}
              <div ref={contentRef} className="flex-1 min-w-0 overflow-y-auto px-5 sm:px-7 py-6">
                <div className="flex items-start gap-3 mb-6">
                  <span className="hidden sm:flex w-9 h-9 rounded-xl bg-slate-100 text-slate-600 items-center justify-center shrink-0">
                    <StepIcon className="w-4 h-4" />
                  </span>
                  <div>
                    <h4 className="text-lg font-extrabold text-slate-800 tracking-tight leading-tight">
                      {step.label}
                      {step.optional && <span className="ml-2 text-xs font-semibold text-slate-400">Opcional</span>}
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                  </div>
                </div>

                {renderStep()}
              </div>
            </div>

            {/* RODAPÉ */}
            <footer className="px-5 sm:px-7 py-4 border-t border-slate-100 shrink-0">
              {(submitError || Object.values(errors).some(Boolean)) && (
                <p role="alert" className="mb-3 flex items-start gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {submitError || 'Revise os campos destacados para continuar.'}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={requestClose} disabled={submitting} className="px-4 py-2.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl text-xs disabled:opacity-50">
                  Cancelar
                </button>
                <div className="flex items-center gap-2.5">
                  {stepIndex > 0 && (
                    <button
                      type="button"
                      onClick={() => goTo(stepIndex - 1)}
                      disabled={submitting}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-100 text-xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Voltar
                    </button>
                  )}
                  {isLast ? (
                    <button
                      type="button"
                      onClick={() => void handleCreate()}
                      disabled={submitting}
                      className="px-6 py-2.5 rounded-xl bg-[#1845E8] hover:bg-blue-700 text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 inline-flex items-center gap-2 transition-all active:scale-95 disabled:opacity-70"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {submitting ? 'Criando loja...' : 'Criar Loja'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="px-6 py-2.5 rounded-xl bg-[#1845E8] hover:bg-blue-700 text-white font-extrabold text-xs shadow-lg shadow-blue-600/30 inline-flex items-center gap-2 transition-all active:scale-95"
                    >
                      Avançar
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
};
