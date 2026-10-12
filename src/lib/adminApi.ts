// ============================================================================
// CONTROLPHONE — CHAMADAS À FUNÇÃO DE ADMINISTRAÇÃO (supabase/functions/admin)
// Tudo o que cria ou altera contas de acesso passa por aqui: instalação do
// Super Administrador, criação e exclusão de lojas e gestão de usuários.
// ============================================================================

import { supabase } from './supabase';
import { TenantSetupPayload } from './store';
import { UserProfile, UserRole } from '../types';

export type AdminResult<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export interface NewUserInput {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  cpf?: string;
}

export interface UserPatch {
  full_name?: string;
  phone?: string | null;
  avatar_url?: string | null;
  avatar_path?: string | null;
  is_active?: boolean;
  password?: string;
}

const OFFLINE = 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.';
const NOT_INSTALLED = 'A função de administração ainda não está instalada no servidor.';
// Mesmo texto que a função devolve quando o servidor não reconhece o login de quem chamou
const SESSION_EXPIRED = 'Sessão expirada';
const SIGN_IN_AGAIN = 'Sua sessão foi encerrada. Saia do sistema e entre novamente para continuar.';

async function invoke<T>(action: string, body: Record<string, unknown>): Promise<AdminResult<T>> {
  const { data, error } = await supabase.functions.invoke('admin', { body: { action, ...body } });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    return { ok: false, error: status === 404 ? NOT_INSTALLED : OFFLINE };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: OFFLINE };
  if (data.ok === false) return { ok: false, error: data.error || 'Não foi possível concluir a ação.' };
  return data as AdminResult<T>;
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<AdminResult<T>> {
  try {
    const result = await invoke<T>(action, body);
    if (result.ok || !result.error.startsWith(SESSION_EXPIRED)) return result;

    // O servidor recusou o login: renova a sessão e tenta mais uma vez antes de desistir
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session) return { ok: false, error: SIGN_IN_AGAIN };
    const retry = await invoke<T>(action, body);
    return !retry.ok && retry.error.startsWith(SESSION_EXPIRED) ? { ok: false, error: SIGN_IN_AGAIN } : retry;
  } catch {
    return { ok: false, error: OFFLINE };
  }
}

export const adminApi = {
  /** Primeira execução: true enquanto o Super Administrador não existir */
  setupStatus: () => call<{ needsSetup: boolean }>('setup-status'),

  bootstrap: (setupKey: string, user: NewUserInput) =>
    call<{ profile: UserProfile }>('bootstrap', { setupKey, user }),

  createTenant: (payload: TenantSetupPayload) =>
    call<{ tenantId: string; adminId: string; sellers: number; technicians: number }>('create-tenant', {
      tenantId: payload.tenantId,
      company: payload.company,
      theme: payload.theme,
      admin: payload.admin,
      sellers: payload.sellers,
      technicians: payload.technicians,
      features: payload.features,
      plan: payload.plan,
      planStartDate: payload.planStartDate,
      planDueDate: payload.planDueDate,
      status: payload.status,
      notes: payload.notes,
      documents: payload.documents
    }),

  deleteTenant: (tenantId: string) => call<{ removedUsers: number }>('delete-tenant', { tenantId }),

  createUser: (tenantId: string, role: Exclude<UserRole, 'super_admin'>, user: NewUserInput) =>
    call<{ profile: UserProfile }>('create-user', { tenantId, role, user }),

  updateUser: (userId: string, patch: UserPatch) =>
    call<{ profile: UserProfile }>('update-user', { userId, patch })
};
