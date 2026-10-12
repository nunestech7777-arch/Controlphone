// ============================================================================
// CONTROLPHONE — GARANTIAS COMERCIAIS (UMA POR APARELHO VENDIDO)
// Os dados de cliente, venda e aparelho vêm dos cadastros originais (sem duplicação).
// ============================================================================

import React, { useState } from 'react';
import { ShieldCheck, Search, Eye } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { consumeIntent } from '../../lib/navIntent';
import { WarrantyDetailModal } from '../../components/shared/WarrantyDetailModal';
import {
  CDC_NOTICE,
  WARRANTY_STATUS_META,
  WarrantyDisplayStatus,
  formatDay,
  getWarrantyStatus
} from '../../lib/warrantyStatus';

type Filter = 'all' | WarrantyDisplayStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'active', label: 'Ativas' },
  { id: 'expiring', label: 'A vencer' },
  { id: 'expired', label: 'Vencidas' },
  { id: 'cancelled', label: 'Canceladas' }
];

export const WarrantiesManagement: React.FC<{ viewId?: string }> = ({ viewId = 'admin-warranties' }) => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [filter, setFilter] = useState<Filter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [detailId, setDetailId] = useState<string | null>(
    () => consumeIntent(viewId, 'view-warranty')?.warrantyId || null
  );

  const warranties = store.warranties.filter(w => w.tenant_id === tenantId);

  const rows = warranties
    .map(w => {
      const customer = store.customers.find(c => c.id === w.customer_id);
      const device = store.devices.find(d => d.id === w.device_id);
      const sale = store.sales.find(s => s.id === w.sale_id);
      return { w, customer, device, sale, status: getWarrantyStatus(w) };
    })
    .filter(r => filter === 'all' || r.status === filter || (filter === 'active' && r.status === 'expiring'))
    .filter(r => {
      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (
        (r.customer?.name || '').toLowerCase().includes(term) ||
        String(r.sale?.sale_number || '').includes(term) ||
        (r.device ? `${r.device.brand} ${r.device.model}`.toLowerCase() : '').includes(term) ||
        r.w.imei.includes(term)
      );
    })
    .sort((a, b) => b.w.sale_date.localeCompare(a.w.sale_date));

  const countOf = (f: Filter) =>
    f === 'all'
      ? warranties.length
      : warranties.filter(w => {
          const st = getWarrantyStatus(w);
          return st === f || (f === 'active' && st === 'expiring');
        }).length;

  const detail = warranties.find(w => w.id === detailId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          Garantias
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Garantia comercial individual de cada aparelho vendido. {CDC_NOTICE}
        </p>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Cliente, Nº da Venda, Modelo ou IMEI..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                filter === f.id ? 'bg-[#0B0F17] text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label} ({countOf(f.id)})
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 whitespace-nowrap">Nº Venda</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Cliente</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Aparelho</th>
                <th className="py-3.5 px-4 whitespace-nowrap">IMEI</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Data da Compra</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Prazo Comercial</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Vencimento</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center">Situação</th>
                <th className="py-3.5 pl-2 pr-4 w-10"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ w, customer, device, sale, status }) => (
                <tr key={w.id} onClick={() => setDetailId(w.id)} className="hover:bg-slate-50/80 transition-colors cursor-pointer">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                    {sale ? `#${sale.sale_number}` : 'Upgrade'}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="max-w-[170px] truncate" title={customer?.name}>{customer?.name || 'Cliente'}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800 whitespace-nowrap">{device ? `${device.brand} ${device.model}` : 'Aparelho'}</div>
                    {device && <div className="text-[11px] text-slate-500 whitespace-nowrap">{device.storage_capacity} - {device.color}</div>}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">{w.imei}</td>
                  <td className="py-3.5 px-4 whitespace-nowrap">{formatDay(w.sale_date)}</td>
                  <td className="py-3.5 px-4 text-right font-semibold text-slate-700 whitespace-nowrap">{w.warranty_days} dias</td>
                  <td className="py-3.5 px-4 whitespace-nowrap">{formatDay(w.end_date)}</td>
                  <td className="py-3.5 px-4 text-center">
                    <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border ${WARRANTY_STATUS_META[status].cls}`}>
                      {WARRANTY_STATUS_META[status].label}
                    </span>
                  </td>
                  <td className="py-3.5 pl-2 pr-4 text-right">
                    <button
                      type="button"
                      title="Visualizar garantia"
                      aria-label="Visualizar garantia"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    Nenhuma garantia encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detail && <WarrantyDetailModal warranty={detail} onClose={() => setDetailId(null)} />}
    </div>
  );
};
