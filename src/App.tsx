// ============================================================================
// CONTROLPHONE — APLICAÇÃO PRINCIPAL COM ROTEAMENTO DE PERFIS
// ============================================================================

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { onNavigate } from './lib/navIntent';

// Telas do Super Admin
import { SuperDashboard } from './pages/super-admin/SuperDashboard';
import { TenantsManagement } from './pages/super-admin/TenantsManagement';
import { UsersManagement } from './pages/super-admin/UsersManagement';

// Telas do Administrador da Loja
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { InventoryManagement } from './pages/admin/InventoryManagement';
import { SuppliersManagement } from './pages/admin/SuppliersManagement';
import { WarrantiesManagement } from './pages/admin/WarrantiesManagement';
import { ReturnsManagement } from './pages/admin/ReturnsManagement';
import { SalesHub } from './pages/admin/SalesHub';
import { ServiceOrdersManagement } from './pages/admin/ServiceOrdersManagement';
import { CustomersCRM } from './pages/admin/CustomersCRM';
import { FinancialManagement } from './pages/admin/FinancialManagement';
import { TeamManagement } from './pages/admin/TeamManagement';
import { AuditLogsView } from './pages/admin/AuditLogsView';

// Telas do Vendedor
import { SellerHome } from './pages/seller/SellerHome';
import { SellerOSIntake } from './pages/seller/SellerOSIntake';

// Telas do Técnico
import { TechnicianHome } from './pages/technician/TechnicianHome';
import { TechnicianOSQueue } from './pages/technician/TechnicianOSQueue';
import { InternalRepairsView } from './pages/technician/InternalRepairsView';

const MainRouter: React.FC = () => {
  const { currentUser, isSupportMode } = useAuth();
  const [currentView, setCurrentView] = useState<string>('admin-dashboard');

  // Atualiza a tela padrão quando o usuário ou perfil muda
  useEffect(() => {
    if (isSupportMode) {
      setCurrentView('admin-dashboard');
    } else {
      switch (currentUser.role) {
        case 'super_admin':
          setCurrentView('super-dashboard');
          break;
        case 'admin':
          setCurrentView('admin-dashboard');
          break;
        case 'seller':
          setCurrentView('seller-home');
          break;
        case 'technician':
          setCurrentView('tech-home');
          break;
      }
    }
  }, [currentUser.id, currentUser.role, isSupportMode]);

  // Navegação solicitada por outros módulos (ex.: garantia -> assistência com dados preenchidos)
  useEffect(() => onNavigate(setCurrentView), []);

  // Renderização da view atual
  const renderCurrentView = () => {
    // 1. SUPER ADMIN VIEWS (quando não em modo suporte)
    if (currentUser.role === 'super_admin' && !isSupportMode) {
      switch (currentView) {
        case 'super-dashboard':
          return <SuperDashboard onNavigate={setCurrentView} />;
        case 'super-tenants':
          return <TenantsManagement />;
        case 'super-users':
          return <UsersManagement />;
        case 'super-theme':
          return <TenantsManagement />;
        case 'super-audit':
          return <AuditLogsView />;
        default:
          return <SuperDashboard onNavigate={setCurrentView} />;
      }
    }

    // 2. STORE ADMIN VIEWS (ou Super Admin em Modo Suporte)
    if (currentUser.role === 'admin' || isSupportMode) {
      switch (currentView) {
        case 'admin-dashboard':
          return <AdminDashboard />;
        // O administrador herda as funções operacionais do vendedor (sem trocar de perfil)
        case 'admin-pos':
          return <SalesHub key="admin-pos" initialTab="new" onNavigate={setCurrentView} />;
        case 'admin-upgrade':
          return <SalesHub key="admin-upgrade" initialTab="upgrade" onNavigate={setCurrentView} />;
        case 'admin-inventory':
          return <InventoryManagement />;
        case 'admin-suppliers':
          return <SuppliersManagement />;
        case 'admin-sales':
          return <SalesHub key="admin-sales" initialTab="history" onNavigate={setCurrentView} />;
        case 'admin-warranties':
          return <WarrantiesManagement viewId="admin-warranties" />;
        case 'admin-returns':
          return <ReturnsManagement viewId="admin-returns" />;
        case 'admin-trade-ins':
          return <SalesHub key="admin-sales" initialTab="history" onNavigate={setCurrentView} />; // upgrade é uma venda
        case 'admin-service-orders':
          return <ServiceOrdersManagement />;
        case 'admin-customers':
          return <CustomersCRM />;
        case 'admin-financial':
          return <FinancialManagement />;
        case 'admin-goals': // rota antiga: Metas & Ranking agora vive em Equipe da Loja
          return <TeamManagement />;
        case 'admin-team':
          return <TeamManagement />;
        case 'admin-terms':
          return <AuditLogsView />;
        case 'admin-audit':
          return <AuditLogsView />;
        default:
          return <AdminDashboard />;
      }
    }

    // 3. SELLER VIEWS (VENDEDOR)
    if (currentUser.role === 'seller') {
      switch (currentView) {
        case 'seller-home':
          return <SellerHome onNavigate={setCurrentView} />;
        case 'seller-pos':
          return <SalesHub key="seller-pos" initialTab="new" onNavigate={setCurrentView} />;
        case 'seller-trade-in':
          return <SalesHub key="seller-trade-in" initialTab="upgrade" onNavigate={setCurrentView} />;
        case 'seller-os-intake':
          return <SellerOSIntake />;
        case 'seller-my-sales':
          return <SalesHub key="seller-my-sales" initialTab="history" onNavigate={setCurrentView} />;
        case 'seller-warranties':
          return <WarrantiesManagement viewId="seller-warranties" />;
        case 'seller-returns':
          return <ReturnsManagement viewId="seller-returns" />;
        default:
          return <SellerHome onNavigate={setCurrentView} />;
      }
    }

    // 4. TECHNICIAN VIEWS (TÉCNICO)
    if (currentUser.role === 'technician') {
      switch (currentView) {
        case 'tech-home':
          return <TechnicianHome onNavigate={setCurrentView} />;
        case 'tech-os-queue':
          return <TechnicianOSQueue />;
        case 'tech-internal-repairs':
          return <InternalRepairsView />;
        case 'tech-history':
          return <TechnicianOSQueue />;
        default:
          return <TechnicianHome onNavigate={setCurrentView} />;
      }
    }

    return <AdminDashboard />;
  };

  return (
    <AppLayout currentView={currentView} onNavigate={setCurrentView}>
      {renderCurrentView()}
    </AppLayout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainRouter />
    </AuthProvider>
  );
}
