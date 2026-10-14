// ============================================================================
// CONTROLPHONE — FUNÇÃO DE ADMINISTRAÇÃO (SUPABASE EDGE FUNCTION)
//
// É o único ponto do sistema que usa a chave de serviço (service role), e por
// isso roda no servidor, nunca no navegador. Cuida de tudo o que envolve
// contas de acesso:
//   - instalação: criação do único Super Administrador;
//   - lojas: criação completa (loja + administrador + equipe) e exclusão;
//   - usuários: criação, edição, ativação, desativação e troca de senha.
//
// Quem pode o quê:
//   - Super Admin: tudo, em qualquer loja.
//   - Administrador da loja: cria e gerencia vendedores e técnicos da própria loja.
//   - Demais perfis: nada.
//
// Erros de regra voltam com HTTP 200 e { ok: false, error } para a tela exibir.
// Segredo necessário: CONTROLPHONE_SETUP_KEY (código de instalação).
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SETUP_KEY = Deno.env.get('CONTROLPHONE_SETUP_KEY') ?? '';

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type Json = Record<string, unknown>;
type Role = 'super_admin' | 'admin' | 'seller' | 'technician';

interface Caller {
  id: string;
  role: Role;
  tenant_id: string | null;
}

interface NewUser {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  cpf?: string;
}

class Refusal extends Error {}
const refuse = (message: string): never => {
  throw new Refusal(message);
};

const reply = (body: Json) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const optional = (v: unknown) => text(v) || null;
const emailOf = (v: unknown) => text(v).toLowerCase();
const digits = (v: unknown) => text(v).replace(/\D/g, '');
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function checkPassword(password: unknown): string {
  const value = typeof password === 'string' ? password : '';
  if (value.length < 8) refuse('A senha deve ter pelo menos 8 caracteres.');
  if (!/[a-zA-Z]/.test(value) || !/\d/.test(value)) refuse('A senha deve combinar letras e números.');
  return value;
}

function readNewUser(raw: unknown): NewUser {
  const u = (raw || {}) as Json;
  const user: NewUser = {
    full_name: text(u.full_name),
    email: emailOf(u.email),
    password: checkPassword(u.password),
    phone: optional(u.phone) ?? undefined,
    cpf: optional(u.cpf) ?? undefined
  };
  if (!user.full_name) refuse('Informe o nome do usuário.');
  if (!isEmail(user.email)) refuse(`O e-mail "${user.email}" não é válido.`);
  return user;
}

// Tempo de bloqueio usado pelo Supabase Auth para impedir o login de um usuário desativado
const BAN_FOREVER = '876000h';

async function getCaller(req: Request): Promise<Caller> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) refuse('Sessão expirada. Entre novamente.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) refuse('Sessão expirada. Entre novamente.');

  const { data: profile } = await db
    .from('profiles')
    .select('id, role, tenant_id, is_active')
    .eq('id', data.user!.id)
    .maybeSingle();
  if (!profile || profile.is_active === false) refuse('Usuário sem permissão.');
  return { id: profile!.id, role: profile!.role as Role, tenant_id: profile!.tenant_id };
}

/** Cria o login (Supabase Auth) e o perfil ligado à loja. Desfaz o login se o perfil falhar. */
async function createAccount(user: NewUser, role: Role, tenantId: string | null): Promise<Json> {
  const { data: taken } = await db.from('profiles').select('id').eq('email', user.email).maybeSingle();
  if (taken) refuse(`Já existe um usuário com o e-mail ${user.email}.`);

  const { data, error } = await db.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.full_name }
  });
  if (error || !data.user) {
    const message = (error?.message || '').toLowerCase();
    if (message.includes('already') || message.includes('registered') || message.includes('exists')) {
      refuse(`Já existe um usuário com o e-mail ${user.email}.`);
    }
    refuse(`Não foi possível criar o login de ${user.email}.`);
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .insert({
      id: data.user!.id,
      tenant_id: tenantId,
      role,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone ?? null,
      cpf: user.cpf ?? null,
      is_active: true
    })
    .select('*')
    .single();
  if (profileError || !profile) {
    await db.auth.admin.deleteUser(data.user!.id);
    refuse(`Não foi possível criar o perfil de ${user.email}.`);
  }
  return profile as Json;
}

async function removeAccounts(userIds: string[]) {
  for (const id of userIds) {
    await db.from('profiles').delete().eq('id', id);
    await db.auth.admin.deleteUser(id);
  }
}

async function countSuperAdmins(): Promise<number> {
  const { count, error } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'super_admin');
  if (error) refuse('Não foi possível consultar a instalação.');
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// AÇÕES
// ---------------------------------------------------------------------------

/** Primeira execução: informa se o Super Administrador ainda precisa ser criado. */
async function setupStatus(): Promise<Json> {
  return { needsSetup: (await countSuperAdmins()) === 0 };
}

/** Cria o único Super Administrador. Só funciona enquanto não existir nenhum. */
async function bootstrap(body: Json): Promise<Json> {
  if (!SETUP_KEY) refuse('O código de instalação ainda não foi definido no servidor (CONTROLPHONE_SETUP_KEY).');
  if (text(body.setupKey) !== SETUP_KEY) refuse('Código de instalação incorreto.');
  if ((await countSuperAdmins()) > 0) refuse('O sistema já foi instalado. Entre com a conta do Super Administrador.');

  const user = readNewUser(body.user);
  const profile = await createAccount(user, 'super_admin', null);

  // Duas instalações simultâneas: mantém somente o perfil mais antigo
  const { data: all } = await db.from('profiles').select('id').eq('role', 'super_admin').order('created_at').order('id');
  if (all && all.length > 1 && all[0].id !== profile.id) {
    await removeAccounts([String(profile.id)]);
    refuse('O sistema já foi instalado. Entre com a conta do Super Administrador.');
  }
  return { profile };
}

async function createTenant(caller: Caller, body: Json): Promise<Json> {
  if (caller.role !== 'super_admin') refuse('Apenas o Super Administrador pode criar lojas.');

  const company = (body.company || {}) as Json;
  const theme = (body.theme || {}) as Json;
  const features = (body.features || {}) as Json;
  const tenantId = isUuid(body.tenantId) ? String(body.tenantId) : crypto.randomUUID();

  const tradeName = text(company.trade_name);
  const legalName = text(company.name);
  if (!tradeName || !legalName) refuse('Informe o nome fantasia e a razão social.');
  if (!isEmail(emailOf(company.email))) refuse('Informe um e-mail válido para a loja.');
  if (!text(company.phone)) refuse('Informe o telefone da loja.');

  const admin = readNewUser(body.admin);
  const sellers = (Array.isArray(body.sellers) ? body.sellers : []).map(readNewUser);
  const technicians = (Array.isArray(body.technicians) ? body.technicians : []).map(readNewUser);
  const everyone = [admin, ...sellers, ...technicians];

  const emails = everyone.map(u => u.email);
  const repeated = emails.find((e, i) => emails.indexOf(e) !== i);
  if (repeated) refuse(`O e-mail ${repeated} foi informado para mais de um usuário.`);
  const { data: takenEmails } = await db.from('profiles').select('email').in('email', emails);
  if (takenEmails && takenEmails.length) refuse(`Já existe um usuário com o e-mail ${takenEmails[0].email}.`);

  const cnpj = digits(company.cnpj);
  if (cnpj) {
    const { data: stores } = await db.from('tenants').select('id, cnpj').not('cnpj', 'is', null);
    if ((stores || []).some(s => digits(s.cnpj) === cnpj)) refuse('Já existe uma loja cadastrada com este CNPJ.');
  }

  const planStart = optional(body.planStartDate);
  const planDue = optional(body.planDueDate);
  if (planStart && planDue && planDue < planStart) refuse('A data de vencimento não pode ser anterior à data de início.');

  const { error: tenantError } = await db.from('tenants').insert({
    id: tenantId,
    name: legalName,
    trade_name: tradeName,
    cnpj: optional(company.cnpj),
    state_registration: optional(company.state_registration),
    email: emailOf(company.email),
    phone: text(company.phone),
    whatsapp: optional(company.whatsapp),
    website: optional(company.website),
    address_zipcode: optional(company.address_zipcode),
    address_street: optional(company.address_street),
    address_number: optional(company.address_number),
    address_complement: optional(company.address_complement),
    address_neighborhood: optional(company.address_neighborhood),
    address_city: optional(company.address_city),
    address_state: optional(company.address_state)?.toUpperCase().slice(0, 2) ?? null,
    status: text(body.status) || 'active',
    plan: optional(body.plan),
    plan_start_date: planStart,
    plan_due_date: planDue
  });
  if (tenantError) refuse('Não foi possível criar a loja: ' + tenantError.message);

  // Daqui em diante, qualquer falha desfaz tudo: ou a loja nasce completa ou nada é criado
  const createdUsers: string[] = [];
  try {
    const { error: themeError } = await db.from('tenant_themes').insert({
      tenant_id: tenantId,
      display_name: text(theme.display_name) || tradeName,
      logo_url: optional(theme.logo_url),
      logo_compact_url: optional(theme.logo_compact_url),
      favicon_url: optional(theme.favicon_url),
      primary_color: text(theme.primary_color) || '#1845E8',
      secondary_color: text(theme.secondary_color) || '#0B0F17',
      accent_color: optional(theme.accent_color),
      button_color: optional(theme.button_color),
      sidebar_color: optional(theme.sidebar_color),
      card_color: optional(theme.card_color),
      action_button_color: optional(theme.action_button_color),
      theme_mode: text(theme.theme_mode) || 'light',
      dashboard_style: text(theme.dashboard_style) || 'reference',
      pdf_header_style: text(theme.pdf_header_style) || 'standard'
    });
    if (themeError) refuse('Não foi possível salvar a identidade visual: ' + themeError.message);

    const flag = (key: string) => features[key] !== false;
    const { error: settingsError } = await db.from('tenant_settings').upsert({
      tenant_id: tenantId,
      assistance: flag('assistance'),
      wholesale: features.wholesale === true, // módulo opcional: só liga quando contratado
      upgrade: flag('upgrade'),
      imei_control: flag('imei_control'),
      gifts: flag('gifts'),
      accessories: flag('accessories'),
      auto_warranty: flag('auto_warranty'),
      send_whatsapp: flag('send_whatsapp'),
      send_email: flag('send_email')
    });
    if (settingsError) refuse('Não foi possível salvar as configurações: ' + settingsError.message);

    if (text(body.notes)) {
      const { error } = await db.from('tenant_internal_notes').upsert({ tenant_id: tenantId, notes: text(body.notes), updated_by: caller.id });
      if (error) refuse('Não foi possível salvar as observações: ' + error.message);
    }

    const adminProfile = await createAccount(admin, 'admin', tenantId);
    createdUsers.push(String(adminProfile.id));
    for (const user of sellers) createdUsers.push(String((await createAccount(user, 'seller', tenantId)).id));
    for (const user of technicians) createdUsers.push(String((await createAccount(user, 'technician', tenantId)).id));

    const documents = Array.isArray(body.documents) ? (body.documents as Json[]) : [];
    if (documents.length) {
      const { error } = await db.from('tenant_documents').insert(
        documents.map(d => ({
          tenant_id: tenantId,
          type: text(d.type),
          file_name: text(d.file_name),
          size: Number(d.size) || 0,
          storage_path: text(d.storage_path) || `${tenantId}/${text(d.type)}.pdf`,
          fields_total: Number(d.fields_total) || 0,
          fields_matched: Number(d.fields_matched) || 0,
          uploaded_by: caller.id
        }))
      );
      if (error) refuse('Não foi possível registrar os documentos: ' + error.message);
    }

    return { tenantId, adminId: adminProfile.id, sellers: sellers.length, technicians: technicians.length };
  } catch (err) {
    await removeAccounts(createdUsers);
    await db.from('tenants').delete().eq('id', tenantId);
    throw err;
  }
}

async function deleteTenant(caller: Caller, body: Json): Promise<Json> {
  if (caller.role !== 'super_admin') refuse('Apenas o Super Administrador pode excluir lojas.');
  if (!isUuid(body.tenantId)) refuse('Loja não encontrada.');
  const tenantId = String(body.tenantId);

  // A exclusão acontece inteira no banco (função admin_delete_tenant, migration 13)
  const { data, error } = await db.rpc('admin_delete_tenant', { p_tenant_id: tenantId });
  if (error) {
    if (error.message.includes('TENANT_HAS_DATA')) {
      refuse('Esta loja já tem movimentações registradas (estoque, vendas ou clientes) e não pode ser excluída. Suspenda ou cancele a loja.');
    }
    if (error.message.includes('TENANT_NOT_FOUND')) refuse('Loja não encontrada.');
    refuse('Não foi possível excluir a loja: ' + error.message);
  }

  const userIds = (data || []) as string[];
  for (const id of userIds) await db.auth.admin.deleteUser(id);

  // Arquivos da loja: modelos de documento ({loja}/{tipo}.pdf) e fotos da equipe ({loja}/{usuário}/{arquivo})
  const { data: templates } = await db.storage.from('tenant-documents').list(tenantId, { limit: 1000 });
  if (templates && templates.length) {
    await db.storage.from('tenant-documents').remove(templates.map(f => `${tenantId}/${f.name}`));
  }
  for (const id of userIds) {
    const folder = `${tenantId}/${id}`;
    const { data: photos } = await db.storage.from('avatars').list(folder, { limit: 1000 });
    if (photos && photos.length) await db.storage.from('avatars').remove(photos.map(f => `${folder}/${f.name}`));
  }
  return { removedUsers: userIds.length };
}

async function createUser(caller: Caller, body: Json): Promise<Json> {
  const role = text(body.role) as Role;
  let tenantId: string | null = isUuid(body.tenantId) ? String(body.tenantId) : null;

  if (caller.role === 'admin') {
    if (role !== 'seller' && role !== 'technician') refuse('O administrador da loja só pode criar vendedores e técnicos.');
    tenantId = caller.tenant_id;
  } else if (caller.role === 'super_admin') {
    if (!['admin', 'seller', 'technician'].includes(role)) refuse('Perfil de usuário inválido.');
  } else {
    refuse('Você não tem permissão para criar usuários.');
  }
  if (!tenantId) refuse('Informe a loja do usuário.');

  const { data: tenant } = await db.from('tenants').select('id').eq('id', tenantId).maybeSingle();
  if (!tenant) refuse('Loja não encontrada.');

  const profile = await createAccount(readNewUser(body.user), role, tenantId);
  return { profile };
}

async function updateUser(caller: Caller, body: Json): Promise<Json> {
  if (!isUuid(body.userId)) refuse('Usuário não encontrado.');
  const userId = String(body.userId);
  const { data: target } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (!target) refuse('Usuário não encontrado.');

  const isSelf = caller.id === userId;
  if (caller.role === 'admin') {
    const ownTeam = target!.tenant_id === caller.tenant_id && (target!.role === 'seller' || target!.role === 'technician');
    if (!isSelf && !ownTeam) refuse('Você só pode alterar vendedores e técnicos da sua loja.');
  } else if (caller.role !== 'super_admin') {
    refuse('Você não tem permissão para alterar usuários.');
  }

  const patch = (body.patch || {}) as Json;
  const changes: Json = {};
  if ('full_name' in patch) {
    if (!text(patch.full_name)) refuse('Informe o nome do usuário.');
    changes.full_name = text(patch.full_name);
  }
  if ('phone' in patch) changes.phone = optional(patch.phone);
  if ('avatar_url' in patch) changes.avatar_url = optional(patch.avatar_url);
  if ('avatar_path' in patch) changes.avatar_path = optional(patch.avatar_path);
  if ('is_active' in patch) {
    if (isSelf) refuse('Você não pode desativar a própria conta.');
    changes.is_active = Boolean(patch.is_active);
  }

  const authChanges: Json = {};
  if ('password' in patch) authChanges.password = checkPassword(patch.password);
  if ('is_active' in changes) authChanges.ban_duration = changes.is_active ? 'none' : BAN_FOREVER;

  if (Object.keys(authChanges).length) {
    const { error } = await db.auth.admin.updateUserById(userId, authChanges);
    if (error) refuse('Não foi possível atualizar o login: ' + error.message);
  }

  if (!Object.keys(changes).length) return { profile: target };
  const { data: profile, error } = await db.from('profiles').update(changes).eq('id', userId).select('*').single();
  if (error) refuse('Não foi possível salvar o usuário: ' + error.message);
  return { profile };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Json;
    const action = text(body.action);

    // Ações da instalação: não exigem login
    if (action === 'setup-status') return reply({ ok: true, ...(await setupStatus()) });
    if (action === 'bootstrap') return reply({ ok: true, ...(await bootstrap(body)) });

    const caller = await getCaller(req);
    switch (action) {
      case 'create-tenant':
        return reply({ ok: true, ...(await createTenant(caller, body)) });
      case 'delete-tenant':
        return reply({ ok: true, ...(await deleteTenant(caller, body)) });
      case 'create-user':
        return reply({ ok: true, ...(await createUser(caller, body)) });
      case 'update-user':
        return reply({ ok: true, ...(await updateUser(caller, body)) });
      default:
        return reply({ ok: false, error: 'Ação desconhecida.' });
    }
  } catch (err) {
    if (err instanceof Refusal) return reply({ ok: false, error: err.message });
    console.error(err);
    return reply({ ok: false, error: 'Erro inesperado no servidor. Tente de novo.' });
  }
});
