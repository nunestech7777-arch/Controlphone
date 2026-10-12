// ============================================================================
// CONTROLPHONE — BOTTOM NAVIGATION BAR (EXPERIÊNCIA NATIVA iOS / PWA)
// ============================================================================

import React from 'react';
import {
  LayoutDashboard,
  Smartphone,
  ShoppingBag,
  Wrench,
  Menu,
  ShieldCheck,
  RefreshCw,
  Building2,
  Users
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface BottomNavProps {
  currentView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate, onOpenMenu }) => {
  const { currentUser, currentTheme, isSupportMode } = useAuth();
  const primaryColor = currentTheme.primary_color || '#1845E8';

  // Configuração das ações principais de acordo com o perfil
  const getNavItems = () => {
    if (isSupportMode || currentUser.role === 'admin') {
      return [
        { id: 'admin-dashboard', label: 'Painel', icon: LayoutDashboard },
        { id: 'admin-inventory', label: 'Estoque', icon: Smartphone },
        { id: 'admin-sales', label: 'Vendas', icon: ShoppingBag, aliases: ['admin-pos', 'admin-upgrade', 'admin-trade-ins'] },
        { id: 'admin-service-orders', label: 'OS', icon: Wrench },
      ];
    }

    if (currentUser.role === 'seller') {
      return [
        { id: 'seller-home', label: 'Início', icon: LayoutDashboard },
        { id: 'seller-pos', label: 'Venda', icon: ShoppingBag, aliases: ['seller-trade-in', 'seller-my-sales'] },
        { id: 'seller-os-intake', label: 'OS', icon: Wrench },
        { id: 'seller-warranties', label: 'Garantias', icon: ShieldCheck },
      ];
    }

    if (currentUser.role === 'technician') {
      return [
        { id: 'tech-home', label: 'Início', icon: LayoutDashboard },
        { id: 'tech-os-queue', label: 'Fila OS', icon: Wrench },
        { id: 'tech-internal-repairs', label: 'Reparos', icon: RefreshCw },
      ];
    }

    if (currentUser.role === 'super_admin') {
      return [
        { id: 'super-dashboard', label: 'Painel', icon: LayoutDashboard },
        { id: 'super-tenants', label: 'Lojas', icon: Building2 },
        { id: 'super-users', label: 'Usuários', icon: Users },
      ];
    }

    return [];
  };

  const navItems = getNavItems();

  return (
    <nav
      aria-label="Navegação rápida inferior"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] px-2 transition-all"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id || Boolean((item as { aliases?: string[] }).aliases?.includes(currentView));

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all active:scale-95 touch-manipulation group"
            >
              <div
                className={`relative p-1.5 rounded-xl transition-all ${
                  isActive ? 'shadow-sm' : 'group-hover:bg-slate-100/60'
                }`}
                style={isActive ? { backgroundColor: `${primaryColor}15` } : undefined}
              >
                <Icon
                  className="w-5 h-5 transition-transform"
                  style={{ color: isActive ? primaryColor : '#64748B' }}
                />
                {isActive && (
                  <span
                    className="absolute -top-0.5 right-1 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: primaryColor }}
                  />
                )}
              </div>
              <span
                className={`text-[10px] font-bold tracking-tight mt-0.5 truncate max-w-[64px] transition-colors ${
                  isActive ? 'font-extrabold' : 'text-slate-500'
                }`}
                style={isActive ? { color: primaryColor } : undefined}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Botão MENU para abrir o restante dos recursos */}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all active:scale-95 touch-manipulation group"
        >
          <div className="p-1.5 rounded-xl transition-all group-hover:bg-slate-100/60">
            <Menu className="w-5 h-5 text-slate-500 group-hover:text-slate-800" />
          </div>
          <span className="text-[10px] font-bold tracking-tight text-slate-500 mt-0.5">
            Menu
          </span>
        </button>
      </div>
    </nav>
  );
};
