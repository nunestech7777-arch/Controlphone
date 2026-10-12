// ============================================================================
// CONTROLPHONE — BALCÃO DE ASSISTÊNCIA TÉCNICA (VENDEDOR)
// ============================================================================

import React, { useState } from 'react';
import { Wrench, Plus, CheckCircle2, DollarSign, Search, X, Smartphone, ArrowRight } from 'lucide-react';
import { store } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { ChecklistField } from '../../components/shared/ChecklistField';
import { IntakeChecklist } from '../../lib/assistanceChecklist';
import { getServiceOrderDocument } from '../../lib/pdf/assistanceDocuments';
import { downloadBuiltDocument, viewBuiltDocument } from '../../lib/pdf/documentActions';
import { ServiceOrder, PaymentMethod } from '../../types';

export const SellerOSIntake: React.FC = () => {
  const { currentTenant, currentUser, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkoutOS, setCheckoutOS] = useState<ServiceOrder | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Form states de Abertura de OS
  const [customerId, setCustomerId] = useState('');
  const [brand, setBrand] = useState('Apple');
  const [model, setModel] = useState('');
  const [imei, setImei] = useState('');
  const [defect, setDefect] = useState('');
  const [condition, setCondition] = useState('');
  const [checklist, setChecklist] = useState<IntakeChecklist>({});

  // Checkout states
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');

  const customers = store.customers.filter(c => c.tenant_id === tenantId);
  const serviceOrders = store.serviceOrders.filter(o => o.tenant_id === tenantId && o.origin === 'external');

  const filteredOS = serviceOrders.filter(o => {
    const cust = store.customers.find(c => c.id === o.customer_id);
    return (
      o.os_number.toString().includes(searchTerm) ||
      o.device_model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleOpenOS = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !model || !defect) return;

    const created = store.createServiceOrder({
      tenantId,
      customerId,
      sellerId: currentUser.id,
      brand,
      model,
      imei,
      reportedDefect: defect,
      physicalCondition: condition,
      checklist
    });

    // A Ordem de Serviço (contrato com o cliente) é gerada automaticamente ao abrir a assistência
    if (currentTenant) {
      const built = getServiceOrderDocument({ os: created, tenant: currentTenant, theme: currentTheme });
      void downloadBuiltDocument(built);
    }

    alert('Ordem de Serviço aberta com sucesso e encaminhada para a bancada técnica!');
    setIsModalOpen(false);
    setModel('');
    setImei('');
    setDefect('');
    setCondition('');
    setChecklist({});
  };

  const handleApproveQuote = (os: ServiceOrder, approved: boolean) => {
    store.updateClientQuoteApproval({
      tenantId,
      osId: os.id,
      sellerId: currentUser.id,
      approved,
      rejectionReason: approved ? undefined : 'Cliente achou o valor acima do esperado'
    });
    alert(approved ? 'Orçamento aprovado pelo cliente! Encaminhado para execução técnica.' : 'Orçamento recusado.');
  };

  const handleDeliverAndCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutOS) return;

    store.sellerCheckoutServiceOrder({
      tenantId,
      osId: checkoutOS.id,
      sellerId: currentUser.id,
      paymentMethod,
      paidAmount: Number(checkoutOS.client_quote_amount) || 0
    });

    alert(`Aparelho da OS #${checkoutOS.os_number} entregue ao cliente e pagamento registrado com sucesso!`);
    setCheckoutOS(null);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <Wrench className="w-5 h-5 text-amber-600" />
            Balcão de Assistência Técnica (Atendimento ao Cliente)
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Abertura de ordens de serviço, comunicação de orçamentos autorizados, recebimento e entrega ao cliente.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Abrir Nova OS (Entrada Aparelho)
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por Nº da Ordem, Aparelho ou Cliente..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* TABELA DE OS PARA O VENDEDOR */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Nº da Ordem</th>
                <th className="py-3.5 px-4">Cliente</th>
                <th className="py-3.5 px-4">Aparelho & Defeito</th>
                <th className="py-3.5 px-4">Orçamento Aprovado (Admin)</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Ação do Vendedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOS.map((os) => {
                const customer = store.customers.find(c => c.id === os.customer_id);
                return (
                  <tr key={os.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      OS #{os.os_number}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">
                      <div>{customer?.name}</div>
                      <span className="text-[10px] text-slate-400">{customer?.phone}</span>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-slate-800">{os.device_brand} {os.device_model}</div>
                      <p className="text-[11px] text-slate-500 truncate">{os.reported_defect}</p>
                    </td>
                    <td className="py-3.5 px-4 font-black text-blue-600">
                      {os.client_quote_amount ? `R$ ${Number(os.client_quote_amount).toFixed(2)}` : (
                        <span className="text-slate-400 font-normal">Aguardando Avaliação</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        os.status === 'ready_for_pickup'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 animate-pulse'
                          : os.status === 'quote_ready'
                          ? 'bg-indigo-50 text-indigo-700'
                          : os.status === 'delivered'
                          ? 'bg-slate-100 text-slate-600'
                          : 'bg-amber-50 text-amber-700'
                      }`}>
                        {os.status === 'ready_for_pickup' ? 'Pronto p/ Retirada' : os.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => {
                          if (!currentTenant) return;
                          const built = getServiceOrderDocument({ os, tenant: currentTenant, theme: currentTheme });
                          void viewBuiltDocument(built);
                        }}
                        title="Abrir a Ordem de Serviço em PDF"
                        className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px]"
                      >
                        Ver Ordem
                      </button>
                      {os.status === 'quote_ready' && (
                        <div className="inline-flex gap-1.5">
                          <button
                            onClick={() => handleApproveQuote(os, true)}
                            className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-bold text-[11px] shadow-sm"
                          >
                            Cliente Aprovou
                          </button>
                          <button
                            onClick={() => handleApproveQuote(os, false)}
                            className="px-2.5 py-1 rounded-xl bg-rose-50 text-rose-700 font-bold text-[11px]"
                          >
                            Recusou
                          </button>
                        </div>
                      )}

                      {os.status === 'ready_for_pickup' && (
                        <button
                          onClick={() => setCheckoutOS(os)}
                          className="btn-tenant-primary px-3 py-1.5 rounded-xl font-bold text-[11px] inline-flex items-center gap-1.5"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          Cobrar & Entregar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE ABERTURA DE OS */}
      {isModalOpen && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-600" />
                Abertura de Ordem de Serviço (Balcão)
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOpenOS} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Cliente *</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
                  required
                >
                  <option value="">Selecione o cliente...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Marca *</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Modelo *</label>
                  <input
                    type="text"
                    placeholder="Ex: iPhone 14 Pro Max"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Número do IMEI</label>
                <input
                  type="text"
                  placeholder="IMEI (se disponível)"
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Defeito Relatado pelo Cliente *</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Não liga após queda, tela apagada, conector com mau contato..."
                  value={defect}
                  onChange={(e) => setDefect(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <ChecklistField value={checklist} onChange={setChecklist} />

              <div>
                <label className="font-bold text-slate-700 block mb-1">Observações</label>
                <input
                  type="text"
                  placeholder="Ex: Tela quebrada, tampa com riscos, aparelho não liga..."
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn-tenant-primary px-5 py-2 font-bold rounded-xl"
                >
                  Abrir Ordem de Serviço
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE ENTREGA E COBRANÇA */}
      {checkoutOS && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Receber Pagamento & Entregar — OS #{checkoutOS.os_number}
              </h3>
              <button onClick={() => setCheckoutOS(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleDeliverAndCheckout} className="space-y-4 text-xs">
              <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 flex justify-between items-center">
                <span className="font-bold text-emerald-900">Total a Cobrar:</span>
                <span className="text-2xl font-black text-emerald-600">
                  R$ {Number(checkoutOS.client_quote_amount).toFixed(2)}
                </span>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Forma de Pagamento Recebida *</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold"
                >
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="debit_card">Cartão de Débito</option>
                  <option value="cash">Dinheiro</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCheckoutOS(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md"
                >
                  Confirmar Recebimento & Entrega
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
