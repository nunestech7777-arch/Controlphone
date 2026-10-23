// ============================================================================
// CONTROLPHONE — SESSÃO REAL (SUPABASE AUTH)
// Lê do banco a conta que entrou, a loja, o tema, as configurações e a equipe.
// As regras de segurança do banco (RLS) já limitam o que cada perfil enxerga:
// usuários da loja recebem só a própria loja; o Super Admin recebe todas.
// ============================================================================

import { supabase } from './supabase';
import { RealIdentity, store } from './store';
import { Tenant, TenantDocument, TenantSettings, TenantTheme, UserProfile } from '../types';
import { isTenantOperational } from './tenantSetup';
import { fetchActiveCycle } from './resetApi';

export type RealIdentityResult =
  | { ok: true; userId: string; identity: RealIdentity }
  | { ok: false; error: string };

// O banco devolve null nos campos vazios; o sistema trabalha com campo ausente
function clean<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  Object.keys(row).forEach(key => {
    if (row[key] !== null) out[key] = row[key];
  });
  return out as T;
}

export function translateAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (text.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado.';
  if (text.includes('rate limit') || text.includes('too many')) return 'Muitas tentativas. Aguarde um instante e tente de novo.';
  if (text.includes('failed to fetch') || text.includes('network')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return 'Não foi possível entrar. Tente de novo.';
}

export async function loadRealIdentity(userId: string): Promise<RealIdentityResult> {
  const { data: me, error: meError } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (meError) return { ok: false, error: 'Não foi possível carregar sua conta. Tente de novo.' };
  if (!me) return { ok: false, error: 'Seu usuário existe, mas ainda não está ligado a uma loja. Fale com o responsável pelo sistema.' };
  if (me.is_active === false) return { ok: false, error: 'Este usuário está desativado.' };
  if (me.role !== 'super_admin' && !me.tenant_id) return { ok: false, error: 'Seu usuário ainda não está ligado a uma loja.' };

  const [tenantsRes, themesRes, profilesRes, settingsRes, documentsRes, notesRes, cycle] = await Promise.all([
    supabase.from('tenants').select('*').order('created_at', { ascending: false }),
    supabase.from('tenant_themes').select('*'),
    supabase.from('profiles').select('*').order('created_at'),
    supabase.from('tenant_settings').select('*'),
    supabase.from('tenant_documents').select('*'),
    supabase.from('tenant_internal_notes').select('tenant_id, notes'), // só o Super Admin recebe linhas
    // ciclo operacional ativo (Reset Geral): a cópia local de um ciclo encerrado é descartada
    me.role === 'super_admin' ? Promise.resolve(null) : fetchActiveCycle()
  ]);
  const failed = tenantsRes.error || themesRes.error || profilesRes.error || settingsRes.error
    || documentsRes.error || notesRes.error;
  if (failed) return { ok: false, error: 'Não foi possível carregar os dados da loja. Tente de novo.' };

  const tenants = (tenantsRes.data || []).map(row => clean<Tenant>(row));
  (notesRes.data || []).forEach(row => {
    const tenant = tenants.find(t => t.id === row.tenant_id);
    if (tenant && row.notes) tenant.internal_notes = row.notes;
  });

  if (me.role !== 'super_admin') {
    const ownTenant = tenants.find(t => t.id === me.tenant_id);
    if (!ownTenant) return { ok: false, error: 'A loja deste usuário não foi encontrada.' };
    if (!isTenantOperational(ownTenant.status)) {
      return { ok: false, error: 'O acesso desta loja está suspenso. Fale com o suporte do sistema.' };
    }
  }

  const themes: Record<string, TenantTheme> = {};
  (themesRes.data || []).forEach(row => {
    const theme = clean<TenantTheme>(row);
    const tenant = tenants.find(t => t.id === theme.tenant_id);
    themes[theme.tenant_id] = { ...theme, display_name: theme.display_name || tenant?.trade_name || 'Loja' };
  });

  const tenantSettings: Record<string, TenantSettings> = {};
  (settingsRes.data || []).forEach(row => {
    const { tenant_id, updated_at: _updatedAt, ...settings } = row as Record<string, unknown>;
    tenantSettings[String(tenant_id)] = clean<TenantSettings>(settings);
  });

  const profiles = (profilesRes.data || []).map(row => clean<UserProfile>(row));

  return {
    ok: true,
    userId,
    identity: {
      scope: me.role === 'super_admin' ? 'plataforma' : String(me.tenant_id),
      tenants,
      themes,
      profiles,
      tenantSettings,
      tenantDocuments: (documentsRes.data || []).map(row => clean<TenantDocument>(row)),
      cycle
    }
  };
}

/** Relê do banco as lojas e os usuários depois de uma alteração feita no servidor. */
export async function refreshRealData(): Promise<void> {
  if (!store.isRealMode) return;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return;
  const result = await loadRealIdentity(userId);
  if (result.ok) store.enterRealMode(result.identity);
}
