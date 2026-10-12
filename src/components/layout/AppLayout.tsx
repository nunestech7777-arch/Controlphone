// ============================================================================
// CONTROLPHONE — APP LAYOUT PRINCIPAL (SHELL COM DESIGN FIEL À REFERÊNCIA)
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useAuth } from '../../context/AuthContext';

interface AppLayoutProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ currentView, onNavigate, children }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { isWhiteLabel, isDemoMode } = useAuth();

  // No celular a sidebar vira um menu deslizante, aberto pelo botão da topbar ou bottom nav
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenuOpen]);

  const handleNavigate = (view: string) => {
    setIsMenuOpen(false);
    onNavigate(view);
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-[#F4F6FA] select-none pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Fundo escurecido atrás do menu deslizante (só no celular) */}
      <div
        aria-hidden="true"
        onClick={() => setIsMenuOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* SIDEBAR COM O VISUAL OBSIDIANA DARK E ACTIVE PILL AZUL ROYAL */}
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />

      {/* ÁREA PRINCIPAL: TOPBAR + CONTEÚDO SCROLLÁVEL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onMenuClick={() => setIsMenuOpen(true)}
        />

        {/* Aviso da fase de transição: só conta, loja e equipe já vêm do banco de dados */}
        {!isDemoMode && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-[11px] font-semibold px-4 sm:px-6 py-2">
            Lojas, usuários e senhas já são gravados no servidor. Estoque, vendas e os demais cadastros ainda ficam salvos apenas neste navegador.
          </div>
        )}

        {/* CONTAINER DE CONTEÚDO */}
        <main className={`flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-6 md:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8 ${isWhiteLabel ? 'tenant-themed' : ''}`}>
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>

        {/* BARRA DE NAVEGAÇÃO INFERIOR PARA iOS / MOBILE */}
        <BottomNav
          currentView={currentView}
          onNavigate={handleNavigate}
          onOpenMenu={() => setIsMenuOpen(true)}
        />
      </div>
    </div>
  );
};
