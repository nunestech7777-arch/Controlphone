// ============================================================================
// CONTROLPHONE — ASSISTÊNCIA TÉCNICA (INTERNA = APARELHO DA LOJA | EXTERNA = CLIENTE)
// A origem do aparelho determina o destino: interna volta ao estoque, externa volta ao dono.
// ============================================================================

import React, { useState } from 'react';
import {
  Wrench, Search, DollarSign, Plus, Eye, X, Store as StoreIcon, UserRound, ArrowLeft,
  CheckCircle2, PackageCheck, Ban
} from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { ServiceOrder, OSStatus, PaymentMethod, Device } from '../../types';
import { consumeIntent } from '../../lib/navIntent';
import { ChecklistField } from '../../components/shared/ChecklistField';
import { AssistanceDocumentsMenu } from '../../components/shared/AssistanceDocumentsMenu';
import { IntakeChecklist } from '../../lib/assistanceChecklist';
import { getServiceOrderDocument } from '../../lib/pdf/assistanceDocuments';
import { downloadBuiltDocument } from '../../lib/pdf/documentActions';
import { WARRANTY_STATUS_META, formatDay as formatWarrantyDay, getWarrantyStatus } from '../../lib/warrantyStatus';

type OriginTab = 'internal' | 'external';
type ActionKind = 'complete' | 'deliver' | 'cancel';

const STATUS_META: Record<OSStatus, { label: string; cls: string }> = {
  waiting_diagnosis: { label: 'Aguardando diagnóstico', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_diagnosis: { label: 'Em diagnóstico', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  quote_pending_admin: { label: 'Aguardando orçamento', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  quote_ready: { label: 'Orçamento enviado', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  waiting_client_approval: { label: 'Aguardando aprovação', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  approved: { label: 'Orçamento aprovado', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_maintenance: { label: 'Em manutenção', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  waiting_parts: { label: 'Aguardando peça', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  repair_completed: { label: 'Manutenção concluída', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ready_for_pickup: { label: 'Aguardando retirada', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  delivered: { label: 'Entregue', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected: { label: 'Orçamento recusado', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
};

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  other: 'Outro'
};

const inputCls = 'w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500';
const cardLabelCls = 'block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1';
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');
const formatBRL = (v: number) => `R$ ${Number(v).toFixed(2)}`;

export const ServiceOrdersManagement: React.FC = () => {
  const { currentTenant, currentUser, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  // Aberta a partir de uma garantia/cliente: já chega com cliente, modelo e IMEI preenchidos
  const [intent] = useState(() => consumeIntent('admin-service-orders', 'new-external-assistance'));

  const [tab, setTab] = useState<OriginTab>(intent ? 'external' : 'internal');
  const [searchTerm, setSearchTerm] = useState('');
  const [detailOsId, setDetailOsId] = useState<string | null>(null);
  const [action, setAction] = useState<{ kind: ActionKind; osId: string } | null>(null);
  const [error, setError] = useState('');

  // Orçamento (fluxo existente da assistência externa)
  const [quoteModalOS, setQuoteModalOS] = useState<ServiceOrder | null>(null);
  const [clientQuoteInput, setClientQuoteInput] = useState('');

  // Nova assistência
  const [newStep, setNewStep] = useState<'closed' | 'choose' | OriginTab>(intent ? 'external' : 'closed');
  const [deviceQuery, setDeviceQuery] = useState('');
  const [pickedDeviceId, setPickedDeviceId] = useState('');
  const [intDefect, setIntDefect] = useState('');
  const [intDiagnosis, setIntDiagnosis] = useState('');
  const [intNotes, setIntNotes] = useState('');
  const [intDate, setIntDate] = useState(todayISO());

  const [customerId, setCustomerId] = useState(intent?.customerId || '');
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [extBrand, setExtBrand] = useState(intent?.brand || 'Apple');
  const [extModel, setExtModel] = useState(intent?.model || '');
  const [extStorage, setExtStorage] = useState(intent?.storage || '');
  const [extColor, setExtColor] = useState(intent?.color || '');
  const [extImei, setExtImei] = useState(intent?.imei || '');
  const [analysisResult, setAnalysisResult] = useState<'pending' | 'covered' | 'not_covered'>('pending');
  const [analysisNotes, setAnalysisNotes] = useState('');
  const [extDefect, setExtDefect] = useState('');
  const [extDiagnosis, setExtDiagnosis] = useState('');
  const [extNotes, setExtNotes] = useState('');
  const [extDate, setExtDate] = useState(todayISO());
  const [extImei2, setExtImei2] = useState('');
  const [extDelivery, setExtDelivery] = useState('');
  const [extChecklist, setExtChecklist] = useState<IntakeChecklist>({});
  const [docNotice, setDocNotice] = useState('');
  // Orçamento apresentado ao cliente (serviço + peças + prazo)
  const [quoteService, setQuoteService] = useState('');
  const [quoteServiceAmount, setQuoteServiceAmount] = useState('');
  const [quoteParts, setQuoteParts] = useState('');
  const [quotePartsAmount, setQuotePartsAmount] = useState('');
  const [quoteDeadline, setQuoteDeadline] = useState('');

  // Conclusão / entrega / cancelamento
  const [serviceDone, setServiceDone] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [partsCost, setPartsCost] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [chargedAmount, setChargedAmount] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'paid'>('pending');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [cancelReason, setCancelReason] = useState('');

  const customers = store.customers.filter(c => c.tenant_id === tenantId);
  const allOrders = store.serviceOrders.filter(o => o.tenant_id === tenantId);
  const stockDevices = store.devices.filter(d => d.tenant_id === tenantId && d.status === 'available');

  const ownerName = (os: ServiceOrder) =>
    os.origin === 'internal' ? 'Própria Loja' : customers.find(c => c.id === os.customer_id)?.name || 'Cliente';

  const tabOrders = allOrders
    .filter(o => o.origin === tab)
    .filter(o => {
      const term = searchTerm.toLowerCase();
      return (
        o.os_number.toString().includes(searchTerm) ||
        o.device_model.toLowerCase().includes(term) ||
        (o.imei || '').includes(searchTerm) ||
        ownerName(o).toLowerCase().includes(term)
      );
    })
    .sort((a, b) => b.os_number - a.os_number);

  const detailOs = allOrders.find(o => o.id === detailOsId);
  const detailWarranty = store.warranties.find(w => w.id === detailOs?.warranty_id);
  const imeiWarranty = store.findWarrantyByImei(tenantId, extImei);

  const openDetails = (os: ServiceOrder) => {
    setDetailOsId(os.id);
    setDocNotice('');
    setAnalysisResult(os.warranty_analysis || 'pending');
    setAnalysisNotes(os.warranty_analysis_notes || '');
  };

  const handleSaveAnalysis = () => {
    if (!detailOs) return;
    const result = store.setWarrantyAnalysis({
      tenantId, osId: detailOs.id, userId: currentUser.id, result: analysisResult, notes: analysisNotes
    });
    if (!result.ok) alert(result.error);
  };
  const actionOs = action ? allOrders.find(o => o.id === action.osId) : undefined;

  const pickedDevice: Device | undefined = stockDevices.find(d => d.id === pickedDeviceId);
  const deviceMatches = stockDevices.filter(d => {
    const term = deviceQuery.toLowerCase().trim();
    if (!term) return true;
    return d.model.toLowerCase().includes(term) || d.imei.includes(deviceQuery.trim()) || d.brand.toLowerCase().includes(term);
  });

  const resetForms = () => {
    setDeviceQuery(''); setPickedDeviceId(''); setIntDefect(''); setIntDiagnosis(''); setIntNotes(''); setIntDate(todayISO());
    setCustomerId(''); setNewCustomerMode(false); setNewCustName(''); setNewCustPhone('');
    setExtBrand('Apple'); setExtModel(''); setExtStorage(''); setExtColor(''); setExtImei('');
    setExtDefect(''); setExtDiagnosis(''); setExtNotes(''); setExtDate(todayISO());
    setExtImei2(''); setExtDelivery(''); setExtChecklist({});
    setServiceDone(''); setPartsUsed(''); setPartsCost(''); setServiceCost(''); setChargedAmount('');
    setPaymentStatus('pending'); setPaymentMethod('pix'); setCancelReason(''); setError('');
  };

  const closeNew = () => { setNewStep('closed'); resetForms(); };
  const closeAction = () => { setAction(null); resetForms(); };

  const entryDateToISO = (day: string) => (day ? new Date(`${day}T12:00:00`).toISOString() : undefined);

  const handleCreateInternal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pickedDevice) { setError('Selecione um aparelho do estoque.'); return; }
    const result = store.sendDeviceToAssistance({
      tenantId, deviceId: pickedDevice.id, userId: currentUser.id, userRole: currentUser.role,
      defect: intDefect, diagnosis: intDiagnosis, notes: intNotes, enteredAt: entryDateToISO(intDate)
    });
    if (!result.ok) { setError(result.error || 'Erro ao criar a assistência.'); return; }
    closeNew();
    setTab('internal');
  };

  const handleCreateExternal = (e: React.FormEvent) => {
    e.preventDefault();
    let ownerId = customerId;
    if (newCustomerMode) {
      if (!newCustName.trim() || !newCustPhone.trim()) { setError('Informe nome e telefone do novo cliente.'); return; }
      ownerId = 'cust-' + Date.now();
      store.customers.unshift({
        id: ownerId, tenant_id: tenantId, name: newCustName.trim(), phone: newCustPhone.trim(),
        whatsapp: newCustPhone.trim(), created_at: new Date().toISOString()
      });
    }
    const result = store.createExternalAssistance({
      tenantId, customerId: ownerId, userId: currentUser.id, userRole: currentUser.role,
      brand: extBrand, model: extModel, storage: extStorage, color: extColor, imei: extImei,
      defect: extDefect, diagnosis: extDiagnosis, notes: extNotes, enteredAt: entryDateToISO(extDate),
      imei2: extImei2, checklist: extChecklist, estimatedDeliveryDate: extDelivery || undefined
    });
    if (!result.ok) {
      // desfaz o cliente recém-criado para não deixar registro órfão
      if (newCustomerMode) store.customers = store.customers.filter(c => c.id !== ownerId);
      setError(result.error || 'Erro ao criar a assistência.');
      return;
    }
    // A Ordem de Serviço (contrato com o cliente) é gerada automaticamente ao abrir a assistência
    if (result.order && currentTenant) {
      const built = getServiceOrderDocument({ os: result.order, tenant: currentTenant, theme: currentTheme });
      void downloadBuiltDocument(built);
    }
    closeNew();
    setTab('external');
  };

  const handleStatusChange = (os: ServiceOrder, newStatus: 'in_maintenance' | 'waiting_parts') => {
    const result = store.updateAssistanceStatus({ tenantId, osId: os.id, userId: currentUser.id, newStatus });
    if (!result.ok) alert(result.error);
  };

  const openAction = (kind: ActionKind, os: ServiceOrder) => {
    resetForms();
    setAction({ kind, osId: os.id });
    if (kind === 'deliver') {
      setChargedAmount(os.client_quote_amount ? String(os.client_quote_amount) : '');
    }
    if (kind === 'complete' && os.client_quote_amount) {
      setChargedAmount(String(os.client_quote_amount));
    }
  };

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionOs) return;
    const base = {
      tenantId, osId: actionOs.id, userId: currentUser.id, userRole: currentUser.role,
      serviceDone, partsUsed, partsCost: parseFloat(partsCost) || 0, serviceCost: parseFloat(serviceCost) || 0
    };
    const result = actionOs.origin === 'internal'
      ? store.completeInternalAssistance(base)
      : store.completeExternalAssistance({
          ...base,
          chargedAmount: parseFloat(chargedAmount) || 0,
          paymentStatus,
          paymentMethod: paymentStatus === 'paid' ? paymentMethod : undefined
        });
    if (!result.ok) { setError(result.error || 'Não foi possível concluir.'); return; }
    closeAction();
    setDetailOsId(null);
  };

  const handleDeliver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionOs) return;
    const amount = actionOs.payment_status === 'paid' ? Number(actionOs.paid_amount) : parseFloat(chargedAmount);
    if (!(amount >= 0)) { setError('Informe o valor recebido.'); return; }
    const ok = store.sellerCheckoutServiceOrder({
      tenantId, osId: actionOs.id, sellerId: currentUser.id, paymentMethod, paidAmount: amount
    });
    if (!ok) { setError('Esta ordem não está aguardando retirada ou já foi entregue.'); return; }
    closeAction();
    setDetailOsId(null);
  };

  const handleCancel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionOs) return;
    const result = store.cancelAssistance({
      tenantId, osId: actionOs.id, userId: currentUser.id, userRole: currentUser.role, reason: cancelReason
    });
    if (!result.ok) { setError(result.error || 'Não foi possível cancelar.'); return; }
    closeAction();
    setDetailOsId(null);
  };

  const syncQuoteTotal = (service: string, parts: string) => {
    const sum = (parseFloat(service) || 0) + (parseFloat(parts) || 0);
    if (sum > 0) setClientQuoteInput(sum.toFixed(2));
  };

  const openQuoteModal = (os: ServiceOrder) => {
    setQuoteModalOS(os);
    setClientQuoteInput(os.client_quote_amount ? String(os.client_quote_amount) : '');
    setQuoteService(os.quote_service_description || os.service_needed || '');
    setQuoteServiceAmount(os.quote_service_amount ? String(os.quote_service_amount) : '');
    setQuoteParts(os.quote_parts_description || '');
    setQuotePartsAmount(os.quote_parts_amount ? String(os.quote_parts_amount) : '');
    setQuoteDeadline(os.quote_deadline || '');
  };

  const handleSaveQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quoteModalOS || !clientQuoteInput) return;
    store.adminSetServiceOrderQuote({
      tenantId, osId: quoteModalOS.id, adminId: currentUser.id, clientQuoteAmount: parseFloat(clientQuoteInput),
      serviceDescription: quoteService, serviceAmount: parseFloat(quoteServiceAmount) || undefined,
      partsDescription: quoteParts, partsAmount: parseFloat(quotePartsAmount) || undefined, deadline: quoteDeadline
    });
    setQuoteModalOS(null);
    setClientQuoteInput('');
  };

  const statusBadge = (st: OSStatus) => {
    const meta = STATUS_META[st] || { label: st, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
    return (
      <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-semibold border ${meta.cls}`}>
        {meta.label}
      </span>
    );
  };

  const originBadge = (os: ServiceOrder) =>
    os.origin === 'internal' ? (
      <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-700">
        Interna — Estoque da Loja
      </span>
    ) : (
      <span className="inline-block whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
        Externa — Cliente / Terceiro
      </span>
    );

  const internalCount = allOrders.filter(o => o.origin === 'internal').length;
  const externalCount = allOrders.filter(o => o.origin === 'external').length;

  const quotePending = (os: ServiceOrder) =>
    os.origin === 'external' && (os.status === 'quote_pending_admin' || os.status === 'quote_ready');

  const renderActions = (os: ServiceOrder) => {
    const closed = Boolean(os.closed_at);
    const btn = 'px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition-all';
    const neutral = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
    if (closed) return null;
    return (
      <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
        {(os.status === 'waiting_diagnosis' || os.status === 'in_diagnosis') && (
          <button type="button" onClick={() => handleStatusChange(os, 'in_maintenance')} className={neutral}>
            <Wrench className="w-3.5 h-3.5" /> Iniciar Manutenção
          </button>
        )}
        {os.status === 'in_maintenance' && (
          <button type="button" onClick={() => handleStatusChange(os, 'waiting_parts')} className={neutral}>
            Aguardando Peça
          </button>
        )}
        {os.status === 'waiting_parts' && (
          <button type="button" onClick={() => handleStatusChange(os, 'in_maintenance')} className={neutral}>
            Retomar Manutenção
          </button>
        )}
        {os.status !== 'ready_for_pickup' && (
          <button type="button" onClick={() => openAction('cancel', os)} className={`${btn} border border-rose-200 bg-white text-rose-600 hover:bg-rose-50`}>
            <Ban className="w-3.5 h-3.5" /> Cancelar
          </button>
        )}
        {os.status === 'in_maintenance' && os.origin === 'internal' && (
          <button type="button" onClick={() => openAction('complete', os)} className={`${btn} btn-tenant-primary`}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Concluir e Devolver ao Estoque
          </button>
        )}
        {os.status === 'in_maintenance' && os.origin === 'external' && (
          <button type="button" onClick={() => openAction('complete', os)} className={`${btn} btn-tenant-primary`}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Concluir Manutenção
          </button>
        )}
        {os.status === 'ready_for_pickup' && os.origin === 'external' && (
          <button type="button" onClick={() => openAction('deliver', os)} className={`${btn} btn-tenant-primary`}>
            <PackageCheck className="w-3.5 h-3.5" /> Entregar ao Cliente
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-600" />
            Assistência Técnica
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Interna: aparelhos da loja que voltam ao estoque. Externa: aparelhos de clientes devolvidos ao proprietário.
          </p>
        </div>

        <button
          onClick={() => { resetForms(); setNewStep('choose'); }}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Nova Assistência
        </button>
      </div>

      {/* ABAS + BUSCA */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl w-full sm:w-fit overflow-x-auto">
          {([
            { id: 'internal', label: 'Assistência Interna', count: internalCount },
            { id: 'external', label: 'Assistência Externa', count: externalCount }
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nº da Ordem, Aparelho, IMEI ou Cliente..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-white"
          />
        </div>
      </div>

      {/* TABELA */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 whitespace-nowrap">Nº da Ordem</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Aparelho / Modelo</th>
                <th className="py-3.5 px-4 whitespace-nowrap">IMEI</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Origem</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Cliente / Proprietário</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Defeito</th>
                <th className="py-3.5 px-4 whitespace-nowrap">Data de Entrada</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-center">Status</th>
                <th className="py-3.5 px-4 whitespace-nowrap text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tabOrders.map((os) => (
                <tr
                  key={os.id}
                  onClick={() => openDetails(os)}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                >
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">OS #{os.os_number}</td>
                  <td className="py-3.5 px-4">
                    <div className="font-bold text-slate-800 whitespace-nowrap">{os.device_brand} {os.device_model}</div>
                    {(os.device_storage || os.device_color) && (
                      <div className="text-[11px] text-slate-500 whitespace-nowrap">
                        {[os.device_storage, os.device_color].filter(Boolean).join(' - ')}
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                    {os.imei || <span className="text-slate-400">Não informado</span>}
                  </td>
                  <td className="py-3.5 px-4">{originBadge(os)}</td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800">
                    <div className="max-w-[160px] truncate" title={ownerName(os)}>{ownerName(os)}</div>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="max-w-[200px] truncate text-slate-600" title={os.reported_defect}>{os.reported_defect}</div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">{formatDate(os.entered_at || os.created_at)}</td>
                  <td className="py-3.5 px-4 text-center">{statusBadge(os.status)}</td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {quotePending(os) && (
                        <button
                          onClick={() => openQuoteModal(os)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] whitespace-nowrap"
                        >
                          {os.client_quote_amount ? 'Ajustar Valor' : 'Definir Orçamento'}
                        </button>
                      )}
                      <button
                        onClick={() => openDetails(os)}
                        title="Ver detalhes da assistência"
                        aria-label="Ver detalhes da assistência"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tabOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-medium">
                    Nenhuma assistência {tab === 'internal' ? 'interna' : 'externa'} encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETALHES DA ASSISTÊNCIA */}
      {detailOs && !action && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-amber-600 shrink-0" />
                  <span className="truncate">OS #{detailOs.os_number} — {detailOs.device_brand} {detailOs.device_model}</span>
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  {[detailOs.device_storage, detailOs.device_color].filter(Boolean).join(' - ') || 'Sem capacidade/cor informadas'}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {statusBadge(detailOs.status)}
                <button onClick={() => setDetailOsId(null)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={cardLabelCls}>Origem</span>
                  <span className="font-semibold text-slate-800">
                    {detailOs.origin === 'internal' ? 'Estoque da Loja' : 'Cliente / Terceiro'}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={cardLabelCls}>Proprietário</span>
                  <span className="font-semibold text-slate-800">{ownerName(detailOs)}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={cardLabelCls}>Destino</span>
                  <span className="font-semibold text-slate-800">
                    {detailOs.origin === 'internal' ? 'Retornar ao Estoque' : 'Entregar ao Proprietário'}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={cardLabelCls}>IMEI</span>
                  <span className="font-mono font-semibold text-slate-800">{detailOs.imei || 'Não informado'}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={cardLabelCls}>Data de Entrada na Assistência</span>
                  <span className="font-semibold text-slate-800">{formatDate(detailOs.entered_at || detailOs.created_at)}</span>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <span className={cardLabelCls}>Conclusão</span>
                  <span className="font-semibold text-slate-800">{formatDate(detailOs.completed_at)}</span>
                </div>
              </div>

              <div>
                <span className={cardLabelCls}>Defeito Apresentado</span>
                <p className="text-slate-700 leading-relaxed">{detailOs.reported_defect}</p>
              </div>
              {detailOs.technician_diagnosis && (
                <div>
                  <span className={cardLabelCls}>Diagnóstico</span>
                  <p className="text-slate-700 leading-relaxed">{detailOs.technician_diagnosis}</p>
                </div>
              )}
              {(detailOs.problem_found || detailOs.service_needed || detailOs.technical_notes) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><span className={cardLabelCls}>Problema Encontrado</span><p className="text-slate-700">{detailOs.problem_found || '—'}</p></div>
                  <div><span className={cardLabelCls}>Serviço Necessário</span><p className="text-slate-700">{detailOs.service_needed || '—'}</p></div>
                  <div><span className={cardLabelCls}>Observações Técnicas</span><p className="text-slate-700">{detailOs.technical_notes || '—'}</p></div>
                </div>
              )}
              {detailOs.service_performed && (
                <div>
                  <span className={cardLabelCls}>Serviço Realizado</span>
                  <p className="text-slate-700 leading-relaxed">
                    {detailOs.service_performed}
                    {detailOs.parts_used && <span className="text-slate-500"> | Peças: {detailOs.parts_used}</span>}
                  </p>
                </div>
              )}
              {detailOs.physical_condition && (
                <div>
                  <span className={cardLabelCls}>Observações</span>
                  <p className="text-slate-700 leading-relaxed">{detailOs.physical_condition}</p>
                </div>
              )}

              {/* GARANTIA COMERCIAL VINCULADA (EXTERNA) */}
              {detailWarranty && (
                <div className="rounded-xl p-3 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={cardLabelCls}>Garantia Comercial do Aparelho</span>
                    <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold border ${WARRANTY_STATUS_META[getWarrantyStatus(detailWarranty)].cls}`}>
                      {WARRANTY_STATUS_META[getWarrantyStatus(detailWarranty)].label}
                    </span>
                  </div>
                  <p className="text-slate-600">
                    Compra em {formatWarrantyDay(detailWarranty.sale_date)} | Prazo de {detailWarranty.warranty_days} dias | Vencimento em {formatWarrantyDay(detailWarranty.end_date)}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={analysisResult}
                      onChange={(e) => setAnalysisResult(e.target.value as 'pending' | 'covered' | 'not_covered')}
                      aria-label="Resultado da análise de garantia"
                      className={inputCls}
                    >
                      <option value="pending">Análise pendente</option>
                      <option value="covered">Coberto pela garantia</option>
                      <option value="not_covered">Não coberto</option>
                    </select>
                    <input
                      type="text"
                      value={analysisNotes}
                      onChange={(e) => setAnalysisNotes(e.target.value)}
                      placeholder="Observações da análise"
                      className={`${inputCls} sm:col-span-2`}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveAnalysis}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[11px] hover:bg-slate-50"
                    >
                      Registrar Resultado da Análise
                    </button>
                  </div>
                </div>
              )}

              {/* CUSTOS */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl p-3 border border-slate-200">
                  <span className={cardLabelCls}>Custo Peças</span>
                  <span className="font-semibold text-slate-700">{formatBRL(detailOs.technician_parts_cost)}</span>
                </div>
                <div className="rounded-xl p-3 border border-slate-200">
                  <span className={cardLabelCls}>Custo Serviço</span>
                  <span className="font-semibold text-slate-700">{formatBRL(detailOs.technician_service_cost)}</span>
                </div>
                {detailOs.origin === 'internal' ? (
                  <>
                    <div className="rounded-xl p-3 border border-slate-200">
                      <span className={cardLabelCls}>Custo Aquisição</span>
                      <span className="font-semibold text-slate-700">
                        {formatBRL(store.devices.find(d => d.id === detailOs.device_id)?.acquisition_cost || 0)}
                      </span>
                    </div>
                    <div className="rounded-xl p-3 border border-slate-200">
                      <span className={cardLabelCls}>Custo Acumulado</span>
                      <span className="font-bold text-slate-900">
                        {formatBRL(
                          Number(store.devices.find(d => d.id === detailOs.device_id)?.acquisition_cost || 0) +
                          Number(store.devices.find(d => d.id === detailOs.device_id)?.accumulated_repair_cost || 0)
                        )}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl p-3 border border-slate-200">
                      <span className={cardLabelCls}>Valor Cobrado</span>
                      <span className="font-black text-blue-600">
                        {detailOs.client_quote_amount ? formatBRL(detailOs.client_quote_amount) : 'Não definido'}
                      </span>
                    </div>
                    <div className="rounded-xl p-3 border border-slate-200">
                      <span className={cardLabelCls}>Pagamento</span>
                      <span className="font-semibold text-slate-700">
                        {detailOs.payment_status === 'paid'
                          ? `Pago${detailOs.payment_method ? ` (${PAYMENT_LABELS[detailOs.payment_method] || detailOs.payment_method})` : ''}`
                          : 'Pendente'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* HISTÓRICO */}
              <div>
                <span className={`${cardLabelCls} mb-2`}>Histórico de Movimentações</span>
                <ol className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {store.getOrderMovements(detailOs).map((mov) => (
                    <li key={mov.id} className="flex items-start gap-3 text-[11px]">
                      <span className="font-mono text-slate-400 shrink-0 w-[92px]">
                        {formatDate(mov.created_at)}{' '}
                        {new Date(mov.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="text-slate-700 min-w-0">
                        {mov.description}
                        {mov.user_name && <span className="text-slate-400"> — {mov.user_name}</span>}
                        {mov.notes && <span className="block text-slate-400">{mov.notes}</span>}
                      </span>
                    </li>
                  ))}
                  {store.getOrderMovements(detailOs).length === 0 && (
                    <li className="text-[11px] text-slate-400">Nenhuma movimentação registrada para esta OS.</li>
                  )}
                </ol>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <AssistanceDocumentsMenu os={detailOs} placement="up" onNotice={setDocNotice} />
                {docNotice && <span className="text-[11px] font-semibold text-slate-500">{docNotice}</span>}
              </div>

              {renderActions(detailOs)}
              {detailOs.closed_at && (
                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setDetailOsId(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ESCOLHA OBRIGATÓRIA DA ORIGEM */}
      {newStep === 'choose' && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">Qual é a origem do aparelho?</h3>
              <button onClick={closeNew} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <button
                type="button"
                onClick={() => setNewStep('internal')}
                className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-slate-50 transition-all flex items-start gap-3"
              >
                <StoreIcon className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                <span>
                  <span className="block font-extrabold text-slate-800 uppercase tracking-wide">Assistência Interna — Aparelho da Loja</span>
                  <span className="block text-slate-500 mt-0.5">
                    Seleciona um aparelho do estoque. Ele sai do estoque e retorna após o reparo.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setNewStep('external')}
                className="w-full text-left p-4 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-slate-50 transition-all flex items-start gap-3"
              >
                <UserRound className="w-5 h-5 text-slate-600 mt-0.5 shrink-0" />
                <span>
                  <span className="block font-extrabold text-slate-800 uppercase tracking-wide">Assistência Externa — Cliente / Terceiro</span>
                  <span className="block text-slate-500 mt-0.5">
                    Aparelho do cliente. Não entra no estoque e é devolvido ao proprietário.
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NOVA ASSISTÊNCIA INTERNA */}
      {newStep === 'internal' && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl animate-fade-in max-h-[90vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <button onClick={() => { resetForms(); setNewStep('choose'); }} className="text-slate-400 hover:text-slate-700" aria-label="Voltar">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                Assistência Interna — Aparelho da Loja
              </h3>
              <button onClick={closeNew} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInternal} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Buscar aparelho do estoque (modelo ou IMEI) *</label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={deviceQuery}
                    onChange={(e) => { setDeviceQuery(e.target.value); setPickedDeviceId(''); }}
                    placeholder="Ex: iPhone 15 ou 3548920..."
                    className={`${inputCls} pl-9`}
                  />
                </div>
                {!pickedDevice && (
                  <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {deviceMatches.slice(0, 20).map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => setPickedDeviceId(d.id)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50"
                        >
                          <span className="font-bold text-slate-800">{d.brand} {d.model}</span>
                          <span className="text-slate-500"> ({d.storage_capacity} - {d.color})</span>
                          <span className="block font-mono text-[11px] text-slate-400">IMEI {d.imei}</span>
                        </button>
                      </li>
                    ))}
                    {deviceMatches.length === 0 && (
                      <li className="px-3 py-3 text-slate-400">Nenhum aparelho disponível encontrado.</li>
                    )}
                  </ul>
                )}
              </div>

              {pickedDevice && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-slate-800">
                      {pickedDevice.brand} {pickedDevice.model}{' '}
                      <span className="font-normal text-slate-500">({pickedDevice.storage_capacity} - {pickedDevice.color})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickedDeviceId('')}
                      className="text-[11px] font-semibold text-blue-600 hover:underline shrink-0"
                    >
                      Trocar
                    </button>
                  </div>
                  <div className="font-mono text-slate-600">IMEI {pickedDevice.imei}</div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1 text-slate-600">
                    <span>Fornecedor: <b className="text-slate-800">{store.getSupplierName(pickedDevice.supplier_id)}</b></span>
                    <span>Entrada: <b className="text-slate-800">{formatDate(pickedDevice.entry_date)}</b></span>
                    <span>Aquisição: <b className="text-slate-800">{formatBRL(pickedDevice.acquisition_cost)}</b></span>
                    <span>
                      Acumulado:{' '}
                      <b className="text-slate-800">
                        {formatBRL(Number(pickedDevice.acquisition_cost) + Number(pickedDevice.accumulated_repair_cost))}
                      </b>
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">Defeito Apresentado *</label>
                <textarea rows={2} value={intDefect} onChange={(e) => setIntDefect(e.target.value)} className={inputCls} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Diagnóstico Inicial</label>
                  <input type="text" value={intDiagnosis} onChange={(e) => setIntDiagnosis(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Data de Entrada na Assistência</label>
                  <input type="date" value={intDate} max={todayISO()} onChange={(e) => setIntDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Observações</label>
                <textarea rows={2} value={intNotes} onChange={(e) => setIntNotes(e.target.value)} className={inputCls} />
              </div>

              {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
              </div>

              <div className="shrink-0 flex items-center justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
                <button type="button" onClick={closeNew} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Cancelar
                </button>
                <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">
                  Abrir Assistência Interna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NOVA ASSISTÊNCIA EXTERNA */}
      {newStep === 'external' && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl animate-fade-in max-h-[90vh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <button onClick={() => { resetForms(); setNewStep('choose'); }} className="text-slate-400 hover:text-slate-700" aria-label="Voltar">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                Assistência Externa — Cliente / Terceiro
              </h3>
              <button onClick={closeNew} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExternal} className="flex flex-col flex-1 min-h-0 text-xs">
              <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">Cliente / Proprietário *</label>
                  <button
                    type="button"
                    onClick={() => setNewCustomerMode(v => !v)}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    {newCustomerMode ? 'Selecionar cliente cadastrado' : 'Cadastrar novo cliente'}
                  </button>
                </div>
                {newCustomerMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input type="text" placeholder="Nome completo" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} className={inputCls} />
                    <input type="text" placeholder="Telefone" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} className={inputCls} />
                  </div>
                ) : (
                  <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inputCls} required>
                    <option value="">Selecione o cliente...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Marca</label>
                  <input type="text" value={extBrand} onChange={(e) => setExtBrand(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Modelo *</label>
                  <input type="text" placeholder="Ex: iPhone 13" value={extModel} onChange={(e) => setExtModel(e.target.value)} className={inputCls} required />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Capacidade</label>
                  <input type="text" placeholder="128GB" value={extStorage} onChange={(e) => setExtStorage(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Cor</label>
                  <input type="text" value={extColor} onChange={(e) => setExtColor(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">IMEI</label>
                  <input type="text" value={extImei} onChange={(e) => setExtImei(e.target.value)} className={`${inputCls} font-mono`} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">IMEI 2 (se houver)</label>
                  <input type="text" value={extImei2} onChange={(e) => setExtImei2(e.target.value)} className={`${inputCls} font-mono`} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Previsão de Entrega</label>
                  <input type="date" value={extDelivery} min={todayISO()} onChange={(e) => setExtDelivery(e.target.value)} className={inputCls} />
                </div>
              </div>
              {imeiWarranty && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-0.5 text-slate-600">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800">Garantia comercial encontrada para este IMEI</span>
                    <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold border ${WARRANTY_STATUS_META[getWarrantyStatus(imeiWarranty)].cls}`}>
                      {WARRANTY_STATUS_META[getWarrantyStatus(imeiWarranty)].label}
                    </span>
                  </div>
                  <div>
                    Proprietário: <b className="text-slate-800">{customers.find(c => c.id === imeiWarranty.customer_id)?.name || 'Cliente'}</b>
                    {' | '}Venda: <b className="text-slate-800">{store.sales.find(sl => sl.id === imeiWarranty.sale_id)?.sale_number ? `#${store.sales.find(sl => sl.id === imeiWarranty.sale_id)?.sale_number}` : 'Upgrade'}</b>
                  </div>
                  <div>
                    Compra: <b className="text-slate-800">{formatWarrantyDay(imeiWarranty.sale_date)}</b>
                    {' | '}Prazo: <b className="text-slate-800">{imeiWarranty.warranty_days} dias</b>
                    {' | '}Vencimento: <b className="text-slate-800">{formatWarrantyDay(imeiWarranty.end_date)}</b>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Informação de apoio: a cobertura não é aprovada nem negada automaticamente. Registre o resultado da análise na OS.
                  </div>
                </div>
              )}

              <div>
                <label className="font-bold text-slate-700 block mb-1">Defeito Apresentado *</label>
                <textarea rows={2} value={extDefect} onChange={(e) => setExtDefect(e.target.value)} className={inputCls} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Diagnóstico Inicial</label>
                  <input type="text" value={extDiagnosis} onChange={(e) => setExtDiagnosis(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Data de Entrada</label>
                  <input type="date" value={extDate} max={todayISO()} onChange={(e) => setExtDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <ChecklistField value={extChecklist} onChange={setExtChecklist} />

              <div>
                <label className="font-bold text-slate-700 block mb-1">Observações sobre o estado do aparelho</label>
                <textarea rows={2} value={extNotes} onChange={(e) => setExtNotes(e.target.value)} className={inputCls} />
              </div>

              <p className="text-[11px] text-slate-500">
                O aparelho pertence ao cliente: não entra no estoque nem no valor patrimonial da loja.
                A Ordem de Serviço em PDF é gerada automaticamente ao abrir a assistência.
              </p>
              {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
              </div>

              <div className="shrink-0 flex items-center justify-end gap-3 border-t border-slate-100 bg-white px-6 py-4">
                <button type="button" onClick={closeNew} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Cancelar
                </button>
                <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">
                  Abrir Assistência Externa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONCLUIR (INTERNA: DEVOLVER AO ESTOQUE | EXTERNA: AGUARDANDO RETIRADA) */}
      {action?.kind === 'complete' && actionOs && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                {actionOs.origin === 'internal' ? 'Concluir e Devolver ao Estoque' : 'Concluir Manutenção'} — OS #{actionOs.os_number}
              </h3>
              <button onClick={closeAction} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleComplete} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Serviço Realizado *</label>
                <textarea rows={2} value={serviceDone} onChange={(e) => setServiceDone(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Peças Utilizadas</label>
                <input type="text" value={partsUsed} onChange={(e) => setPartsUsed(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Custo das Peças (R$)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={partsCost} onChange={(e) => setPartsCost(e.target.value)} className={`${inputCls} font-bold`} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Custo do Serviço (R$)</label>
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={serviceCost} onChange={(e) => setServiceCost(e.target.value)} className={`${inputCls} font-bold`} />
                </div>
              </div>

              {actionOs.origin === 'internal' ? (
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  O custo informado será somado ao custo acumulado do aparelho e ele voltará ao estoque disponível,
                  mantendo IMEI, fornecedor e data original de entrada.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Valor Cobrado do Cliente (R$) *</label>
                      <input type="number" step="0.01" min="0" value={chargedAmount} onChange={(e) => setChargedAmount(e.target.value)} className={`${inputCls} font-bold text-blue-600`} required />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Situação do Pagamento</label>
                      <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'pending' | 'paid')} className={inputCls}>
                        <option value="pending">Pendente (cobrar na retirada)</option>
                        <option value="paid">Pago</option>
                      </select>
                    </div>
                  </div>
                  {paymentStatus === 'paid' && (
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">Forma de Pagamento</label>
                      <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={inputCls}>
                        {Object.entries(PAYMENT_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>{label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    A OS ficará como Aguardando Retirada. O aparelho continua vinculado ao cliente e nunca entra no estoque.
                  </p>
                </>
              )}

              {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={closeAction} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Voltar
                </button>
                <button type="submit" className="px-5 py-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md">
                  {actionOs.origin === 'internal' ? 'Concluir e Devolver ao Estoque' : 'Concluir Manutenção'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ENTREGAR AO CLIENTE */}
      {action?.kind === 'deliver' && actionOs && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-emerald-600" />
                Entregar ao Cliente — OS #{actionOs.os_number}
              </h3>
              <button onClick={closeAction} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeliver} className="space-y-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 space-y-1">
                <div className="font-bold text-slate-800">{actionOs.device_brand} {actionOs.device_model}</div>
                <div className="text-slate-600">Proprietário: <b className="text-slate-800">{ownerName(actionOs)}</b></div>
                <div className="text-slate-600">
                  Valor do serviço: <b className="text-slate-800">{formatBRL(actionOs.client_quote_amount || 0)}</b>{' '}
                  {actionOs.payment_status === 'paid' ? '(já pago)' : '(pendente)'}
                </div>
              </div>

              {actionOs.payment_status !== 'paid' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Valor Recebido (R$) *</label>
                    <input type="number" step="0.01" min="0" value={chargedAmount} onChange={(e) => setChargedAmount(e.target.value)} className={`${inputCls} font-bold`} required />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Forma de Pagamento</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={inputCls}>
                      {Object.entries(PAYMENT_LABELS).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={closeAction} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Voltar
                </button>
                <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">
                  Confirmar Entrega
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCELAR */}
      {action?.kind === 'cancel' && actionOs && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">Cancelar OS #{actionOs.os_number}</h3>
              <button onClick={closeAction} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCancel} className="space-y-3 text-xs">
              <p className="text-slate-600 leading-relaxed">
                {actionOs.origin === 'internal'
                  ? 'O aparelho será devolvido ao estoque disponível sem custo de manutenção.'
                  : 'A ordem de serviço será encerrada e o aparelho deve ser devolvido ao cliente.'}
              </p>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Motivo do Cancelamento *</label>
                <textarea rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className={inputCls} required />
              </div>
              {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={closeAction} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Voltar
                </button>
                <button type="submit" className="px-5 py-2 font-bold rounded-xl bg-rose-600 hover:bg-rose-700 text-white">
                  Cancelar Assistência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ORÇAMENTO (EXCLUSIVO DO ADMINISTRADOR) */}
      {quoteModalOS && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-blue-600" />
                Definir Preço Cobrado do Cliente — OS #{quoteModalOS.os_number}
              </h3>
              <button onClick={() => setQuoteModalOS(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 mb-4 text-xs space-y-1.5">
              <div className="font-bold text-slate-800">
                Aparelho: {quoteModalOS.device_brand} {quoteModalOS.device_model}
              </div>
              <div className="text-slate-600">
                <strong>Diagnóstico Técnico:</strong> {quoteModalOS.technician_diagnosis || 'Não informado'}
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-slate-700">
                <span>Custo Peças: {formatBRL(quoteModalOS.technician_parts_cost)}</span>
                <span>Custo Reparo: {formatBRL(quoteModalOS.technician_service_cost)}</span>
                <span className="font-bold text-slate-900">
                  Custo Total: {formatBRL(Number(quoteModalOS.technician_parts_cost) + Number(quoteModalOS.technician_service_cost))}
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveQuote} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Serviço</label>
                  <input type="text" placeholder="Ex: Troca do conector de carga" value={quoteService} onChange={(e) => setQuoteService(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Valor do Serviço (R$)</label>
                  <input
                    type="number" step="0.01" min="0" placeholder="0.00" value={quoteServiceAmount}
                    onChange={(e) => { setQuoteServiceAmount(e.target.value); syncQuoteTotal(e.target.value, quotePartsAmount); }}
                    className={`${inputCls} font-bold`}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 block mb-1">Peças Utilizadas</label>
                  <input type="text" placeholder="Ex: Conector de carga original" value={quoteParts} onChange={(e) => setQuoteParts(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Valor das Peças (R$)</label>
                  <input
                    type="number" step="0.01" min="0" placeholder="0.00" value={quotePartsAmount}
                    onChange={(e) => { setQuotePartsAmount(e.target.value); syncQuoteTotal(quoteServiceAmount, e.target.value); }}
                    className={`${inputCls} font-bold`}
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="font-bold text-slate-700 block mb-1">Prazo Estimado</label>
                  <input type="text" placeholder="Ex: 2 dias úteis após a aprovação" value={quoteDeadline} onChange={(e) => setQuoteDeadline(e.target.value)} className={inputCls} />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">
                  Valor Total Cobrado do Cliente (R$) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={clientQuoteInput}
                  onChange={(e) => setClientQuoteInput(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-extrabold text-base text-blue-600"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Somente o administrador define este preço. Ao informar serviço e peças, o total é somado automaticamente. Estes dados saem no Orçamento e na Ordem de Serviço.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setQuoteModalOS(null)} className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl">
                  Cancelar
                </button>
                <button type="submit" className="btn-tenant-primary px-5 py-2 font-bold rounded-xl">
                  Confirmar Orçamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
