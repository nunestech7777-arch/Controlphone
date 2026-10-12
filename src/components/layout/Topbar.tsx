// ============================================================================
// CONTROLPHONE — TOPBAR DESIGN FIEL À REFERÊNCIA
// ============================================================================

import React, { useState } from 'react';
import { Search, Bell, Mail, MoreHorizontal, ChevronDown, ShieldAlert, ArrowLeft, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../shared/UserAvatar';
import { MyProfileModal } from './MyProfileModal';

interface TopbarProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  /** Abre o menu deslizante no celular */
  onMenuClick: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ searchTerm, onSearchChange, onMenuClick }) => {
  const { currentUser, currentTenant, currentTheme, isSupportMode, exitSupportMode } = useAuth();

  // Administrador (dono da loja) e Super Admin podem colocar a própria foto pelo nome na barra
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const canEditOwnPhoto = currentUser.role === 'admin' || currentUser.role === 'super_admin';

  return (
    <header className="bg-white border-b border-slate-200/80 px-3 sm:px-6 pb-2.5 sm:pb-3.5 pt-[calc(0.625rem+env(safe-area-inset-top))] sm:pt-[calc(0.875rem+env(safe-area-inset-top))] flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30 shadow-sm">
      {/* Botão do menu (só no celular, onde a sidebar fica recolhida) */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menu"
        className="lg:hidden shrink-0 p-2 -ml-1 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* BARRA DE PESQUISA EM PÍLULA IDÊNTICA AO DESIGN DA IMAGEM */}
      <div className="flex-1 min-w-0 max-w-md">
        <div className="relative flex items-center">
          <div
            className="w-full flex items-center text-white rounded-full px-4 py-2 shadow-sm focus-within:ring-2 focus-within:ring-opacity-50 transition-colors"
            style={{ backgroundColor: currentTheme.primary_color }}
          >
            <Search className="w-4 h-4 text-white mr-2.5 shrink-0 opacity-90" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Pesquisar no sistema..."
              className="bg-transparent text-white placeholder-white/70 text-sm w-full min-w-0 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* ÁREA DIREITA: ALERTA DE SUPORTE (SE ATIVO), NOTIFICAÇÕES E PERFIL */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {/* Banner de Modo de Suporte Ativo */}
        {isSupportMode && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-700 px-3 py-1.5 rounded-full text-xs font-semibold animate-pulse">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden md:inline">Modo Suporte: {currentTenant?.trade_name}</span>
            <button
              onClick={exitSupportMode}
              className="md:ml-2 bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-colors"
            >
              <ArrowLeft className="w-2.5 h-2.5" />
              Sair
            </button>
          </div>
        )}

        {/* Ações / Ícones idênticos à Topbar da referência */}
        <div className="flex items-center gap-1 text-slate-500 sm:border-r border-slate-200 sm:pr-3">
          <button
            title="Mais opções"
            className="hidden sm:block p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          <button
            title="Mensagens"
            className="hidden sm:block p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors"
          >
            <Mail className="w-4 h-4" />
          </button>
          <button
            title="Notificações"
            className="p-2 hover:bg-slate-100 rounded-full text-slate-500 hover:text-slate-800 transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            <span
              className="w-2 h-2 rounded-full absolute top-1.5 right-1.5 ring-2 ring-white"
              style={{ backgroundColor: currentTheme.primary_color }}
            />
          </button>
        </div>

        {/* Perfil do Usuário com estilo da referência */}
        <button
          type="button"
          onClick={() => canEditOwnPhoto && setIsProfileOpen(true)}
          title={canEditOwnPhoto ? 'Abrir meu perfil e alterar a foto' : undefined}
          aria-label={canEditOwnPhoto ? 'Abrir meu perfil' : undefined}
          className={`flex items-center gap-2.5 pl-1 group rounded-xl ${canEditOwnPhoto ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 transition-colors">
              {currentUser.full_name}
            </span>
            <span className="text-[10px] text-slate-400">
              {currentUser.role === 'super_admin' ? 'Super Admin' :
               currentUser.role === 'admin' ? 'Administrador' :
               currentUser.role === 'seller' ? 'Vendedor' :
               currentUser.role === 'technician' ? 'Técnico' : currentUser.role}
            </span>
          </div>

          {currentUser.avatar_url ? (
            <UserAvatar
              name={currentUser.full_name}
              src={currentUser.avatar_url}
              size="sm"
              className="border-2 border-white shadow-sm ring-1 ring-slate-200"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow-sm ring-1 ring-slate-200"
              style={{ backgroundColor: currentTheme.primary_color }}
            >
              {currentUser.full_name.charAt(0)}
            </div>
          )}

          <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" />
        </button>
      </div>

      {isProfileOpen && <MyProfileModal onClose={() => setIsProfileOpen(false)} />}
    </header>
  );
};
