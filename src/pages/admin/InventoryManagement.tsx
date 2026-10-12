// ============================================================================
// CONTROLPHONE — ESTOQUE (APARELHOS + ACESSÓRIOS & BRINDES EM UMA ÚNICA ABA)
// ============================================================================

import React, { useState } from 'react';
import { Smartphone, Package } from 'lucide-react';
import { InventoryDevices } from './InventoryDevices';
import { InventoryAccessories } from './InventoryAccessories';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';

type InventoryTab = 'devices' | 'accessories';

export const InventoryManagement: React.FC = () => {
  const [tab, setTab] = useState<InventoryTab>('devices');
  const { currentTenant } = useAuth();
  const features = store.getTenantFeatures(currentTenant?.id);
  const extrasEnabled = features.accessories || features.gifts;
  const extrasLabel = [features.accessories && 'Acessórios', features.gifts && 'Brindes'].filter(Boolean).join(' & ');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* SUB-NAVEGAÇÃO DO ESTOQUE */}
      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto">
        <button
          onClick={() => setTab('devices')}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            tab === 'devices'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          Aparelhos
        </button>
        {extrasEnabled && (
        <button
          onClick={() => setTab('accessories')}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
            tab === 'accessories'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          {extrasLabel}
        </button>
        )}
      </div>

      {tab === 'devices' || !extrasEnabled ? <InventoryDevices /> : <InventoryAccessories />}
    </div>
  );
};
