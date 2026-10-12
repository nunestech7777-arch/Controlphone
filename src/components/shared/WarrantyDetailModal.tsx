// ============================================================================
// CONTROLPHONE — DETALHES DA GARANTIA COMERCIAL (usado em Garantias e no perfil do cliente)
// ============================================================================

import React from 'react';
import { ShieldCheck, X, ShoppingBag, Users, Wrench, RotateCcw } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Warranty } from '../../types';
import { navigateTo } from '../../lib/navIntent';
import {
  CDC_NOTICE,
  WARRANTY_STATUS_META,
  formatDay,
  getDaysRemaining,
  getWarrantyStatus
} from '../../lib/warrantyStatus';

interface WarrantyDetailModalProps {
  warranty: Warranty;
  onClose: () => void;
  /** Oculta "Ver Cliente" quando o modal já está aberto dentro do perfil do cliente */
  hideCustomerLink?: boolean;
}

const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1';
const boxCls = 'bg-slate-50 rounded-xl p-3 border border-slate-100';

export const WarrantyDetailModal: React.FC<WarrantyDetailModalProps> = ({ warranty, onClose, hideCustomerLink }) => {
  const { currentUser, isSupportMode } = useAuth();
  const isManager = currentUser.role === 'admin' || isSupportMode;
  const isSeller = currentUser.role === 'seller' && !isSupportMode;

  const customer = store.customers.find(c => c.id === warranty.customer_id);
  const device = store.devices.find(d => d.id === warranty.device_id);
  const sale = store.sales.find(s => s.id === warranty.sale_id);
  const saleItem = sale?.items?.find(it => it.id === warranty.sale_item_id);
  const status = getWarrantyStatus(warranty);
  const meta = WARRANTY_STATUS_META[status];
  const remaining = getDaysRemaining(warranty);

  const relatedOrders = store.serviceOrders.filter(
    o => o.tenant_id === warranty.tenant_id && (o.warranty_id === warranty.id || (o.imei && o.imei === warranty.imei && o.origin === 'external'))
  );
  const relatedReturns = store.returnRequests.filter(
    r => r.tenant_id === warranty.tenant_id && (r.device_id === warranty.device_id || r.new_device_id === warranty.device_id)
  );
  const replaces = store.warranties.find(w => w.id === warranty.replaces_warranty_id);
  const replacedBy = store.warranties.find(w => w.id === warranty.replaced_by_warranty_id);

  const canOpenReturn =
    Boolean(sale && saleItem && !saleItem.returned_at && sale.status === 'completed') && warranty.status === 'active';

  const go = (view: string, intent: Parameters<typeof navigateTo>[1]) => {
    onClose();
    navigateTo(view, intent);
  };

  const actionBtn = 'px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50 inline-flex items-center gap-1.5';

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">Garantia — {device ? `${device.brand} ${device.model}` : 'Aparelho'}</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5 font-mono">IMEI {warranty.imei}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border ${meta.cls}`}>
              {meta.label}
            </span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 text-xs">
          {/* CLIENTE E APARELHO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={boxCls}>
              <span className={labelCls}>Cliente</span>
              <span className="block font-semibold text-slate-800">{customer?.name || 'Cliente'}</span>
              <span className="block text-slate-500">{customer?.phone || 'Telefone não informado'}</span>
              {customer?.cpf && <span className="block text-slate-500">CPF: {customer.cpf}</span>}
            </div>
            <div className={boxCls}>
              <span className={labelCls}>Aparelho</span>
              <span className="block font-semibold text-slate-800">
                {device ? `${device.brand} ${device.model} (${device.storage_capacity} - ${device.color})` : 'Aparelho'}
              </span>
              <span className="block text-slate-500">
                {sale ? `Venda #${sale.sale_number}` : 'Venda por upgrade'} | Compra em {formatDay(warranty.sale_date)}
              </span>
            </div>
          </div>

          {/* GARANTIA */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-3 border border-slate-200">
              <span className={labelCls}>Prazo</span>
              <span className="font-bold text-slate-900">{warranty.warranty_days} dias</span>
            </div>
            <div className="rounded-xl p-3 border border-slate-200">
              <span className={labelCls}>Início</span>
              <span className="font-semibold text-slate-700">{formatDay(warranty.start_date)}</span>
            </div>
            <div className="rounded-xl p-3 border border-slate-200">
              <span className={labelCls}>Vencimento</span>
              <span className="font-semibold text-slate-700">{formatDay(warranty.end_date)}</span>
            </div>
            <div className="rounded-xl p-3 border border-slate-200">
              <span className={labelCls}>Dias Restantes</span>
              <span className="font-bold text-slate-900">
                {warranty.status === 'cancelled' ? '—' : remaining >= 0 ? remaining : `Vencida há ${Math.abs(remaining)}`}
              </span>
            </div>
          </div>

          <div>
            <span className={labelCls}>Condições Registradas</span>
            <p className="text-slate-600 leading-relaxed">{warranty.terms}</p>
            <p className="text-[11px] text-slate-400 mt-1">{CDC_NOTICE}</p>
            {warranty.cancel_reason && (
              <p className="text-[11px] font-semibold text-rose-600 mt-1">Cancelamento: {warranty.cancel_reason}</p>
            )}
          </div>

          {(replaces || replacedBy) && (
            <div className={boxCls}>
              <span className={labelCls}>Vínculo de Troca</span>
              {replaces && <span className="block text-slate-700">Substituiu o aparelho de IMEI <b className="font-mono">{replaces.imei}</b></span>}
              {replacedBy && <span className="block text-slate-700">Substituído pelo aparelho de IMEI <b className="font-mono">{replacedBy.imei}</b></span>}
            </div>
          )}

          {/* HISTÓRICO */}
          <div>
            <span className={`${labelCls} mb-2`}>Histórico</span>
            <ol className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {warranty.history.map((ev, idx) => (
                <li key={idx} className="flex items-start gap-3 text-[11px]">
                  <span className="font-mono text-slate-400 shrink-0 w-[70px]">{formatDay(ev.at)}</span>
                  <span className="text-slate-700 min-w-0">
                    {ev.description}
                    {ev.user_name && <span className="text-slate-400"> — {ev.user_name}</span>}
                    {ev.notes && <span className="block text-slate-400">{ev.notes}</span>}
                  </span>
                </li>
              ))}
              {relatedOrders.map((o) => (
                <li key={o.id} className="flex items-start gap-3 text-[11px]">
                  <span className="font-mono text-slate-400 shrink-0 w-[70px]">{formatDay(o.entered_at || o.created_at)}</span>
                  <span className="text-slate-700 min-w-0">
                    Assistência OS #{o.os_number}: {o.reported_defect}
                    {o.warranty_analysis && o.warranty_analysis !== 'pending' && (
                      <span className="text-slate-400"> — análise: {o.warranty_analysis === 'covered' ? 'coberto' : 'não coberto'}</span>
                    )}
                  </span>
                </li>
              ))}
              {relatedReturns.map((r) => (
                <li key={r.id} className="flex items-start gap-3 text-[11px]">
                  <span className="font-mono text-slate-400 shrink-0 w-[70px]">{formatDay(r.created_at)}</span>
                  <span className="text-slate-700 min-w-0">
                    {r.resolution === 'exchange' ? 'Troca' : r.resolution === 'refund' ? 'Devolução com reembolso' : 'Devolução com crédito'} #{r.request_number}: {r.reason}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* AÇÕES CONTEXTUAIS */}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
            {isManager && sale && (
              <button type="button" onClick={() => go('admin-sales', { type: 'view-sale', saleNumber: sale.sale_number })} className={actionBtn}>
                <ShoppingBag className="w-3.5 h-3.5" /> Ver Venda
              </button>
            )}
            {isManager && !hideCustomerLink && (
              <button type="button" onClick={() => go('admin-customers', { type: 'view-customer', customerId: warranty.customer_id })} className={actionBtn}>
                <Users className="w-3.5 h-3.5" /> Ver Cliente
              </button>
            )}
            {isManager && device && (
              <button
                type="button"
                onClick={() => go('admin-service-orders', {
                  type: 'new-external-assistance', customerId: warranty.customer_id, brand: device.brand, model: device.model,
                  storage: device.storage_capacity, color: device.color, imei: warranty.imei, warrantyId: warranty.id, saleId: warranty.sale_id
                })}
                className={actionBtn}
              >
                <Wrench className="w-3.5 h-3.5" /> Solicitar Assistência
              </button>
            )}
            {canOpenReturn && sale && (
              <button
                type="button"
                onClick={() => go(isSeller ? 'seller-returns' : 'admin-returns', { type: 'new-return', saleId: sale.id, saleItemId: warranty.sale_item_id })}
                className="btn-tenant-primary px-4 py-2 rounded-xl font-bold text-[11px] inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Nova Troca ou Devolução
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
