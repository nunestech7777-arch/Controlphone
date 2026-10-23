// ============================================================================
// CONTROLPHONE — DETALHES COMPLETOS DA VENDA (OU UPGRADE)
// Abas: Visão Geral | Produtos | Pagamentos | Upgrade | Garantia | Histórico.
// Administrador vê custo, lucro e margem; vendedor vê só as próprias vendas, sem esses dados.
// ============================================================================

import React, { useState } from 'react';
import { ShoppingBag, X, FileText, ExternalLink, Trash2, FileDown, ShieldCheck } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { Sale, DeviceStatus } from '../../types';
import { SaleDocumentsMenu } from './SaleDocumentsMenu';
import { saleHasAppleWarranty } from '../../lib/pdf/appleWarrantyPDF';
import { SALE_DOCUMENTS, appleWarrantyDocumentFor, getSaleContext, receiptDocumentFor, runDocumentAction } from '../../lib/pdf/saleDocuments';
import { navigateTo } from '../../lib/navIntent';
import { CDC_NOTICE, WARRANTY_STATUS_META, formatDay, getDaysRemaining, getWarrantyStatus } from '../../lib/warrantyStatus';
import { InspectionSummary } from './InspectionSummary';
import { saleInterest, saleRevenue } from '../../lib/saleFinance';

type DetailTab = 'overview' | 'products' | 'payments' | 'upgrade' | 'warranty' | 'history';

interface SaleDetailModalProps {
  sale: Sale;
  onClose: () => void;
  /** Fornecido pela tela de Vendas (administrador) para abrir o fluxo de exclusão */
  onDelete?: () => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  trade_in_credit: 'Crédito de Upgrade',
  store_credit: 'Crédito da Loja',
  other: 'Outro'
};

const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  available: 'Disponível no estoque',
  reserved: 'Reservado',
  in_maintenance: 'Em manutenção',
  sold: 'Vendido',
  decommissioned: 'Baixado',
  awaiting_evaluation: 'Aguardando avaliação'
};

const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1';
const boxCls = 'bg-slate-50 rounded-xl p-3 border border-slate-100';
const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dateTime = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const customerSince = (iso: string) => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days < 30) return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  if (days < 365) { const m = Math.floor(days / 30); return `${m} ${m === 1 ? 'mês' : 'meses'}`; }
  const y = Math.floor(days / 365); return `${y} ${y === 1 ? 'ano' : 'anos'}`;
};

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({ sale, onClose, onDelete }) => {
  const { currentUser, currentTenant, currentTheme, isSupportMode } = useAuth();
  const isAdmin = currentUser.role === 'admin' || isSupportMode;
  const [tab, setTab] = useState<DetailTab>('overview');
  const [notice, setNotice] = useState('');

  // Upgrade é uma venda comum com um aparelho recebido como parte do pagamento
  const tradeIn = sale.trade_in_id ? store.tradeIns.find(t => t.id === sale.trade_in_id) : undefined;
  const isUpgrade = Boolean(tradeIn);
  const record = sale;

  // Vendedor só consulta as próprias vendas
  const sellerId = sale.seller_id;
  if (!isAdmin && sellerId !== currentUser.id) return null;

  const tenantId = record.tenant_id;
  const customer = store.customers.find(c => c.id === record.customer_id);
  const seller = store.profiles.find(p => p.id === sellerId);
  const createdAt = record.created_at;
  const cancelled = sale.status === 'cancelled';
  const title = `Venda #${sale.sale_number}`;

  const deviceOf = (id?: string) => store.devices.find(d => d.id === id);
  const deviceName = (id?: string) => {
    const d = deviceOf(id);
    return d ? `${d.brand} ${d.model}` : 'Aparelho';
  };

  // --- itens ---
  const saleItems = sale.items || [];
  const deviceItems = saleItems.filter(it => it.item_type === 'device');
  const accessoryItems = saleItems.filter(it => it.item_type === 'accessory');
  const gifts = sale.gifts || [];

  const upgradeReceived = tradeIn ? deviceOf(tradeIn.received_device_id) : undefined;

  // --- valores ---
  // valor dos produtos x juros da maquininha x faturamento (lib/saleFinance): o lucro é só dos produtos
  const totalAmount = Number(sale.total_amount);
  const interest = saleInterest(sale);
  const revenue = saleRevenue(sale);
  const costTotal = Number(sale.total_cost);
  const profit = totalAmount - costTotal;
  const margin = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

  const payments = sale.payments || [];
  const paymentsSum = payments.reduce((a, p) => a + Number(p.amount), 0);
  const change = Math.max(0, Math.round((paymentsSum - revenue) * 100) / 100);

  // --- cliente ---
  const customerSales = store.sales.filter(s => s.tenant_id === tenantId && s.customer_id === record.customer_id && s.status === 'completed');
  const customerTotal = customerSales.reduce((a, s) => a + saleRevenue(s), 0);

  // --- garantia ---
  const warranties = store.warranties
    .filter(w => w.sale_id === sale.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // --- linha do tempo ---
  type Ev = { at: string; text: string; user?: string; note?: string };
  const events: Ev[] = [];
  const userName = (id?: string) => store.profiles.find(p => p.id === id)?.full_name;
  if (sale) {
    events.push({ at: sale.created_at, text: `Venda #${sale.sale_number} criada`, user: seller?.full_name });
    if (sale.apple_warranty) {
      events.push({
        at: sale.apple_warranty.presented_at,
        text: `Termo de Garantia Apple (1 ano) apresentado — versão ${sale.apple_warranty.version}`,
        user: userName(sale.apple_warranty.presented_by),
        note: sale.apple_warranty.acknowledged_at ? 'Ciência do cliente registrada' : undefined
      });
    }
    if (payments.length > 0) {
      events.push({
        at: payments[0].received_at || sale.created_at,
        text: `Pagamento registrado: ${payments.map(p => `${PAYMENT_LABELS[p.payment_method] || p.payment_method} ${brl(p.amount)}`).join(' + ')}`,
        user: seller?.full_name
      });
    }
    deviceItems.forEach(it => {
      const mov = store.deviceMovements.find(m => m.device_id === it.device_id && m.movement_type === 'sold' && m.created_at >= sale.created_at.slice(0, 10));
      events.push({
        at: mov?.created_at || sale.created_at,
        text: `Estoque baixado: ${deviceName(it.device_id)} (IMEI ${deviceOf(it.device_id)?.imei || '—'})`,
        user: mov?.user_name || seller?.full_name
      });
    });
    accessoryItems.forEach(it => {
      events.push({
        at: sale.created_at,
        text: `Estoque baixado: ${store.accessories.find(a => a.id === it.accessory_id)?.name || 'Acessório'} (${it.quantity} un.)`,
        user: seller?.full_name
      });
    });
    if (tradeIn) {
      events.push({
        at: sale.created_at,
        text: `Upgrade: aparelho recebido (IMEI ${upgradeReceived?.imei || '—'}) entrou no estoque com custo de ${brl(tradeIn.appraisal_value)}`,
        user: seller?.full_name
      });
    }
  }
  warranties.forEach(w => {
    w.history.forEach(h => events.push({ at: h.at, text: h.description, user: h.user_name, note: h.notes }));
  });
  (sale.adjustments || []).forEach(a => {
    events.push({ at: a.created_at, text: a.description, user: userName(a.created_by) });
  });
  store.returnRequests.filter(r => r.sale_id === sale.id).forEach(r => {
    r.history.forEach(h => events.push({ at: h.at, text: `Troca/devolução #${r.request_number}: ${h.description}`, user: h.user_name, note: h.notes }));
  });
  if (cancelled && sale.cancelled_at) {
    events.push({ at: sale.cancelled_at, text: 'Venda cancelada', user: userName(sale.cancelled_by), note: sale.cancellation_reason });
  }
  store.auditLogs
    .filter(l => l.record_id === sale.id && l.action !== 'VENDA_FINALIZADA' && l.action !== 'VENDA_CANCELADA')
    .forEach(l => events.push({ at: l.created_at, text: `Alteração: ${l.action.replace(/_/g, ' ').toLowerCase()}`, user: userName(l.user_id) }));
  events.sort((a, b) => a.at.localeCompare(b.at));

  // --- documentos ---
  const openWarrantyTerm = () => {
    if (!currentTenant) return;
    const def = SALE_DOCUMENTS.find(d => d.id === 'warranty-term');
    if (def) void runDocumentAction(def, getSaleContext(sale, currentTenant, currentTheme), 'view');
  };

  const openCustomer = () => {
    if (!isAdmin || !customer) return;
    onClose();
    navigateTo('admin-customers', { type: 'view-customer', customerId: customer.id });
  };

  const tabs: { id: DetailTab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Visão Geral', show: true },
    { id: 'products', label: 'Produtos', show: true },
    { id: 'payments', label: 'Pagamentos', show: true },
    { id: 'upgrade', label: 'Upgrade', show: isUpgrade },
    { id: 'warranty', label: `Garantia${warranties.length ? ` (${warranties.length})` : ''}`, show: true },
    { id: 'history', label: 'Histórico', show: true }
  ];

  const statusBadge = cancelled ? (
    <span className="inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-rose-50 text-rose-700 border-rose-200">{sale.deleted_at ? 'Excluída' : 'Cancelada'}</span>
  ) : (
    <span className="inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">Concluída</span>
  );


  return (
    <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full shadow-2xl animate-fade-in max-h-[92vh] flex flex-col overflow-hidden">
        {/* CABEÇALHO FIXO */}
        <div className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-blue-600 shrink-0" />
              <span className="truncate">{title}</span>
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {dateTime(createdAt)} | {customer?.name || 'Cliente Balcão'} | {seller?.full_name || 'Vendedor'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isUpgrade && (
              <span className="inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-purple-50 text-purple-700 border-purple-200">Upgrade</span>
            )}
            {statusBadge}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="shrink-0 px-6 pt-4">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto">
            {tabs.filter(t => t.show).map((t) => (
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
        </div>

        {/* CONTEÚDO COM ROLAGEM */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 text-xs space-y-5">
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={boxCls}><span className={labelCls}>Nº da Venda</span><span className="font-mono font-bold text-slate-800">#{sale.sale_number}</span></div>
                <div className={boxCls}><span className={labelCls}>Data e Horário</span><span className="font-semibold text-slate-800">{dateTime(createdAt)}</span></div>
                <div className={boxCls}><span className={labelCls}>Tipo</span><span className="font-semibold text-slate-800">{isUpgrade ? 'Upgrade (aparelho recebido na troca)' : 'Venda normal'}</span></div>
                <div className={boxCls}><span className={labelCls}>Status</span><span className="font-semibold text-slate-800">{cancelled ? (sale.deleted_at ? 'Excluída' : 'Cancelada') : 'Concluída'}</span></div>
                <div className={boxCls}><span className={labelCls}>Vendedor Responsável</span><span className="font-semibold text-slate-800">{seller?.full_name || '—'}</span></div>
                <div className={boxCls}><span className={labelCls}>Origem da Venda</span><span className="font-semibold text-slate-800">{sale.sales_origin || 'Não informada'}</span></div>
                {interest > 0 && (
                  <>
                    <div className={boxCls}><span className={labelCls}>Valor dos Produtos</span><span className="font-semibold text-slate-800">{brl(totalAmount)}</span></div>
                    <div className={boxCls}><span className={labelCls}>Juros da Maquininha</span><span className="font-semibold text-slate-800">{brl(interest)}</span></div>
                  </>
                )}
                <div className={boxCls}><span className={labelCls}>{interest > 0 ? 'Faturamento' : 'Total'}</span><span className="font-black text-slate-900">{brl(revenue)}</span></div>
                <div className={boxCls}>
                  <span className={labelCls}>Pagamento</span>
                  <span className="font-semibold text-slate-800">
                    {payments.map(p => PAYMENT_LABELS[p.payment_method] || p.payment_method).join(' + ') || '—'}
                  </span>
                </div>
              </div>

              {cancelled && (
                <div className="rounded-xl p-3 border border-rose-200 bg-rose-50 text-rose-700">
                  <span className="font-bold">Venda {sale.deleted_at ? 'excluída' : 'cancelada'} em {dateTime(sale.cancelled_at)}</span>
                  {sale.cancellation_reason && <span className="block">Motivo: {sale.cancellation_reason}</span>}
                  {sale.deleted_at && sale.deletion_return_pending && (
                    <span className="block font-semibold">Aparelho ainda com o cliente: confirme o retorno físico em Vendas Excluídas.</span>
                  )}
                </div>
              )}

              {/* CLIENTE */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={labelCls}>Cliente</span>
                  {isAdmin && customer && (
                    <button onClick={openCustomer} className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">
                      Abrir cadastro completo <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <span className={labelCls}>Nome</span>
                    {isAdmin && customer ? (
                      <button onClick={openCustomer} className="font-bold text-blue-600 hover:underline text-left">{customer.name}</button>
                    ) : (
                      <span className="font-bold text-slate-800">{customer?.name || 'Cliente Balcão'}</span>
                    )}
                  </div>
                  <div><span className={labelCls}>Telefone</span><span className="font-semibold text-slate-800">{customer?.phone || '—'}</span></div>
                  <div><span className={labelCls}>WhatsApp</span><span className="font-semibold text-slate-800">{customer?.whatsapp || '—'}</span></div>
                  <div><span className={labelCls}>E-mail</span><span className="font-semibold text-slate-800 break-all">{customer?.email || '—'}</span></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                  <div><span className={labelCls}>Cliente há</span><span className="font-semibold text-slate-800">{customer ? customerSince(customer.created_at) : '—'}</span></div>
                  <div><span className={labelCls}>Compras Concluídas</span><span className="font-semibold text-slate-800">{customerSales.length}</span></div>
                  <div><span className={labelCls}>Total Comprado na Loja</span><span className="font-semibold text-slate-800">{brl(customerTotal)}</span></div>
                </div>
              </div>

              {/* RESUMO INTERNO: SOMENTE ADMINISTRADOR */}
              {isAdmin && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <span className={labelCls}>Resumo Financeiro Interno (restrito ao administrador)</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-1">
                    <div className={boxCls}><span className={labelCls}>Custo Acumulado</span><span className="font-semibold text-slate-800">{brl(costTotal)}</span></div>
                    <div className={boxCls}>
                      <span className={labelCls}>Lucro Bruto</span>
                      <span className="font-bold text-emerald-600">{cancelled ? '—' : brl(profit)}</span>
                      {interest > 0 && <span className="block text-[10px] text-slate-400">Sem os juros da maquininha</span>}
                    </div>
                    <div className={boxCls}><span className={labelCls}>Margem</span><span className="font-semibold text-slate-800">{cancelled ? '—' : `${margin.toFixed(1)}%`}</span></div>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'products' && (
            <>
              <div>
                <span className={`${labelCls} mb-2`}>Aparelhos</span>
                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full min-w-[820px] text-left text-xs">
                    <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-3">Produto / Modelo</th>
                        <th className="py-3 px-3">IMEI</th>
                        <th className="py-3 px-3">Cor</th>
                        <th className="py-3 px-3">Armaz.</th>
                        <th className="py-3 px-3 text-right">Qtd</th>
                        <th className="py-3 px-3 text-right">Unitário</th>
                        <th className="py-3 px-3 text-right">Desconto</th>
                        <th className="py-3 px-3 text-right">Final</th>
                        {isAdmin && <th className="py-3 px-3 text-right">Custo</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deviceItems.map((it) => {
                        const d = deviceOf(it.device_id);
                        return (
                          <tr key={it.id}>
                            <td className="py-3 px-3">
                              <div className="font-bold text-slate-800">{d ? `${d.brand} ${d.model}` : 'Aparelho'}</div>
                              {it.returned_at && <div className="text-[10px] font-semibold text-rose-600">Trocado/devolvido em {formatDay(it.returned_at)}</div>}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">{d?.imei || '—'}</td>
                            <td className="py-3 px-3">{d?.color || '—'}</td>
                            <td className="py-3 px-3 whitespace-nowrap">{d?.storage_capacity || '—'}</td>
                            <td className="py-3 px-3 text-right">{it.quantity}</td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">{brl(it.unit_price)}</td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">{brl(it.discount)}</td>
                            <td className="py-3 px-3 text-right font-bold text-slate-900 whitespace-nowrap">{brl(it.total_price)}</td>
                            {isAdmin && <td className="py-3 px-3 text-right whitespace-nowrap text-slate-500">{brl(it.unit_cost)}</td>}
                          </tr>
                        );
                      })}
                      {deviceItems.length === 0 && (
                        <tr><td colSpan={isAdmin ? 9 : 8} className="py-6 text-center text-slate-400">Nenhum aparelho nesta venda.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {deviceItems.filter(it => it.inspection).map(it => (
                <InspectionSummary
                  key={`vistoria-${it.id}`}
                  inspection={it.inspection!}
                  title={`Vistoria do aparelho ${deviceOf(it.device_id) ? `${deviceOf(it.device_id)!.brand} ${deviceOf(it.device_id)!.model}` : ''}`.trim()}
                />
              ))}

              {accessoryItems.length > 0 && (
                <div>
                  <span className={`${labelCls} mb-2`}>Acessórios</span>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {accessoryItems.map((it) => {
                      const acc = store.accessories.find(a => a.id === it.accessory_id);
                      return (
                        <div key={it.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <span className="font-semibold text-slate-800 min-w-0 truncate">{acc?.name || 'Acessório'} <span className="text-slate-400 font-normal">x{it.quantity}</span></span>
                          <span className="font-bold text-slate-900 whitespace-nowrap">{brl(it.total_price)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {gifts.length > 0 && (
                <div>
                  <span className={`${labelCls} mb-2`}>Brindes (cortesia)</span>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {gifts.map((g) => {
                      const gift = store.gifts.find(x => x.id === g.gift_id);
                      return (
                        <div key={g.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <span className="font-semibold text-slate-800 min-w-0 truncate">{gift?.name || 'Brinde'} <span className="text-slate-400 font-normal">x{g.quantity}</span></span>
                          <span className="font-bold text-slate-500 whitespace-nowrap">{isAdmin ? `Custo ${brl(g.unit_cost * g.quantity)}` : 'Cortesia'}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {sale && (
                <div className="flex flex-col items-end gap-0.5 text-slate-600">
                  <span>Subtotal: <b className="text-slate-800">{brl(sale.subtotal)}</b></span>
                  {Number(sale.discount_amount) > 0 && <span>Descontos: <b className="text-rose-600">- {brl(sale.discount_amount)}</b></span>}
                  {interest > 0 && (
                    <>
                      <span>Valor dos produtos: <b className="text-slate-800">{brl(sale.total_amount)}</b></span>
                      <span>Juros da maquininha: <b className="text-slate-800">{brl(interest)}</b></span>
                    </>
                  )}
                  <span className="text-sm">{interest > 0 ? 'Faturamento' : 'Total'}: <b className="text-slate-900">{brl(revenue)}</b></span>
                </div>
              )}
            </>
          )}

          {tab === 'payments' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className={boxCls}><span className={labelCls}>{interest > 0 ? 'Faturamento' : 'Valor Total'}</span><span className="font-black text-slate-900">{brl(revenue)}</span></div>
                <div className={boxCls}><span className={labelCls}>Recebido</span><span className="font-bold text-slate-800">{brl(paymentsSum)}</span></div>
                {change > 0 && <div className={boxCls}><span className={labelCls}>Troco</span><span className="font-bold text-slate-800">{brl(change)}</span></div>}
              </div>

              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-3">
                    <div>
                      <span className="font-bold text-slate-800">
                        {p.payment_method === 'trade_in_credit' ? 'Aparelho recebido na troca (avaliação)' : PAYMENT_LABELS[p.payment_method] || p.payment_method}
                      </span>
                      {p.payment_method === 'credit_card' && (
                        <span className="block text-slate-500">
                          {Number(p.interest) > 0
                            ? `Inclui ${brl(Number(p.interest))} de juros da maquininha`
                            : p.installments > 1 ? `${p.installments}x de ${brl(Number(p.amount) / p.installments)}` : 'À vista (1x)'}
                        </span>
                      )}
                      <span className="block text-[11px] text-slate-400">{dateTime(p.received_at)}</span>
                    </div>
                    <span className="font-black text-slate-900 whitespace-nowrap">{brl(p.amount)}</span>
                  </div>
                ))}
                {payments.length === 0 && <div className="px-3 py-6 text-center text-slate-400">Nenhum pagamento registrado.</div>}
              </div>

              {(sale.adjustments || []).length > 0 && (
                <div>
                  <span className={`${labelCls} mb-2`}>Ajustes após a venda (trocas e devoluções)</span>
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {(sale.adjustments || []).map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <span className="text-slate-700">{a.description}</span>
                        <span className="font-bold text-slate-900 whitespace-nowrap">{brl(Math.abs(a.amount))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'upgrade' && tradeIn && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={boxCls}><span className={labelCls}>Aparelho Recebido</span><span className="font-bold text-slate-800">{upgradeReceived ? `${upgradeReceived.brand} ${upgradeReceived.model} (${upgradeReceived.storage_capacity} - ${upgradeReceived.color})` : '—'}</span></div>
              <div className={boxCls}><span className={labelCls}>IMEI</span><span className="font-mono font-semibold text-slate-800">{upgradeReceived?.imei || '—'}</span></div>
              <div className={boxCls}><span className={labelCls}>Saúde da Bateria</span><span className="font-semibold text-slate-800">{upgradeReceived?.battery_health ? `${upgradeReceived.battery_health}%` : 'Não informada'}</span></div>
              <div className={boxCls}><span className={labelCls}>Valor de Avaliação</span><span className="font-bold text-slate-900">{brl(tradeIn.appraisal_value)}</span></div>
              <div className={boxCls}><span className={labelCls}>Diferença Paga pelo Cliente</span><span className="font-bold text-slate-900">{brl(tradeIn.difference_amount)}</span></div>
              <div className={boxCls}><span className={labelCls}>Situação Atual do Aparelho Recebido</span><span className="font-semibold text-slate-800">{upgradeReceived ? DEVICE_STATUS_LABELS[upgradeReceived.status] : '—'}</span></div>
              {upgradeReceived?.physical_condition_notes && (
                <div className={`${boxCls} sm:col-span-2`}><span className={labelCls}>Observações</span><span className="text-slate-700">{upgradeReceived.physical_condition_notes}</span></div>
              )}
            </div>
          )}

          {tab === 'warranty' && (
            <>
              {sale.apple_warranty && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-1">
                  <span className="font-bold text-slate-800 block">Termo de Garantia — Apple (1 Ano)</span>
                  <span className="block text-slate-600">{sale.apple_warranty.title} · versão {sale.apple_warranty.version}</span>
                  <span className="block text-slate-600">
                    Apresentado em {dateTime(sale.apple_warranty.presented_at)}
                    {sale.apple_warranty.acknowledged_at
                      ? ` · ciência registrada em ${dateTime(sale.apple_warranty.acknowledged_at)} por ${userName(sale.apple_warranty.acknowledged_by) || 'vendedor'}`
                      : ' · ciência não marcada'}
                  </span>
                  <span className="block text-[11px] text-slate-500">O termo completo está no PDF "Termo de Garantia Apple" (botão Baixar Garantia ou Documentos da Venda).</span>
                </div>
              )}
              {warranties.map((w) => {
                const st = getWarrantyStatus(w);
                const remaining = getDaysRemaining(w);
                return (
                  <div key={w.id} className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{deviceName(w.device_id)} <span className="font-mono font-normal text-slate-500">IMEI {w.imei}</span></span>
                      <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border ${WARRANTY_STATUS_META[st].cls}`}>{WARRANTY_STATUS_META[st].label}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className={boxCls}><span className={labelCls}>Prazo</span><span className="font-bold text-slate-800">{w.warranty_days} dias</span></div>
                      <div className={boxCls}><span className={labelCls}>Início</span><span className="font-semibold text-slate-800">{formatDay(w.start_date)}</span></div>
                      <div className={boxCls}><span className={labelCls}>Término</span><span className="font-semibold text-slate-800">{formatDay(w.end_date)}</span></div>
                      <div className={boxCls}><span className={labelCls}>Dias Restantes</span><span className="font-semibold text-slate-800">{w.status === 'cancelled' ? '—' : remaining >= 0 ? remaining : `Vencida há ${Math.abs(remaining)}`}</span></div>
                    </div>
                    <div>
                      <span className={labelCls}>Termo de Garantia</span>
                      <p className="text-slate-600 leading-relaxed">{w.terms}</p>
                    </div>
                  </div>
                );
              })}
              {warranties.length === 0 && (
                <div className="rounded-xl border border-slate-200 p-6 text-center text-slate-400">Nenhuma garantia registrada para esta venda.</div>
              )}
              <div className={boxCls}>
                <span className={labelCls}>Documentos Vinculados</span>
                {warranties.length > 0 ? (
                  <button onClick={openWarrantyTerm} className="text-blue-600 font-semibold hover:underline inline-flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Termo de Garantia da venda nº {sale.sale_number}
                  </button>
                ) : (
                  <span className="text-slate-500">Nenhum termo de garantia para esta venda.</span>
                )}
                <span className="block text-[11px] text-slate-400 mt-1">Os demais documentos ficam em "Documentos da Venda".</span>
              </div>
              <p className="text-[11px] text-slate-400">{CDC_NOTICE}</p>
            </>
          )}

          {tab === 'history' && (
            <ol className="relative border-l border-slate-200 ml-2 space-y-4">
              {events.map((ev, idx) => (
                <li key={idx} className="pl-5 relative">
                  <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-tenant-primary" />
                  <div className="font-semibold text-slate-800">{ev.text}</div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(ev.at).toLocaleDateString('pt-BR')} às {new Date(ev.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {ev.user && <> | {ev.user}</>}
                  </div>
                  {ev.note && <div className="text-[11px] text-slate-400">{ev.note}</div>}
                </li>
              ))}
              {events.length === 0 && <li className="pl-5 text-slate-400">Nenhum evento registrado.</li>}
            </ol>
          )}
        </div>

        {/* RODAPÉ FIXO COM AÇÕES */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4 space-y-2">
          {notice && <p className="text-[11px] font-semibold text-slate-500">{notice}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* iPhone lacrado: comprovante e Termo de Garantia Apple em PDFs separados, um botão para cada */}
            {currentTenant && saleHasAppleWarranty(sale) && (['receipt', 'warranty'] as const).map(kind => (
              <button
                key={kind}
                type="button"
                onClick={async () => {
                  const ctx = getSaleContext(sale, currentTenant, currentTheme);
                  const def = kind === 'receipt' ? receiptDocumentFor(ctx) : appleWarrantyDocumentFor(ctx);
                  if (def) setNotice(await runDocumentAction(def, ctx, 'download'));
                }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                {kind === 'receipt' ? <FileDown className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                {kind === 'receipt' ? 'Baixar Comprovante' : 'Baixar Garantia'}
              </button>
            ))}
            <SaleDocumentsMenu sale={sale} placement="up" onNotice={setNotice} />
            {onDelete && !cancelled && (isAdmin || sale.seller_id === currentUser.id) && (
              <button
                type="button"
                onClick={onDelete}
                className="px-3.5 py-2 rounded-xl border border-rose-200 bg-white text-rose-600 font-semibold text-[11px] hover:bg-rose-50 inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir Venda
              </button>
            )}
            <button type="button" onClick={onClose} className="btn-tenant-primary px-5 py-2 rounded-xl font-bold text-[11px]">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
};
