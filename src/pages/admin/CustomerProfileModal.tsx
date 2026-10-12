// ============================================================================
// CONTROLPHONE — PERFIL DO CLIENTE (DADOS | GARANTIAS | HISTÓRICO)
// Tudo é lido dos registros originais (vendas, garantias, OS, trocas, créditos).
// ============================================================================

import React, { useState } from 'react';
import { Users, X, ShieldCheck, Pencil } from 'lucide-react';
import { store } from '../../lib/store';
import { Customer } from '../../types';
import { WarrantyDetailModal } from '../../components/shared/WarrantyDetailModal';
import { WARRANTY_STATUS_META, formatDay, getWarrantyStatus } from '../../lib/warrantyStatus';

type Tab = 'data' | 'warranties' | 'history';

const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1';
const boxCls = 'bg-slate-50 rounded-xl p-3 border border-slate-100';
const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

const RETURN_LABELS = { exchange: 'Troca', refund: 'Devolução com reembolso', credit: 'Devolução com crédito' };
const RETURN_STATUS = {
  open: 'Aberta', in_review: 'Em análise', approved: 'Aprovada', rejected: 'Recusada', completed: 'Concluída', cancelled: 'Cancelada'
};

export const CustomerProfileModal: React.FC<{ customer: Customer; onClose: () => void; onEdit?: (customer: Customer) => void }> = ({ customer, onClose, onEdit }) => {
  const [tab, setTab] = useState<Tab>('data');
  const [warrantyId, setWarrantyId] = useState<string | null>(null);

  const tenantId = customer.tenant_id;
  const warranties = store.warranties
    .filter(w => w.tenant_id === tenantId && w.customer_id === customer.id)
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
  const statuses = warranties.map(getWarrantyStatus);
  const summary = [
    { label: 'Total de Garantias', value: warranties.length },
    { label: 'Ativas', value: statuses.filter(s => s === 'active' || s === 'expiring').length },
    { label: 'Vencidas', value: statuses.filter(s => s === 'expired').length },
    { label: 'A Vencer', value: statuses.filter(s => s === 'expiring').length }
  ];

  const sales = store.sales
    .filter(s => s.tenant_id === tenantId && s.customer_id === customer.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const orders = store.serviceOrders.filter(o => o.tenant_id === tenantId && o.customer_id === customer.id);
  const returns = store.returnRequests.filter(r => r.tenant_id === tenantId && r.customer_id === customer.id);
  const credits = store.customerCredits.filter(c => c.tenant_id === tenantId && c.customer_id === customer.id);
  const creditBalance = store.getCustomerCreditBalance(tenantId, customer.id);

  const deviceLabel = (id?: string) => {
    const d = store.devices.find(x => x.id === id);
    return d ? `${d.brand} ${d.model}` : 'Aparelho';
  };

  const detailWarranty = warranties.find(w => w.id === warrantyId);
  if (detailWarranty) {
    return <WarrantyDetailModal warranty={detailWarranty} onClose={() => setWarrantyId(null)} hideCustomerLink />;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'data', label: 'Dados' },
    { id: 'warranties', label: `Garantias (${warranties.length})` },
    { id: 'history', label: 'Histórico' }
  ];

  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">{customer.name}</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Cliente desde {formatDay(customer.created_at)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(customer)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            <button onClick={onClose} aria-label="Fechar" className="text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto mb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'data' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className={boxCls}><span className={labelCls}>Telefone</span><span className="font-semibold text-slate-800">{customer.phone}</span></div>
            <div className={boxCls}><span className={labelCls}>WhatsApp</span><span className="font-semibold text-slate-800">{customer.whatsapp || 'Não informado'}</span></div>
            <div className={boxCls}><span className={labelCls}>E-mail</span><span className="font-semibold text-slate-800 break-all">{customer.email || 'Não informado'}</span></div>
            <div className={boxCls}><span className={labelCls}>CPF</span><span className="font-semibold text-slate-800">{customer.cpf || 'Não informado'}</span></div>
            <div className={boxCls}><span className={labelCls}>Nascimento</span><span className="font-semibold text-slate-800">{customer.birth_date ? formatDay(customer.birth_date) : 'Não informado'}</span></div>
            <div className={boxCls}><span className={labelCls}>Crédito Disponível</span><span className="font-bold text-slate-900">{formatBRL(creditBalance)}</span></div>
            <div className={`${boxCls} sm:col-span-2`}><span className={labelCls}>Endereço</span><span className="font-semibold text-slate-800">{customer.address || 'Não informado'}</span></div>
          </div>
        )}

        {tab === 'warranties' && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {summary.map((s) => (
                <div key={s.label} className="rounded-xl p-2.5 border border-slate-200">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">{s.label}</span>
                  <span className="text-base font-black text-slate-900">{s.value}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {warranties.map((w) => {
                const status = getWarrantyStatus(w);
                const device = store.devices.find(d => d.id === w.device_id);
                return (
                  <div key={w.id} className="rounded-xl border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 truncate">
                        {device ? `${device.brand} ${device.model}` : 'Aparelho'}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">IMEI: {w.imei}</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Compra: {formatDay(w.sale_date)} | Garantia comercial: {w.warranty_days} dias | Vencimento: {formatDay(w.end_date)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border ${WARRANTY_STATUS_META[status].cls}`}>
                        {WARRANTY_STATUS_META[status].label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setWarrantyId(w.id)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50 inline-flex items-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Visualizar Garantia
                      </button>
                    </div>
                  </div>
                );
              })}
              {warranties.length === 0 && (
                <p className="py-6 text-center text-slate-400 font-medium">Este cliente ainda não possui aparelhos com garantia registrada.</p>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Em "Visualizar Garantia" é possível abrir a venda original, o histórico do aparelho, iniciar assistência ou solicitar troca/devolução.
            </p>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-4 text-xs">
            <div>
              <span className={labelCls}>Compras ({sales.length})</span>
              <ul className="space-y-1.5">
                {sales.map((s) => (
                  <li key={s.id} className="rounded-xl border border-slate-200 p-2.5">
                    <div className="flex justify-between gap-2 font-semibold text-slate-800">
                      <span>Venda #{s.sale_number} — {formatDay(s.created_at)}{s.status === 'cancelled' && ' (cancelada)'}</span>
                      <span>{formatBRL(s.total_amount)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {(s.items || []).map(it =>
                        (it.item_type === 'device' ? deviceLabel(it.device_id) : store.accessories.find(a => a.id === it.accessory_id)?.name || 'Acessório') +
                        (it.returned_at ? ' (trocado/devolvido)' : '')
                      ).join(', ')}
                    </div>
                  </li>
                ))}
                {sales.length === 0 && <li className="text-slate-400">Nenhuma compra registrada.</li>}
              </ul>
            </div>

            <div>
              <span className={labelCls}>Assistências ({orders.length})</span>
              <ul className="space-y-1.5">
                {orders.map((o) => (
                  <li key={o.id} className="rounded-xl border border-slate-200 p-2.5 text-slate-700">
                    <span className="font-semibold text-slate-800">OS #{o.os_number}</span> — {o.device_brand} {o.device_model} | {formatDay(o.entered_at || o.created_at)}
                    <span className="block text-[11px] text-slate-500">{o.reported_defect}</span>
                  </li>
                ))}
                {orders.length === 0 && <li className="text-slate-400">Nenhuma assistência registrada.</li>}
              </ul>
            </div>

            <div>
              <span className={labelCls}>Trocas & Devoluções ({returns.length})</span>
              <ul className="space-y-1.5">
                {returns.map((r) => (
                  <li key={r.id} className="rounded-xl border border-slate-200 p-2.5 text-slate-700">
                    <span className="font-semibold text-slate-800">#{r.request_number} {RETURN_LABELS[r.resolution]}</span> — {deviceLabel(r.device_id)} | {RETURN_STATUS[r.status]}
                    <span className="block text-[11px] text-slate-500">{formatDay(r.created_at)} | {r.reason}</span>
                  </li>
                ))}
                {returns.length === 0 && <li className="text-slate-400">Nenhuma troca ou devolução registrada.</li>}
              </ul>
            </div>

            <div>
              <span className={labelCls}>Créditos — saldo disponível {formatBRL(creditBalance)}</span>
              <ul className="space-y-1.5">
                {credits.map((c) => (
                  <li key={c.id} className="rounded-xl border border-slate-200 p-2.5 text-slate-700">
                    Emitido em {formatDay(c.created_at)}: <b>{formatBRL(c.amount)}</b> | saldo <b>{formatBRL(c.balance)}</b>
                    {c.usages.map((u, idx) => (
                      <span key={idx} className="block text-[11px] text-slate-500">
                        Utilizado {formatBRL(u.amount)} em {formatDay(u.at)} (venda #{store.sales.find(s => s.id === u.sale_id)?.sale_number})
                      </span>
                    ))}
                  </li>
                ))}
                {credits.length === 0 && <li className="text-slate-400">Nenhum crédito emitido.</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
