// ============================================================================
// CONTROLPHONE — CONTEXTO DE AUTENTICAÇÃO E SESSÃO MULTI-TENANT
// ============================================================================

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, Tenant, TenantTheme, SupportSession, UserRole } from '../types';
import { store } from '../lib/store';
import { hexToRgbString, resolveThemeColors } from '../lib/tenantSetup';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { loadRealIdentity, translateAuthError } from '../lib/realSession';
import { syncOnFocus, syncPlatformOnFocus, syncPlatformRecords, syncTenantRecords, watchTenantRecords } from '../lib/realData';
import { LoginPage } from '../pages/auth/LoginPage';

const DEMO_USER_ID = 'user-admin-01';
const DEMO_FLAG = 'controlphone_demo_session';

type AuthStatus = 'loading' | 'signed_out' | 'ready';

const readDemoFlag = () => {
  try {
    return sessionStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
};
const writeDemoFlag = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(DEMO_FLAG, '1');
    else sessionStorage.removeItem(DEMO_FLAG);
  } catch {
    // sem sessionStorage a demonstração vale só até recarregar a página
  }
};

interface AuthContextType {
  currentUser: UserProfile;
  currentTenant: Tenant | null;
  currentTheme: TenantTheme;
  isWhiteLabel: boolean;
  isSupportMode: boolean;
  activeSupportSession: SupportSession | null;
  allTenants: Tenant[];
  availableUsers: UserProfile[];
  /** true quando o sistema está com os dados de demonstração (sem login real) */
  isDemoMode: boolean;
  switchUser: (userId: string) => void;
  enterSupportMode: (tenantId: string, reason: string) => void;
  exitSupportMode: () => void;
  logout: () => void;
  updateTheme: (theme: TenantTheme) => void;
  resetTheme: (tenantId: string) => TenantTheme;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Inicializa com o Administrador da Loja 1 (Robert William) como padrão para experiência imediata
  const [currentUserId, setCurrentUserId] = useState<string>(DEMO_USER_ID);
  const [supportSession, setSupportSession] = useState<SupportSession | null>(null);
  const [, setVersion] = useState(0);
  // Sem Supabase configurado o sistema abre direto na demonstração, como antes
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? 'loading' : 'ready');
  const [isDemoMode, setIsDemoMode] = useState(!isSupabaseConfigured);

  useEffect(() => {
    const unsub = store.subscribe(() => setVersion(v => v + 1));
    return () => {
      unsub();
    };
  }, []);

  // Ao abrir: retoma a sessão real, se houver; senão mostra a tela de entrada
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const user = data.session?.user;
      if (user) {
        const result = await loadRealIdentity(user.id);
        if (cancelled) return;
        if (result.ok) {
          store.enterRealMode(result.identity);
          setCurrentUserId(result.userId);
          setIsDemoMode(false);
          setStatus('ready');
          return;
        }
        await supabase.auth.signOut({ scope: 'local' });
        if (cancelled) return;
      }
      if (readDemoFlag()) {
        setIsDemoMode(true);
        setStatus('ready');
      } else {
        setStatus('signed_out');
      }
    })();

    // Sessão encerrada em outra aba ou expirada: volta para a tela de entrada
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && store.isRealMode) {
        setSupportSession(null);
        setStatus('signed_out');
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) return translateAuthError(error?.message || '');

    const result = await loadRealIdentity(data.user.id);
    if (!result.ok) {
      await supabase.auth.signOut({ scope: 'local' });
      return result.error;
    }
    writeDemoFlag(false);
    store.enterRealMode(result.identity);
    store.registerAccess(result.userId);
    setCurrentUserId(result.userId);
    setSupportSession(null);
    setIsDemoMode(false);
    setStatus('ready');
    return null;
  };

  const currentUser = store.profiles.find(p => p.id === currentUserId) || store.profiles[1] || store.profiles[0];

  // Se estiver em modo de suporte, o tenant ativo é o target da sessão; senão é o tenant do usuário
  const isSupportMode = Boolean(supportSession);
  const effectiveTenantId = supportSession?.target_tenant_id || currentUser.tenant_id;
  const currentTenant = store.tenants.find(t => t.id === effectiveTenantId) || null;

  // REGRA 9: O Painel Super Admin (fora do modo suporte) NUNCA herda cores ou logo de lojas
  const isWhiteLabel = currentUser.role !== 'super_admin' || isSupportMode;

  const currentTheme: TenantTheme = (!isWhiteLabel)
    ? {
        id: 'theme-superadmin',
        tenant_id: '',
        display_name: 'Controlphone',
        primary_color: '#1845E8', // Azul Royal oficial
        secondary_color: '#0B0F17', // Obsidiana escuro oficial
        accent_color: '#2563EB',
        theme_mode: 'light',
        dashboard_style: 'reference',
        pdf_header_style: 'standard'
      }
    : ((effectiveTenantId && store.themes[effectiveTenantId]) || {
        id: 'theme-default',
        tenant_id: effectiveTenantId || '',
        display_name: currentTenant?.trade_name || 'Loja',
        primary_color: '#1845E8',
        secondary_color: '#0B0F17',
        accent_color: '#3B82F6',
        theme_mode: 'light',
        dashboard_style: 'reference',
        pdf_header_style: 'standard'
      });

  // Clientes, fornecedores e estoque vêm do banco: carrega ao entrar na loja, ao voltar para a aba
  // do sistema e sempre que outro aparelho da loja alterar algo
  const isRealSession = status === 'ready' && !isDemoMode && isSupabaseConfigured;
  useEffect(() => {
    if (!isRealSession || !effectiveTenantId) return;
    const role: UserRole = isSupportMode ? 'super_admin' : currentUser.role;
    void syncTenantRecords(effectiveTenantId, role);
    const stopWatching = watchTenantRecords(effectiveTenantId, role);
    const onFocus = () => syncOnFocus(effectiveTenantId, role);
    const onVisible = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopWatching();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isRealSession, effectiveTenantId, isSupportMode, currentUser.id, currentUser.role]);

  // Painel da plataforma (Super Admin fora do modo suporte): sessões de suporte e histórico de ações
  // também ficam no banco. Carrega ao entrar, ao sair de uma sessão de suporte e ao voltar para a aba.
  const isPlatformSession = isRealSession && currentUser.role === 'super_admin' && !isSupportMode;
  useEffect(() => {
    if (!isPlatformSession) return;
    void syncPlatformRecords();
    const onVisible = () => { if (document.visibilityState === 'visible') syncPlatformOnFocus(); };
    window.addEventListener('focus', syncPlatformOnFocus);
    window.addEventListener('online', syncPlatformOnFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', syncPlatformOnFocus);
      window.removeEventListener('online', syncPlatformOnFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isPlatformSession, currentUser.id]);

  // Atualizar variáveis CSS globais de tema (cores específicas herdam das principais quando ausentes)
  useEffect(() => {
    const colors = resolveThemeColors(currentTheme);
    const root = document.documentElement;
    root.style.setProperty('--tenant-primary', colors.primary);
    root.style.setProperty('--tenant-secondary', colors.secondary);
    root.style.setProperty('--tenant-accent', colors.accent);
    root.style.setProperty('--tenant-button', colors.button);
    root.style.setProperty('--tenant-sidebar', colors.sidebar);
    root.style.setProperty('--tenant-card', colors.card);
    root.style.setProperty('--tenant-action', colors.action);
    root.style.setProperty('--tenant-primary-rgb', hexToRgbString(colors.primary));
    root.style.setProperty('--tenant-secondary-rgb', hexToRgbString(colors.secondary));
    root.style.setProperty('--tenant-accent-rgb', hexToRgbString(colors.accent));
    root.style.setProperty('--tenant-button-rgb', hexToRgbString(colors.button));
    root.style.setProperty('--tenant-action-rgb', hexToRgbString(colors.action));
  }, [currentTheme]);

  // Favicon da loja no ambiente white label; fora dele volta o ícone oficial da plataforma
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    if (!link.dataset.defaultHref) {
      link.dataset.defaultHref = link.getAttribute('href') || '';
      link.dataset.defaultType = link.getAttribute('type') || '';
    }
    const favicon = isWhiteLabel ? currentTheme.favicon_url : undefined;
    link.setAttribute('href', favicon || link.dataset.defaultHref);
    link.setAttribute('type', favicon ? 'image/png' : link.dataset.defaultType || 'image/svg+xml');
  }, [isWhiteLabel, currentTheme.favicon_url]);

  const switchUser = (userId: string) => {
    if (!isDemoMode) return; // com login real, cada pessoa entra com a própria conta
    setCurrentUserId(userId);
    setSupportSession(null);
    store.registerAccess(userId);
  };

  const enterSupportMode = (tenantId: string, reason: string) => {
    if (currentUser.role !== 'super_admin') {
      alert('Apenas Super Admin pode iniciar sessões de suporte!');
      return;
    }
    const session = store.startSupportSession(currentUser.id, tenantId, reason);
    setSupportSession(session);
  };

  const exitSupportMode = () => {
    if (supportSession) {
      store.endSupportSession(supportSession.id);
      setSupportSession(null);
    }
  };

  const logout = () => {
    setSupportSession(null);
    if (!isSupabaseConfigured) {
      // Somente demonstração: retorna para o usuário inicial
      setCurrentUserId(DEMO_USER_ID);
      return;
    }
    if (isDemoMode) {
      writeDemoFlag(false);
      setCurrentUserId(DEMO_USER_ID);
      setStatus('signed_out');
      return;
    }
    setStatus('signed_out');
    // Só este aparelho: o padrão do Supabase derrubaria a mesma conta nos outros aparelhos
    void supabase.auth.signOut({ scope: 'local' });
  };

  const updateTheme = (theme: TenantTheme) => {
    store.updateTenantTheme(theme, currentUser.id);
  };

  const resetTheme = (tenantId: string) => {
    return store.resetTenantTheme(tenantId, currentUser.id);
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6FA] text-sm font-semibold text-slate-500">
        Carregando...
      </div>
    );
  }

  if (status === 'signed_out' || !currentUser) {
    return <LoginPage onSignIn={signIn} />;
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentTenant,
        currentTheme,
        isWhiteLabel,
        isSupportMode,
        activeSupportSession: supportSession,
        allTenants: store.tenants,
        availableUsers: store.profiles,
        isDemoMode,
        switchUser,
        enterSupportMode,
        exitSupportMode,
        logout,
        updateTheme,
        resetTheme
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider');
  }
  return context;
};
