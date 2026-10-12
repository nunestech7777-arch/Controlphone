// ============================================================================
// CONTROLPHONE — SIDEBAR DESIGN FIEL À REFERÊNCIA
// ============================================================================

import React from 'react';
import {
  LayoutDashboard,
  Smartphone,
  ShoppingBag,
  RefreshCw,
  Wrench,
  Users,
  DollarSign,
  Award,
  FileText,
  ShieldCheck,
  History,
  Building2,
  Palette,
  LifeBuoy,
  LogOut,
  Truck,
  RotateCcw,
  Layers,
  ChevronDown,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types';
import { store } from '../../lib/store';
import { resolveThemeColors } from '../../lib/tenantSetup';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onNavigate }) => {
  const { currentUser, currentTenant, currentTheme, isWhiteLabel, isSupportMode, switchUser, availableUsers, logout, isDemoMode } = useAuth();

  // Itens do menu de acordo com o perfil
  const getAllMenuItems = () => {
    if (isSupportMode) {
      // Quando em modo de suporte, o Super Admin tem acesso às telas do Admin da Loja
      return [
        { id: 'admin-dashboard', label: 'Painel da Loja', icon: LayoutDashboard },
        { id: 'admin-inventory', label: 'Estoque', icon: Smartphone },
        { id: 'admin-suppliers', label: 'Fornecedores', icon: Truck },
        { id: 'admin-sales', label: 'Vendas', icon: ShoppingBag, aliases: ['admin-pos', 'admin-upgrade', 'admin-trade-ins'] },
        { id: 'admin-warranties', label: 'Garantias', icon: ShieldCheck },
        { id: 'admin-returns', label: 'Trocas & Devoluções', icon: RotateCcw },
        { id: 'admin-service-orders', label: 'Assistência Técnica', icon: Wrench },
        { id: 'admin-customers', label: 'Clientes', icon: Users },
        { id: 'admin-financial', label: 'Financeiro', icon: DollarSign },
        { id: 'admin-team', label: 'Equipe da Loja', icon: UserCheck },
        { id: 'admin-audit', label: 'Histórico Atividades', icon: History },
      ];
    }

    switch (currentUser.role) {
      case 'super_admin':
        return [
          { id: 'super-dashboard', label: 'Painel da Plataforma', icon: LayoutDashboard },
          { id: 'super-tenants', label: 'Lojas Cadastradas', icon: Building2 },
          { id: 'super-users', label: 'Gestão de Usuários', icon: Users },
          { id: 'super-theme', label: 'Personalizações', icon: Palette },
          { id: 'super-sessions', label: 'Sessões de Suporte', icon: LifeBuoy },
          { id: 'super-audit', label: 'Histórico Global', icon: History },
        ];

      case 'admin':
        return [
          { id: 'admin-dashboard', label: 'Painel Geral', icon: LayoutDashboard },
          { id: 'admin-inventory', label: 'Estoque', icon: Smartphone },
          { id: 'admin-suppliers', label: 'Fornecedores', icon: Truck },
          { id: 'admin-sales', label: 'Vendas', icon: ShoppingBag, aliases: ['admin-pos', 'admin-upgrade', 'admin-trade-ins'] },
          { id: 'admin-warranties', label: 'Garantias', icon: ShieldCheck },
          { id: 'admin-returns', label: 'Trocas & Devoluções', icon: RotateCcw },
          { id: 'admin-service-orders', label: 'Assistência Técnica', icon: Wrench },
          { id: 'admin-customers', label: 'Clientes', icon: Users },
          { id: 'admin-financial', label: 'Financeiro', icon: DollarSign },
          { id: 'admin-team', label: 'Equipe da Loja', icon: UserCheck },
          { id: 'admin-terms', label: 'Termos & Documentos', icon: FileText },
          { id: 'admin-audit', label: 'Histórico Atividades', icon: History },
        ];

      case 'seller':
        return [
          { id: 'seller-home', label: 'Início', icon: LayoutDashboard },
          { id: 'seller-pos', label: 'Vendas', icon: ShoppingBag, aliases: ['seller-trade-in', 'seller-my-sales'] },
          { id: 'seller-warranties', label: 'Garantias', icon: ShieldCheck },
          { id: 'seller-returns', label: 'Trocas & Devoluções', icon: RotateCcw },
          { id: 'seller-os-intake', label: 'Assistência (Balcão)', icon: Wrench },
          { id: 'seller-goals', label: 'Minha Meta', icon: Award },
        ];

      case 'technician':
        return [
          { id: 'tech-home', label: 'Início', icon: LayoutDashboard },
          { id: 'tech-os-queue', label: 'Ordens de Serviço', icon: Wrench },
          { id: 'tech-internal-repairs', label: 'Manutenções Estoque', icon: RefreshCw },
          { id: 'tech-history', label: 'Histórico Técnico', icon: History },
        ];

      default:
        return [];
    }
  };

  // Módulos desligados nas configurações da loja não aparecem no menu
  const features = store.getTenantFeatures(currentTenant?.id);
  const assistanceViews = ['admin-service-orders', 'seller-os-intake'];
  const menuItems = getAllMenuItems().filter(
    item => !isWhiteLabel || features.assistance || !assistanceViews.includes(item.id)
  );

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin Loja';
      case 'seller': return 'Vendedor';
      case 'technician': return 'Técnico';
    }
  };

  // Cores dinâmicas para lojista ou padrão oficial para Super Admin
  const sidebarBg = isWhiteLabel ? resolveThemeColors(currentTheme).sidebar : '#0B0F17';
  const primaryColor = isWhiteLabel ? currentTheme.primary_color : '#1845E8';

  return (
    <aside
      className="w-64 text-white flex flex-col justify-between p-4 border-r border-white/10 shrink-0 min-h-screen select-none transition-colors duration-300"
      style={{ backgroundColor: sidebarBg }}
    >
      <div>
        {/* CABEÇALHO DA BARRA LATERAL */}
        <div className="px-3 py-4 mb-4 border-b border-white/10">
          {!isWhiteLabel ? (
            /* PAINEL SUPER ADMIN: MANTÉM A IDENTIDADE ORIGINAL CONTROLPHONE */
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#1845E8] flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-wider text-white">CONTROLPHONE</h1>
                <p className="text-[11px] font-medium text-slate-400 truncate max-w-[140px]">
                  Plataforma
                </p>
              </div>
            </div>
          ) : (
            /* AMBIENTE WHITE LABEL LOJISTA: EXIBE APENAS A LOGO DA LOJA (SEM TEXTO AO LADO) */
            <div className="flex items-center justify-center min-h-[50px] py-1">
              {currentTheme.logo_url ? (
                <img
                  src={currentTheme.logo_url}
                  alt="Logotipo da Loja"
                  className="max-h-12 max-w-[190px] object-contain transition-all"
                />
              ) : (
                /* SE NÃO TIVER LOGO ENVIADA, APRESENTA ÍCONE MINIMALISTA COM A INICIAL DA LOJA (NUNCA O NOME CONTROLPHONE) */
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-lg"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {(currentTheme.display_name || currentTenant?.trade_name || 'L').charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-sm font-extrabold tracking-wide text-white truncate max-w-[140px]">
                      {currentTheme.display_name || currentTenant?.trade_name}
                    </h1>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* NAVEGAÇÃO COM O BOTÃO ATIVO NA COR PRIMÁRIA DA LOJA */}
        <nav className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)] sidebar-scroll pr-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id || Boolean((item as { aliases?: string[] }).aliases?.includes(currentView));
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-all duration-200 text-left rounded-xl ${
                  isActive
                    ? 'text-white font-semibold shadow-md translate-x-1'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
                style={isActive ? { backgroundColor: primaryColor } : undefined}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* PARTE INFERIOR: SELETOR DE PERFIL & BOTÃO DE LOGOUT */}
      <div className="pt-4 border-t border-white/10 space-y-3">
        {/* Switcher Rápido de Perfil para Demonstração e Testes */}
        {isDemoMode && (
        <div className="bg-black/30 p-2.5 rounded-xl border border-white/10">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 font-medium">
            <span>Alternar Perfil:</span>
            <span className="font-semibold text-white" style={{ color: primaryColor }}>
              {getRoleBadge(currentUser.role)}
            </span>
          </div>
          <select
            value={currentUser.id}
            onChange={(e) => switchUser(e.target.value)}
            className="w-full bg-black/60 text-white text-xs rounded-lg px-2 py-1.5 border border-white/20 focus:outline-none"
          >
            {availableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name} ({getRoleBadge(user.role)})
              </option>
            ))}
          </select>
        </div>
        )}

        {/* BOTÃO SAIR ESTILIZADO NA COR PRIMÁRIA */}
        <button
          onClick={logout}
          className="w-full text-white font-semibold py-2.5 px-4 rounded-full flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all duration-200 shadow-md active:scale-95 hover:opacity-90"
          style={{ backgroundColor: primaryColor }}
        >
          <LogOut className="w-4 h-4 text-white" />
          <span>SAIR</span>
        </button>
      </div>
    </aside>
  );
};
