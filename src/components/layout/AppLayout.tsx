// ============================================================================
// CONTROLPHONE — APP LAYOUT PRINCIPAL (SHELL COM DESIGN FIEL À REFERÊNCIA)
// ============================================================================

import React, { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useAuth } from '../../context/AuthContext';
import { store } from '../../lib/store';

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
    <div className="flex h-dvh overflow-hidden bg-[#F4F6FA] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
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
            Lojas, usuários, clientes, fornecedores e estoque já são gravados no servidor. Vendas, assistência, garantias e financeiro ainda ficam salvos apenas neste navegador.
          </div>
        )}

        {/* Cadastro feito sem conexão: fica na fila e sobe sozinho quando o servidor responder */}
        {!isDemoMode && store.hasUnsynced && (
          <div role="status" className="bg-sky-50 border-b border-sky-200 text-sky-900 text-[11px] font-semibold px-4 sm:px-6 py-2">
            Há alterações de clientes, fornecedores ou estoque aguardando envio ao servidor. Elas serão enviadas
            automaticamente quando a conexão voltar; até lá, não aparecem nos outros aparelhos da loja.
          </div>
        )}

        {/* A última gravação não coube no navegador: nada do que for feito agora fica salvo */}
        {store.saveFailed && (
          <div role="alert" className="bg-rose-600 text-white text-xs font-bold px-4 sm:px-6 py-2.5">
            Atenção: não foi possível salvar os dados neste navegador (armazenamento cheio ou bloqueado). As últimas
            alterações serão perdidas ao fechar ou recarregar a página. Não registre novas operações e fale com o suporte.
          </div>
        )}

        {/* CONTAINER DE CONTEÚDO */}
        <main
          onClickCapture={(e) => {
            // Soltar o mouse depois de selecionar um texto (IMEI, telefone) não conta como clique na linha
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && (e.target as HTMLElement).closest('tr')) e.stopPropagation();
          }}
          className={`flex-1 overflow-y-auto overscroll-contain p-3.5 sm:p-6 md:p-8 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-8 ${isWhiteLabel ? 'tenant-themed' : ''}`}>
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
