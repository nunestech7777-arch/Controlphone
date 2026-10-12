// ============================================================================
// CONTROLPHONE — VENDAS (NOVA VENDA | VENDA COM UPGRADE | HISTÓRICO)
// Um único módulo para todo o processo comercial, para administrador e vendedor.
// ============================================================================

import React, { useState } from 'react';
import { ShoppingCart, RefreshCw, History } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { store } from '../../lib/store';
import { SalesManagement } from './SalesManagement';
import { SellerMySales } from '../seller/SellerMySales';
import { POSSale } from '../seller/POSSale';
import { POSTradeIn } from '../seller/POSTradeIn';

export type SalesTab = 'new' | 'upgrade' | 'history';

interface SalesHubProps {
  initialTab: SalesTab;
  onNavigate: (view: string) => void;
}

export const SalesHub: React.FC<SalesHubProps> = ({ initialTab, onNavigate }) => {
  const { currentUser, currentTenant, isSupportMode } = useAuth();
  const isAdmin = currentUser.role === 'admin' || isSupportMode;
  // Loja que não trabalha com upgrade (configuração do cadastro) não vê a modalidade
  const upgradeEnabled = store.getTenantFeatures(currentTenant?.id).upgrade;
  const [tab, setTab] = useState<SalesTab>(initialTab === 'upgrade' && !upgradeEnabled ? 'new' : initialTab);

  const allTabs: { id: SalesTab; label: string; icon: React.ElementType }[] = [
    { id: 'new', label: 'Nova Venda', icon: ShoppingCart },
    { id: 'upgrade', label: 'Venda com Upgrade', icon: RefreshCw },
    { id: 'history', label: isAdmin ? 'Histórico de Vendas' : 'Minhas Vendas', icon: History }
  ];
  const tabs = allTabs.filter(t => t.id !== 'upgrade' || upgradeEnabled);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'new' && <POSSale onNavigate={onNavigate} />}
      {tab === 'upgrade' && <POSTradeIn onNavigate={onNavigate} />}
      {tab === 'history' && (isAdmin ? <SalesManagement /> : <SellerMySales />)}
    </div>
  );
};
