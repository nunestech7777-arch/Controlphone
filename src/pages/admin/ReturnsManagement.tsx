// ============================================================================
// CONTROLPHONE — TROCAS & DEVOLUÇÕES (SEMPRE VINCULADAS À VENDA ORIGINAL)
// Vendedor registra e acompanha; administrador analisa, aprova, conclui e define
// o destino do aparelho devolvido. Não exibe custos, margens ou lucros.
// ============================================================================

import React, { useState } from 'react';
import { RotateCcw, Plus, Search, Eye, X, ArrowLeft } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { consumeIntent } from '../../lib/navIntent';
import { PaymentMethod, ReturnRequest, ReturnResolution, ReturnStatus, Sale } from '../../types';
import { PERIOD_LABELS, PeriodKey, getPeriodRange } from '../../lib/sellerRanking';
import { formatDay } from '../../lib/warrantyStatus';

const STATUS_META: Record<ReturnStatus, { label: string; cls: string }> = {
  open: { label: 'Solicitação aberta', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_review: { label: 'Em análise', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  approved: { label: 'Aprovada', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  rejected: { label: 'Recusada', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  completed: { label: 'Concluída', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
};

const TYPE_LABELS: Record<ReturnResolution, string> = {
  exchange: 'Troca por outro aparelho',
  refund: 'Devolução com reembolso',
  credit: 'Crédito para compra futura'
};

const REASONS = [
  'Defeito no aparelho',
  'Insatisfação',
  'Produto diferente do esperado',
  'Troca por outro modelo',
  'Problema após a compra',
  'Outro'
];

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  store_credit: 'Crédito da loja',
  trade_in_credit: 'Crédito de upgrade',
  other: 'Outro'
};
const REFUND_METHODS: PaymentMethod[] = ['pix', 'cash', 'credit_card', 'debit_card', 'other'];

const DESTINATION_LABELS = {
  pending_evaluation: 'Aguardando avaliação (bloqueado para venda)',
  returned_to_stock: 'Avaliado e liberado para o estoque',
  sent_to_assistance: 'Enviado para Assistência Interna'
};

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500';
const labelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1';
const formatBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

export const ReturnsManagement: React.FC<{ viewId?: string }> = ({ viewId = 'admin-returns' }) => {
  const { currentTenant, currentUser, isSupportMode } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';
  const userRole = isSupportMode ? 'super_admin' : currentUser.role;
  const isManager = userRole === 'admin' || userRole === 'super_admin';

  const [intent] = useState(() => consumeIntent(viewId, 'new-return'));

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReturnStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ReturnResolution>('all');
  const [periodFilter, setPeriodFilter] = useState<'all' | PeriodKey>('all');

  // Nova solicitação
  const [isNewOpen, setIsNewOpen] = useState(Boolean(intent));
  const [saleQuery, setSaleQuery] = useState('');
  const [pickedSaleId, setPickedSaleId] = useState(intent?.saleId || '');
  const [pickedItemId, setPickedItemId] = useState(intent?.saleItemId || '');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [resolution, setResolution] = useState<ReturnResolution>('exchange');

  // Detalhe e ações
  const [detailId, setDetailId] = useState<string | null>(null);
  const [mode, setMode] = useState<'view' | 'reject' | 'cancel' | 'complete' | 'evaluate'>('view');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [approveResolution, setApproveResolution] = useState<ReturnResolution>('exchange');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [warrantyMode, setWarrantyMode] = useState<'keep' | 'new'>('keep');
  const [destination, setDestination] = useState<'stock' | 'assistance'>('stock');
  const [defect, setDefect] = useState('');
  const [error, setError] = useState('');

  const customers = store.customers.filter(c => c.tenant_id === tenantId);
  const sales = store.sales.filter(s => s.tenant_id === tenantId && s.status === 'completed');
  const requests = store.returnRequests.filter(r => r.tenant_id === tenantId);
  const availableDevices = store.devices.filter(d => d.tenant_id === tenantId && d.status === 'available');

  const deviceLabel = (deviceId?: string) => {
    const d = store.devices.find(x => x.id === deviceId);
    return d ? `${d.brand} ${d.model} (${d.storage_capacity} - ${d.color})` : 'Aparelho';
  };
  const customerName = (id: string) => customers.find(c => c.id === id)?.name || 'Cliente';
  const saleNumber = (id: string) => store.sales.find(s => s.id === id)?.sale_number;

  const visible = requests
    .filter(r => statusFilter === 'all' || r.status === statusFilter)
    .filter(r => typeFilter === 'all' || r.resolution === typeFilter)
    .filter(r => {
      if (periodFilter === 'all') return true;
      const [from, to] = getPeriodRange(periodFilter);
      const date = new Date(r.created_at);
      return date >= from && date <= to;
    })
    .filter(r => {
      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (
        customerName(r.customer_id).toLowerCase().includes(term) ||
        String(r.request_number).includes(term) ||
        String(saleNumber(r.sale_id) || '').includes(term) ||
        r.imei.includes(term)
      );
    })
    .sort((a, b) => b.request_number - a.request_number);

  // Busca da venda: número, cliente, CPF ou IMEI
  const saleMatches: Sale[] = (() => {
    const term = saleQuery.toLowerCase().trim();
    if (!term) return [];
    return sales
      .filter(s => {
        const cust = customers.find(c => c.id === s.customer_id);
        const imeis = (s.items || []).map(it => store.devices.find(d => d.id === it.device_id)?.imei || '');
        return (
          String(s.sale_number).includes(term) ||
          (cust?.name || '').toLowerCase().includes(term) ||
          (cust?.cpf || '').replace(/\D/g, '').includes(term.replace(/\D/g, '') || '§') ||
          imeis.some(i => i.includes(term))
        );
      })
      .slice(0, 8);
  })();

  const pickedSale = sales.find(s => s.id === pickedSaleId);
  const detail = requests.find(r => r.id === detailId);
  const detailSale = detail ? store.sales.find(s => s.id === detail.sale_id) : undefined;
  const newDevice = availableDevices.find(d => d.id === newDeviceId);
  // Parte da venda original paga com aparelho usado (upgrade)
  const upgradeCredit = (detailSale?.payments || [])
    .filter(p => p.payment_method === 'trade_in_credit')
    .reduce((acc, p) => acc + Number(p.amount), 0);
  const difference = detail && newDevice ? Number(newDevice.suggested_price) - Number(detail.item_paid_amount) : 0;

  const closeNew = () => {
    setIsNewOpen(false);
    setSaleQuery(''); setPickedSaleId(''); setPickedItemId(''); setReason(''); setNotes(''); setResolution('exchange'); setError('');
  };

  const openDetail = (r: ReturnRequest) => {
    setDetailId(r.id);
    setMode('view');
    setDecisionNotes(''); setError(''); setNewDeviceId(''); setWarrantyMode('keep');
    setDestination('stock'); setDefect(''); setMethod('pix');
    setApproveResolution(r.resolution);
    setAmount(String(r.item_paid_amount));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickedSale || !pickedItemId) { setError('Selecione a venda e o aparelho.'); return; }
    const result = store.createReturnRequest({
      tenantId, saleId: pickedSale.id, saleItemId: pickedItemId, userId: currentUser.id, userRole,
      reason, notes, resolution
    });
    if (!result.ok) { setError(result.error || 'Não foi possível registrar a solicitação.'); return; }
    closeNew();
  };

  const changeStatus = (newStatus: 'in_review' | 'approved' | 'rejected' | 'cancelled') => {
    if (!detail) return;
    const result = store.updateReturnStatus({
      tenantId, requestId: detail.id, userId: currentUser.id, userRole, newStatus,
      notes: decisionNotes, resolution: newStatus === 'approved' ? approveResolution : undefined
    });
    if (!result.ok) { setError(result.error || 'Não foi possível atualizar o status.'); return; }
    setMode('view'); setDecisionNotes(''); setError('');
    if (newStatus === 'approved') setAmount(String(detail.item_paid_amount));
  };

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const result = store.completeReturn({
      tenantId, requestId: detail.id, userId: currentUser.id, userRole, notes: decisionNotes,
      refundAmount: detail.resolution === 'refund' ? parseFloat(amount) : undefined,
      refundMethod: detail.resolution === 'refund' ? method : undefined,
      creditAmount: detail.resolution === 'credit' ? parseFloat(amount) : undefined,
      newDeviceId: detail.resolution === 'exchange' ? newDeviceId : undefined,
      differenceMethod: detail.resolution === 'exchange' && difference !== 0 ? method : undefined,
      substituteWarranty: detail.resolution === 'exchange'
        ? { mode: warrantyMode }
        : undefined
    });
    if (!result.ok) { setError(result.error || 'Não foi possível concluir.'); return; }
    setMode('view'); setDecisionNotes(''); setError('');
  };

  const handleEvaluate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const result = store.resolveReturnedDevice({
      tenantId, requestId: detail.id, userId: currentUser.id, userRole, destination, defect, notes: decisionNotes
    });
    if (!result.ok) { setError(result.error || 'Não foi possível registrar a avaliação.'); return; }
    setMode('view'); setDecisionNotes(''); setError('');
  };

  const badge = (st: ReturnStatus) => (
    <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border ${STATUS_META[st].cls}`}>
      {STATUS_META[st].label}
    </span>
  );
  const neutralBtn = 'px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-bold text-xs hover:bg-slate-50';
  const selectCls = 'px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 text-xs font-semibold text-slate-700 bg-white';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-blue-600" />
            Trocas & Devoluções
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Solicitações vinculadas às vendas originais. O aparelho devolvido fica bloqueado até a avaliação.
          </p>
        </div>
        <button
          onClick={() => setIsNewOpen(true)}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Nova Solicitação
        </button>
      </div>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-3">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Cliente, Nº, Venda ou IMEI..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2 w-full lg:w-auto">
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as 'all' | PeriodKey)} aria-label="Período" className={selectCls}>
            <option value="all">Todo o período</option>
            {(['today', 'week', 'month', 'last_month', 'last_3_months', 'year'] as PeriodKey[]).map(k => (
              <option key={k} value={k}>{PERIOD_LABELS[k]}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | ReturnResolution)} aria-label="Tipo" className={selectCls}>
            <option value="all">Todos os tipos</option>
            {(Object.keys(TYPE_LABELS) as ReturnResolution[]).map(k => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | ReturnStatus)} aria-label="Status" className={selectCls}>
            <option value="all">Todos os status</option>
            {(Object.keys(STATUS_META) as ReturnStatus[]).map(k => <option key={k} value={k}>{STATUS_META[k].label}</option>)}
          </select>
        </div>
      </div>

      {/* TABELA */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 whitespace-nowrap">Nº Solicitação</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Nº Venda</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Cliente</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Produto</th>
                <th className="py-3.5 px-4 whitespace-nowrap">IMEI</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Tipo</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Data</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center">Status</th>
                <th className="py-3.5 pl-2 pr-4 w-10"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((r) => (
                <tr key={r.id} onClick={() => openDetail(r)} className="hover:bg-slate-50/80 transition-colors cursor-pointer">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">#{r.request_number}</td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">#{saleNumber(r.sale_id)}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="max-w-[160px] truncate" title={customerName(r.customer_id)}>{customerName(r.customer_id)}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="max-w-[220px] truncate font-bold text-slate-800" title={deviceLabel(r.device_id)}>{deviceLabel(r.device_id)}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">{r.imei}</td>
                  <td className="py-3.5 px-4 whitespace-nowrap">{TYPE_LABELS[r.resolution]}</td>
                  <td className="py-3.5 px-4 whitespace-nowrap">{formatDay(r.created_at)}</td>
                  <td className="py-3.5 px-4 text-center">{badge(r.status)}</td>
                  <td className="py-3.5 pl-2 pr-4 text-right">
                    <button type="button" title="Ver detalhes" aria-label="Ver detalhes" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    Nenhuma solicitação de troca ou devolução encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NOVA SOLICITAÇÃO */}
      {isNewOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                {pickedSale && (
                  <button onClick={() => { setPickedSaleId(''); setPickedItemId(''); }} className="text-slate-400 hover:text-slate-700" aria-label="Trocar venda">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                Nova Solicitação de Troca ou Devolução
              </h3>
              <button onClick={closeNew} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>

            {!pickedSale ? (
              <div className="space-y-3 text-xs">
                <label className="font-bold text-slate-700 block">Localizar a venda original *</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text" autoFocus value={saleQuery} onChange={(e) => setSaleQuery(e.target.value)}
                    placeholder="Nº da venda, cliente, CPF ou IMEI" className={`${inputCls} pl-9`}
                  />
                </div>
                <ul className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {saleMatches.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => { setPickedSaleId(s.id); setPickedItemId(''); }} className="w-full text-left px-3 py-2 hover:bg-slate-50">
                        <span className="font-bold text-slate-800">Venda #{s.sale_number}</span>
                        <span className="text-slate-500"> — {customerName(s.customer_id)}</span>
                        <span className="block text-[11px] text-slate-400">{formatDay(s.created_at)} | {formatBRL(s.total_amount)}</span>
                      </button>
                    </li>
                  ))}
                  {saleMatches.length === 0 && (
                    <li className="px-3 py-3 text-slate-400">
                      {saleQuery.trim() ? 'Nenhuma venda concluída encontrada.' : 'Digite para buscar a venda.'}
                    </li>
                  )}
                </ul>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-600">
                  <span className="col-span-2 font-bold text-slate-800">Venda #{pickedSale.sale_number} — {customerName(pickedSale.customer_id)}</span>
                  <span>Compra: <b className="text-slate-800">{formatDay(pickedSale.created_at)}</b></span>
                  <span>Total pago: <b className="text-slate-800">{formatBRL(pickedSale.total_amount)}</b></span>
                  <span>Pagamento: <b className="text-slate-800">{(pickedSale.payments || []).map(p => PAYMENT_LABELS[p.payment_method] || p.payment_method).join(', ') || '—'}</b></span>
                  <span>Vendedor: <b className="text-slate-800">{store.profiles.find(p => p.id === pickedSale.seller_id)?.full_name || '—'}</b></span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Aparelho a trocar ou devolver *</label>
                  <div className="space-y-1.5">
                    {(pickedSale.items || []).filter(it => it.item_type === 'device').map((it) => {
                      const dev = store.devices.find(d => d.id === it.device_id);
                      const busy = requests.some(r => r.sale_item_id === it.id && ['open', 'in_review', 'approved'].includes(r.status));
                      const disabled = Boolean(it.returned_at) || busy;
                      return (
                        <label
                          key={it.id}
                          className={`flex items-start gap-2 p-2.5 rounded-xl border ${pickedItemId === it.id ? 'border-blue-400 bg-slate-50' : 'border-slate-200'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                        >
                          <input
                            type="radio" name="return-item" className="mt-0.5" disabled={disabled}
                            checked={pickedItemId === it.id} onChange={() => setPickedItemId(it.id)}
                          />
                          <span className="min-w-0">
                            <span className="block font-bold text-slate-800">{deviceLabel(it.device_id)}</span>
                            <span className="block font-mono text-[11px] text-slate-500">IMEI {dev?.imei} | pago {formatBRL(it.total_price)}</span>
                            {it.returned_at && <span className="block text-[11px] text-rose-600">Já trocado/devolvido</span>}
                            {busy && <span className="block text-[11px] text-amber-600">Solicitação em andamento</span>}
                          </span>
                        </label>
                      );
                    })}
                    {(pickedSale.items || []).filter(it => it.item_type === 'device').length === 0 && (
                      <p className="text-slate-400">Esta venda não possui aparelhos.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Motivo *</label>
                    <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} required>
                      <option value="">Selecione...</option>
                      {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Resolução solicitada *</label>
                    <select value={resolution} onChange={(e) => setResolution(e.target.value as ReturnResolution)} className={inputCls}>
                      {(Object.keys(TYPE_LABELS) as ReturnResolution[]).map(k => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Observações</label>
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
                </div>

                <p className="text-[11px] text-slate-400">
                  O motivo não decide o resultado: a solicitação passa por análise. O crédito para compra futura é uma opção do cliente e não substitui um reembolso legalmente devido.
                </p>
                {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button type="button" onClick={closeNew} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Cancelar</button>
                  <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">Registrar Solicitação</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DETALHES E AÇÕES */}
      {detail && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-blue-600 shrink-0" />
                  <span className="truncate">Solicitação #{detail.request_number} — {TYPE_LABELS[detail.resolution]}</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Venda #{detailSale?.sale_number} | {customerName(detail.customer_id)}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {badge(detail.status)}
                <button onClick={() => setDetailId(null)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={labelCls}>Aparelho Original</span>
                  <span className="block font-semibold text-slate-800">{deviceLabel(detail.device_id)}</span>
                  <span className="block font-mono text-slate-500">IMEI {detail.imei}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={labelCls}>Valor Pago pelo Item</span>
                  <span className="block font-bold text-slate-900">{formatBRL(detail.item_paid_amount)}</span>
                  <span className="block text-slate-500">Compra em {formatDay(detailSale?.created_at)}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={labelCls}>Motivo</span>
                  <span className="block font-semibold text-slate-800">{detail.reason}</span>
                  {detail.notes && <span className="block text-slate-500">{detail.notes}</span>}
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={labelCls}>Registrada por</span>
                  <span className="block font-semibold text-slate-800">{store.profiles.find(p => p.id === detail.requested_by)?.full_name || '—'}</span>
                  <span className="block text-slate-500">{formatDay(detail.created_at)}</span>
                </div>
              </div>

              {detail.status === 'completed' && (
                <div className="rounded-xl p-3 border border-slate-200 space-y-1">
                  <span className={labelCls}>Resolução Executada</span>
                  {detail.resolution === 'refund' && (
                    <span className="block text-slate-700">Reembolso de <b>{formatBRL(detail.refund_amount || 0)}</b> via {PAYMENT_LABELS[detail.refund_method || 'other']}</span>
                  )}
                  {detail.resolution === 'credit' && (
                    <span className="block text-slate-700">Crédito de <b>{formatBRL(detail.credit_amount || 0)}</b> lançado no cadastro do cliente</span>
                  )}
                  {detail.resolution === 'exchange' && (
                    <>
                      <span className="block text-slate-700">Substituto: <b>{deviceLabel(detail.new_device_id)}</b> ({formatBRL(detail.new_device_price || 0)})</span>
                      <span className="block text-slate-700">
                        {Number(detail.difference_amount) > 0 && <>Diferença paga pelo cliente: <b>{formatBRL(detail.difference_amount || 0)}</b></>}
                        {Number(detail.difference_amount) < 0 && <>Diferença devolvida ao cliente: <b>{formatBRL(Math.abs(detail.difference_amount || 0))}</b></>}
                        {Number(detail.difference_amount) === 0 && 'Sem diferença de valores'}
                        {detail.difference_method && ` (${PAYMENT_LABELS[detail.difference_method]})`}
                      </span>
                    </>
                  )}
                  <span className="block text-slate-700">
                    Aparelho devolvido: <b>{detail.device_destination ? DESTINATION_LABELS[detail.device_destination] : '—'}</b>
                  </span>
                </div>
              )}

              <div>
                <span className={`${labelCls} mb-2`}>Histórico</span>
                <ol className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {detail.history.map((ev, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-[11px]">
                      <span className="font-mono text-slate-400 shrink-0 w-[92px]">
                        {formatDay(ev.at)} {new Date(ev.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-slate-700 min-w-0">
                        {ev.description}
                        {ev.user_name && <span className="text-slate-400"> — {ev.user_name}</span>}
                        {ev.notes && <span className="block text-slate-400">{ev.notes}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* RECUSAR / CANCELAR */}
              {(mode === 'reject' || mode === 'cancel') && (
                <div className="rounded-xl p-3 border border-slate-200 space-y-2">
                  <label className="font-bold text-slate-700 block">
                    {mode === 'reject' ? 'Motivo da recusa *' : 'Motivo do cancelamento *'}
                  </label>
                  <textarea rows={2} value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} className={inputCls} />
                  {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setMode('view'); setError(''); }} className="px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Voltar</button>
                    <button
                      type="button" onClick={() => changeStatus(mode === 'reject' ? 'rejected' : 'cancelled')}
                      className="px-4 py-1.5 font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white"
                    >
                      {mode === 'reject' ? 'Recusar Solicitação' : 'Cancelar Solicitação'}
                    </button>
                  </div>
                </div>
              )}

              {/* CONCLUIR */}
              {mode === 'complete' && (
                <form onSubmit={handleComplete} className="rounded-xl p-3 border border-slate-200 space-y-3">
                  <span className={labelCls}>Concluir — {TYPE_LABELS[detail.resolution]}</span>

                  {detail.resolution !== 'exchange' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">
                          {detail.resolution === 'refund' ? 'Valor do Reembolso (R$) *' : 'Valor do Crédito (R$) *'}
                        </label>
                        <input
                          type="number" step="0.01" min="0.01" max={detail.item_paid_amount} value={amount}
                          onChange={(e) => setAmount(e.target.value)} className={`${inputCls} font-bold`} required
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Máximo: {formatBRL(detail.item_paid_amount)} (valor pago pelo item)</p>
                        {upgradeCredit > 0 && (
                          <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-2">
                            Venda com upgrade: {formatBRL(upgradeCredit)} deste valor foram pagos com o aparelho usado, que continua
                            com a loja. O cliente pagou {formatBRL(Number(detail.item_paid_amount) - upgradeCredit)} em dinheiro.
                            Devolver o valor cheio significa ficar com o usado por {formatBRL(upgradeCredit)}.
                          </p>
                        )}
                      </div>
                      {detail.resolution === 'refund' && (
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">Forma de Reembolso *</label>
                          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
                            {REFUND_METHODS.map(m => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {detail.resolution === 'exchange' && (
                    <>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Aparelho Substituto (estoque disponível) *</label>
                        <select value={newDeviceId} onChange={(e) => setNewDeviceId(e.target.value)} className={inputCls} required>
                          <option value="">Selecione...</option>
                          {availableDevices.map(d => (
                            <option key={d.id} value={d.id}>
                              {d.brand} {d.model} ({d.storage_capacity} - {d.color}) | IMEI {d.imei} | {formatBRL(d.suggested_price)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {newDevice && (
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-slate-700 space-y-0.5">
                          <div>Aparelho original: <b>{formatBRL(detail.item_paid_amount)}</b></div>
                          <div>Novo aparelho: <b>{formatBRL(newDevice.suggested_price)}</b></div>
                          <div className="font-bold text-slate-900">
                            {difference > 0 && `Diferença a pagar pelo cliente: ${formatBRL(difference)}`}
                            {difference < 0 && `Diferença a devolver ao cliente: ${formatBRL(Math.abs(difference))}`}
                            {difference === 0 && 'Sem diferença de valores'}
                          </div>
                        </div>
                      )}
                      {newDevice && difference !== 0 && (
                        <div>
                          <label className="font-bold text-slate-700 block mb-1">
                            {difference > 0 ? 'Forma de pagamento da diferença *' : 'Forma de devolução da diferença *'}
                          </label>
                          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
                            {REFUND_METHODS.map(m => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="font-bold text-slate-700 block mb-1">Garantia do Substituto</label>
                        <select value={warrantyMode} onChange={(e) => setWarrantyMode(e.target.value as 'keep' | 'new')} className={inputCls}>
                          <option value="keep">Manter a vigência da garantia original</option>
                          <option value="new">Nova garantia de 90 dias a partir da troca</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Observações</label>
                    <input type="text" value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} className={inputCls} />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Ao concluir, o aparelho original volta a pertencer à loja e fica bloqueado para venda até a avaliação.
                  </p>
                  {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setMode('view'); setError(''); }} className="px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Voltar</button>
                    <button type="submit" className="px-4 py-1.5 font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">Concluir Solicitação</button>
                  </div>
                </form>
              )}

              {/* AVALIAR APARELHO DEVOLVIDO */}
              {mode === 'evaluate' && (
                <form onSubmit={handleEvaluate} className="rounded-xl p-3 border border-slate-200 space-y-3">
                  <span className={labelCls}>Avaliação do aparelho devolvido (IMEI {detail.imei})</span>
                  <select value={destination} onChange={(e) => setDestination(e.target.value as 'stock' | 'assistance')} className={inputCls}>
                    <option value="stock">Retornar ao estoque disponível</option>
                    <option value="assistance">Enviar para Assistência Interna</option>
                  </select>
                  {destination === 'assistance' && (
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Defeito apresentado *</label>
                      <textarea rows={2} value={defect} onChange={(e) => setDefect(e.target.value)} className={inputCls} required />
                    </div>
                  )}
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Observações da avaliação</label>
                    <input type="text" value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} className={inputCls} />
                  </div>
                  {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => { setMode('view'); setError(''); }} className="px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">Voltar</button>
                    <button type="submit" className="btn-tenant-primary px-4 py-1.5 font-bold rounded-xl">Registrar Destino</button>
                  </div>
                </form>
              )}

              {/* BARRA DE AÇÕES */}
              {mode === 'view' && (
                <>
                  {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    {isManager && ['open', 'in_review'].includes(detail.status) && (
                      <label className="flex items-center gap-2 mr-auto text-slate-500">
                        <span className="font-semibold">Resolução:</span>
                        <select value={approveResolution} onChange={(e) => setApproveResolution(e.target.value as ReturnResolution)} className={selectCls}>
                          {(Object.keys(TYPE_LABELS) as ReturnResolution[]).map(k => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
                        </select>
                      </label>
                    )}
                    {isManager && detail.status === 'open' && (
                      <button type="button" onClick={() => changeStatus('in_review')} className={neutralBtn}>Colocar em Análise</button>
                    )}
                    {(isManager || detail.requested_by === currentUser.id) && ['open', 'in_review', 'approved'].includes(detail.status) && (
                      <button type="button" onClick={() => { setMode('cancel'); setError(''); }} className={neutralBtn}>Cancelar</button>
                    )}
                    {isManager && ['open', 'in_review'].includes(detail.status) && (
                      <>
                        <button type="button" onClick={() => { setMode('reject'); setError(''); }} className="px-4 py-2 rounded-xl border border-rose-200 bg-white text-rose-600 font-bold text-xs hover:bg-rose-50">Recusar</button>
                        <button type="button" onClick={() => changeStatus('approved')} className="btn-tenant-primary px-4 py-2 rounded-xl font-bold text-xs">Aprovar</button>
                      </>
                    )}
                    {isManager && detail.status === 'approved' && (
                      <button type="button" onClick={() => { setMode('complete'); setError(''); }} className="btn-tenant-primary px-4 py-2 rounded-xl font-bold text-xs">
                        Concluir {detail.resolution === 'exchange' ? 'Troca' : detail.resolution === 'refund' ? 'Reembolso' : 'Crédito'}
                      </button>
                    )}
                    {isManager && detail.status === 'completed' && detail.device_destination === 'pending_evaluation' && (
                      <button type="button" onClick={() => { setMode('evaluate'); setError(''); }} className="btn-tenant-primary px-4 py-2 rounded-xl font-bold text-xs">
                        Avaliar Aparelho Devolvido
                      </button>
                    )}
                    {!isManager && detail.status !== 'completed' && (
                      <span className="text-[11px] text-slate-400">Aprovação e conclusão são feitas pelo administrador.</span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
