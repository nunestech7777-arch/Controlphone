// ============================================================================
// CONTROLPHONE — GESTÃO DE UPGRADES (TRADE-IN) & RASTREABILIDADE
// ============================================================================

import React from 'react';
import { RefreshCw, ArrowRight, Smartphone, ShieldCheck } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { formatBRL } from '../../lib/labels';

export const TradeInsManagement: React.FC = () => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const tradeIns = store.tradeIns.filter(t => t.tenant_id === tenantId);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-indigo-600" />
          Upgrades Realizados (Aparelhos Usados Recebidos)
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Rastreabilidade de aparelhos recebidos como parte do pagamento e entradas automáticas no estoque.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Data</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Vendedor</th>
                <th className="py-3.5 px-4">Aparelho Vendido (Loja)</th>
                <th className="py-3.5 px-4">Aparelho Recebido (Usado)</th>
                <th className="py-3.5 px-4">Avaliação Usado (Custo)</th>
                <th className="py-3.5 px-4">Preço Venda</th>
                <th className="py-3.5 px-4 font-bold text-slate-900">Diferença Paga</th>
                <th className="py-3.5 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tradeIns.map((item) => {
                const customer = store.customers.find(c => c.id === item.customer_id);
                const seller = store.profiles.find(p => p.id === item.seller_id);
                const soldDevice = store.devices.find(d => d.id === item.sold_device_id);
                const receivedDevice = store.devices.find(d => d.id === item.received_device_id);

                return (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 text-slate-500">
                      {new Date(item.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      {customer?.name || 'Cliente'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {seller?.full_name || 'Vendedor'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">
                        {soldDevice ? `${soldDevice.brand} ${soldDevice.model}` : 'Aparelho'}
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">
                        IMEI: {soldDevice?.imei}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 bg-purple-50/30">
                      <div className="font-bold text-purple-900">
                        {receivedDevice ? `${receivedDevice.brand} ${receivedDevice.model}` : 'Aparelho Recebido'}
                      </div>
                      <span className="text-[10px] font-mono text-purple-700">
                        IMEI: {receivedDevice?.imei}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-purple-700">
                      {formatBRL(Number(item.appraisal_value))}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">
                      {formatBRL(Number(item.sold_device_price))}
                    </td>
                    <td className="py-3.5 px-4 font-black text-emerald-700">
                      {formatBRL(Number(item.difference_amount))}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Concluído
                      </span>
                    </td>
                  </tr>
                );
              })}
              {tradeIns.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    Nenhum upgrade realizado nesta loja.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
