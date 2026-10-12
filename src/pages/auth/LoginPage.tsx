// ============================================================================
// CONTROLPHONE — TELA DE ENTRADA (LOGIN REAL NO SUPABASE)
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, LogIn, Mail, ShieldCheck, User } from 'lucide-react';
import { adminApi } from '../../lib/adminApi';
import { passwordIssue } from '../../lib/tenantSetup';

interface LoginPageProps {
  /** Devolve a mensagem de erro, ou null quando entrou */
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onEnterDemo: () => void;
}

const inputCls =
  'w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5';

export const LoginPage: React.FC<LoginPageProps> = ({ onSignIn, onEnterDemo }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Primeira execução: enquanto não existir Super Administrador, a tela vira a configuração inicial
  const [needsSetup, setNeedsSetup] = useState(false);
  const [checking, setChecking] = useState(true);
  const [serverNote, setServerNote] = useState('');
  const [fullName, setFullName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [setupKey, setSetupKey] = useState('');

  useEffect(() => {
    let cancelled = false;
    adminApi.setupStatus().then(result => {
      if (cancelled) return;
      if (result.ok) setNeedsSetup(result.needsSetup);
      else setServerNote(result.error);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const issue =
      !fullName.trim() ? 'Informe o seu nome.'
      : !email.trim() ? 'Informe o e-mail.'
      : passwordIssue(password) || (password !== confirm ? 'As senhas não conferem.' : null)
      || (!setupKey.trim() ? 'Informe o código de instalação.' : null);
    if (issue) {
      setError(issue);
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const created = await adminApi.bootstrap(setupKey.trim(), { full_name: fullName.trim(), email: email.trim(), password });
      if (!created.ok) {
        setError(created.error);
        return;
      }
      setNeedsSetup(false);
      const message = await onSignIn(email, password);
      if (message) setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!email.trim() || !password) {
      setError('Informe o e-mail e a senha.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const message = await onSignIn(email, password);
      if (message) setError(message);
    } catch {
      setError('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#0B0F17] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Controlphone</h1>
          <p className="text-xs text-slate-400 font-medium mt-1">Gestão completa para lojas de celulares</p>
        </div>

        <form onSubmit={needsSetup ? handleSetup : handleSubmit} className="bg-white rounded-3xl p-6 sm:p-7 shadow-2xl space-y-4">
          {needsSetup ? (
            <div>
              <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" /> Configuração inicial
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Crie a conta do Super Administrador. Ela é única e é por ela que as lojas são criadas.
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-base font-extrabold text-slate-800">Entrar</h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Use o e-mail e a senha da sua conta.</p>
            </div>
          )}

          {needsSetup && (
            <div>
              <label htmlFor="setup-name" className={labelCls}>Seu nome</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="setup-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome completo"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="login-email" className={labelCls}>E-mail</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@sualoja.com.br"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className={labelCls}>Senha</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsSetup ? 'Mínimo de 8 caracteres, com letras e números' : 'Sua senha'}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {needsSetup && (
            <>
              <div>
                <label htmlFor="setup-confirm" className={labelCls}>Confirmar senha</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="setup-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repita a senha"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="setup-key" className={labelCls}>Código de instalação</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="setup-key"
                    type="password"
                    autoComplete="off"
                    value={setupKey}
                    onChange={(e) => setSetupKey(e.target.value)}
                    placeholder="Definido na instalação do servidor"
                    className={inputCls}
                  />
                </div>
              </div>
            </>
          )}

          {!needsSetup && serverNote && (
            <p className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              {serverNote}
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || checking}
            className="w-full bg-[#1845E8] hover:bg-[#1339c4] disabled:opacity-60 text-white font-bold text-sm py-3 rounded-xl inline-flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            {needsSetup
              ? (isSubmitting ? 'Criando...' : 'Criar Super Administrador')
              : (isSubmitting ? 'Entrando...' : 'Entrar')}
          </button>
        </form>

        <div className="text-center mt-5">
          <button
            type="button"
            onClick={onEnterDemo}
            className="text-xs font-semibold text-slate-400 hover:text-white underline underline-offset-4"
          >
            Ver o sistema com dados de demonstração
          </button>
        </div>
      </div>
    </div>
  );
};
