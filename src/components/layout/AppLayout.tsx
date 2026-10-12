// ============================================================================
// CONTROLPHONE — APP LAYOUT PRINCIPAL (SHELL COM DESIGN FIEL À REFERÊNCIA)
// ============================================================================

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuth } from '../../context/AuthContext';

interface AppLayoutProps {
  currentView: string;
  onNavigate: (view: string) => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ currentView, onNavigate, children }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const { isWhiteLabel, isDemoMode } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F6FA] select-none">
      {/* SIDEBAR COM O VISUAL OBSIDIANA DARK E ACTIVE PILL AZUL ROYAL */}
      <Sidebar currentView={currentView} onNavigate={onNavigate} />

      {/* ÁREA PRINCIPAL: TOPBAR + CONTEÚDO SCROLLÁVEL */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar searchTerm={searchTerm} onSearchChange={setSearchTerm} />

        {/* Aviso da fase de transição: só conta, loja e equipe já vêm do banco de dados */}
        {!isDemoMode && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-[11px] font-semibold px-6 py-2">
            Lojas, usuários e senhas já são gravados no servidor. Estoque, vendas e os demais cadastros ainda ficam salvos apenas neste navegador.
          </div>
        )}

        {/* CONTAINER DE CONTEÚDO */}
        <main className={`flex-1 overflow-y-auto p-6 md:p-8 ${isWhiteLabel ? 'tenant-themed' : ''}`}>
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
