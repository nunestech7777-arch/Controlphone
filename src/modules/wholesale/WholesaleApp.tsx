// ============================================================================
// CONTROLPHONE — MÓDULO ATACADO
// Mini-ERP independente do varejo. Carregado por React.lazy (só baixa o código
// quando a loja tem o módulo) e só consulta o banco depois de montado, o que
// só acontece com o módulo ligado e o perfil autorizado (ver App.tsx).
// ============================================================================

import React, { useEffect, useState } from 'react';
import {
  Boxes, LayoutDashboard, Loader2, Lock, Receipt, ShoppingCart, Users, Wallet, AlertTriangle, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { store } from '../../lib/store';
import { useWholesale } from './useWholesale';
import { PeriodId } from './calc';
import { WholesaleDashboard } from './WholesaleDashboard';
import { WholesaleStock } from './WholesaleStock';
import { WholesaleCustomers } from './WholesaleCustomers';
import { WholesaleSales } from './WholesaleSales';
import { WholesaleFinancial } from './WholesaleFinancial';
import { WholesaleAccess } from './types';
import { btnGhost } from './ui';

type TabId = 'dashboard' | 'stock' | 'customers' | 'sales' | 'financial';

const ADMIN_TABS: { id: TabId; label: string; icon: typeof Boxes }[] = [
  { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
  { id: 'stock', label: 'Estoque', icon: Boxes },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'sales', label: 'Vendas', icon: ShoppingCart },
  { id: 'financial', label: 'Financeiro', icon: Wallet }
];
const SELLER_TABS = ADMIN_TABS.filter(t => t.id === 'sales' || t.id === 'customers').reverse();

const Workspace: React.FC<{ tenantId: string; access: WholesaleAccess }> = ({ tenantId, access }) => {
  const { currentUser, currentTheme, isDemoMode } = useAuth();
  const color = currentTheme.primary_color || '#1845E8';
  const isAdmin = access === 'admin';
  const tabs = isAdmin ? ADMIN_TABS : SELLER_TABS;

  const ctl = useWholesale({
    tenantId, access, userId: currentUser.id, userName: currentUser.full_name, demo: isDemoMode
  });
  const [tab, setTab] = useState<TabId>(tabs[0].id);
  const [period, setPeriod] = useState<PeriodId>('month');
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const notify = (text: string, kind: 'ok' | 'error' = 'ok') => setMessage({ text, kind });
  const sellersCanSell = store.wholesaleSellerSalesEnabled(tenantId);

  const toggleSellers = () => {
    const result = store.setWholesaleSellerAccess(tenantId, !sellersCanSell, currentUser.id);
    if (!result.ok) return notify(result.error || 'Não foi possível alterar a permissão.', 'error');
    bump(n => n + 1);
    notify(!sellersCanSell ? 'Vendedores podem vender no Atacado.' : 'Vendedores não vendem mais no Atacado.');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 shrink-0" style={{ color }} />
            Atacado
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Operação separada do varejo: estoque, clientes, vendas e financeiro próprios.
          </p>
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input type="checkbox" className="sr-only peer" checked={sellersCanSell} onChange={toggleSellers} />
            <span className={`w-9 h-5 rounded-full transition-colors relative peer-focus-visible:ring-2 peer-focus-visible:ring-blue-200 ${sellersCanSell ? '' : 'bg-slate-300'}`}
              style={sellersCanSell ? { backgroundColor: color } : undefined}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${sellersCanSell ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            Vendedores podem vender no Atacado
          </label>
        )}
      </div>

      <nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Seções do Atacado">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={active ? 'page' : undefined}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap transition ${
                active ? 'text-white shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              style={active ? { backgroundColor: color } : undefined}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </nav>

      {message && (
        <div role={message.kind === 'error' ? 'alert' : 'status'}
          className={`px-4 py-3 rounded-xl text-xs font-semibold border ${
            message.kind === 'error' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
          {message.text}
        </div>
      )}

      {ctl.status === 'loading' && (
        <div className="py-16 flex items-center justify-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando o Atacado…
        </div>
      )}

      {ctl.status === 'error' && (
        <div className="py-12 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
          <p className="text-xs font-semibold text-slate-600 max-w-md mx-auto">{ctl.error}</p>
          <button type="button" className={btnGhost} onClick={() => void ctl.reload()}>
            <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
        </div>
      )}

      {ctl.status === 'ready' && (
        <>
          {tab === 'dashboard' && <WholesaleDashboard ctl={ctl} period={period} onPeriod={setPeriod} />}
          {tab === 'stock' && <WholesaleStock ctl={ctl} color={color} onMessage={notify} />}
          {tab === 'customers' && <WholesaleCustomers ctl={ctl} color={color} isAdmin={isAdmin} onMessage={notify} />}
          {tab === 'sales' && <WholesaleSales ctl={ctl} color={color} isAdmin={isAdmin} onMessage={notify} />}
          {tab === 'financial' && <WholesaleFinancial ctl={ctl} color={color} period={period} onPeriod={setPeriod} onMessage={notify} />}
        </>
      )}
    </div>
  );
};

const WholesaleApp: React.FC = () => {
  const { currentUser, currentTenant, isSupportMode } = useAuth();
  const tenantId = currentTenant?.id;
  const enabled = store.getTenantFeatures(tenantId).wholesale;

  let access: WholesaleAccess | null = null;
  if (isSupportMode || currentUser.role === 'admin') access = 'admin';
  else if (currentUser.role === 'seller' && store.wholesaleSellerSalesEnabled(tenantId)) access = 'seller';

  if (!tenantId || !enabled || !access) {
    return (
      <div className="py-20 text-center text-slate-400">
        <Lock className="w-8 h-8 mx-auto mb-2" />
        <p className="text-xs font-semibold">O módulo Atacado não está disponível para este usuário.</p>
      </div>
    );
  }

  return <Workspace key={`${tenantId}:${access}`} tenantId={tenantId} access={access} />;
};

export default WholesaleApp;
