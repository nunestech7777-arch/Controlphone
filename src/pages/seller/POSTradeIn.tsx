// ============================================================================
// CONTROLPHONE — FLUXO DE UPGRADE / TRADE-IN (VENDEDOR)
// ============================================================================

import React, { useState } from 'react';
import { RefreshCw, Smartphone, CheckCircle2, ArrowRight, X } from 'lucide-react';
import { store, isValidImei, IMEI_HINT } from '../../lib/store';
import { PAYMENT_METHOD_LABELS, formatBRL } from '../../lib/labels';
import { useAuth } from '../../context/AuthContext';
import { PaymentMethod } from '../../types';
import { QuickCustomerCreate } from '../../components/shared/QuickCustomerCreate';
import { SaleDocumentsMenu } from '../../components/shared/SaleDocumentsMenu';
import { SALE_DOCUMENTS, getSaleContext, runDocumentAction } from '../../lib/pdf/saleDocuments';

export const POSTradeIn: React.FC<{ onNavigate: (v: string) => void }> = ({ onNavigate }) => {
  const { currentTenant, currentUser, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [customerId, setCustomerId] = useState('');
  const [soldDeviceId, setSoldDeviceId] = useState('');
  const [soldDevicePrice, setSoldDevicePrice] = useState('');

  // Aparelho Usado Recebido
  const [receivedBrand, setReceivedBrand] = useState('Apple');
  const [receivedModel, setReceivedModel] = useState('');
  const [receivedStorage, setReceivedStorage] = useState('128GB');
  const [receivedColor, setReceivedColor] = useState('');
  const [receivedImei, setReceivedImei] = useState('');
  const [receivedBatteryHealth, setReceivedBatteryHealth] = useState('85');
  const [receivedNotes, setReceivedNotes] = useState('');
  const [appraisalValue, setAppraisalValue] = useState(''); // Avaliação livre do vendedor

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [installments, setInstallments] = useState(1);
  const [salesOrigin, setSalesOrigin] = useState('');
  const [successTradeIn, setSuccessTradeIn] = useState<any | null>(null);

  const availableDevices = store.devices.filter(d => d.tenant_id === tenantId && d.status === 'available');
  const customers = store.customers.filter(c => c.tenant_id === tenantId);

  const soldPriceNum = parseFloat(soldDevicePrice) || 0;
  const appraisalNum = parseFloat(appraisalValue) || 0;
  const differenceToPay = Math.max(0, soldPriceNum - appraisalNum);

  const handleProcessTradeIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !soldDeviceId || !soldDevicePrice || !receivedModel || !receivedImei || !appraisalValue || !salesOrigin) {
      alert('Preencha todos os campos obrigatórios do upgrade!');
      return;
    }

    if (!isValidImei(receivedImei)) {
      alert(`IMEI do aparelho recebido inválido. ${IMEI_HINT}`);
      return;
    }
    if (appraisalNum > soldPriceNum) {
      alert('A avaliação do aparelho usado não pode ser maior que o preço do aparelho vendido.');
      return;
    }

    let tradeIn;
    try {
      tradeIn = store.processTradeIn({
        tenantId,
        customerId,
        sellerId: currentUser.id,
        soldDeviceId,
        soldDevicePrice: soldPriceNum,
        receivedImei,
        receivedBrand,
        receivedModel,
        receivedStorage,
        receivedColor,
        receivedBatteryHealth: parseInt(receivedBatteryHealth) || undefined,
        receivedNotes,
        appraisalValue: appraisalNum,
        paymentMethod,
        installments,
        salesOrigin
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível concluir o upgrade.');
      return;
    }

    setSuccessTradeIn(tradeIn);

    // Upgrade é uma venda: o Termo de Garantia também é gerado automaticamente
    const newSale = store.sales.find(sl => sl.id === tradeIn.sale_id);
    if (newSale && currentTenant) {
      const ctx = getSaleContext(newSale, currentTenant, currentTheme);
      const term = SALE_DOCUMENTS.find(d => d.id === 'warranty-term');
      if (term && term.isAvailable(ctx)) void runDocumentAction(term, ctx, 'download');
    }
  };

  if (successTradeIn) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h2 className="text-2xl font-black text-slate-800 tracking-tight">
          Upgrade Concluído com Sucesso!
        </h2>
        <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
          Venda #{store.sales.find(s => s.id === successTradeIn.sale_id)?.sale_number} registrada no histórico de vendas. O aparelho usado foi cadastrado automaticamente no estoque como "Origem: Upgrade".
        </p>

        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm max-w-sm mx-auto text-left space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Avaliação do Usado:</span>
            <span className="font-bold text-purple-700">{formatBRL(appraisalNum)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Diferença Paga pelo Cliente:</span>
            <span className="font-black text-emerald-600 text-sm">{formatBRL(differenceToPay)}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          {store.sales.find(sl => sl.id === successTradeIn.sale_id) && (
            <SaleDocumentsMenu
              sale={store.sales.find(sl => sl.id === successTradeIn.sale_id)!}
              placement="up"
              variant="primary"
            />
          )}
          <button
            onClick={() => {
              setSuccessTradeIn(null);
              setCustomerId('');
              setSoldDeviceId('');
              setSoldDevicePrice('');
              setReceivedBrand('Apple');
              setReceivedModel('');
              setReceivedStorage('128GB');
              setReceivedColor('');
              setReceivedImei('');
              setReceivedBatteryHealth('85');
              setReceivedNotes('');
              setAppraisalValue('');
              setSalesOrigin('');
              setPaymentMethod('pix');
              setInstallments(1);
            }}
            className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-700"
          >
            Novo Upgrade
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-purple-600" />
          Venda com Upgrade (aparelho usado na troca)
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Receba um aparelho usado como parte do pagamento na compra de outro celular.
        </p>
      </div>

      <form onSubmit={handleProcessTradeIn} className="space-y-6 text-xs">
        {/* SELEÇÃO DE CLIENTE */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
          <label className="font-bold text-slate-700 block">1. Cliente *</label>
          <QuickCustomerCreate tenantId={tenantId} onCreated={setCustomerId} />
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
            required
          >
            <option value="">Selecione o cliente...</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
            ))}
          </select>
        </div>

        {/* ORIGEM DA VENDA (mesma regra da Nova Venda: o upgrade é uma venda) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2">
          <label className="font-bold text-slate-700 block">Como o cliente conheceu a loja? *</label>
          <select
            value={salesOrigin}
            onChange={(e) => setSalesOrigin(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
            required
          >
            <option value="">Selecione a origem...</option>
            {['Instagram', 'WhatsApp', 'Google', 'TikTok', 'Indicação', 'Passou em frente à loja', 'Já era cliente', 'Outro'].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        {/* APARELHO VENDIDO DA LOJA */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <label className="font-bold text-slate-700 block">2. Aparelho Entregue ao Cliente (Estoque da Loja) *</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Selecionar Aparelho *</label>
              <select
                value={soldDeviceId}
                onChange={(e) => {
                  const devId = e.target.value;
                  setSoldDeviceId(devId);
                  const dev = availableDevices.find(d => d.id === devId);
                  if (dev) setSoldDevicePrice(dev.suggested_price.toString());
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
                required
              >
                <option value="">Selecione do estoque...</option>
                {availableDevices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.brand} {d.model} ({d.storage_capacity} - {d.color}) | IMEI: {d.imei}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Preço Cobrado do Aparelho Vendido (R$) *</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={soldDevicePrice}
                onChange={(e) => setSoldDevicePrice(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-extrabold text-blue-600"
                required
              />
            </div>
          </div>
        </div>

        {/* APARELHO USADO RECEBIDO (ENTRADA AUTOMÁTICA) */}
        <div className="bg-white p-5 rounded-3xl border-2 border-purple-100 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-purple-100 pb-2">
            <Smartphone className="w-4 h-4 text-purple-600" />
            <h3 className="font-extrabold text-purple-900 text-sm">
              3. Aparelho Usado Recebido do Cliente (Entrada Automática no Estoque)
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Marca *</label>
              <input
                type="text"
                value={receivedBrand}
                onChange={(e) => setReceivedBrand(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold"
                required
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Modelo *</label>
              <input
                type="text"
                placeholder="Ex: iPhone 13 Pro"
                value={receivedModel}
                onChange={(e) => setReceivedModel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold"
                required
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Armazenamento *</label>
              <select
                value={receivedStorage}
                onChange={(e) => setReceivedStorage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              >
                <option value="64GB">64GB</option>
                <option value="128GB">128GB</option>
                <option value="256GB">256GB</option>
                <option value="512GB">512GB</option>
                <option value="1TB">1TB</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Cor *</label>
              <input
                type="text"
                placeholder="Ex: Azul Sierra"
                value={receivedColor}
                onChange={(e) => setReceivedColor(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
                required
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Número do IMEI *</label>
              <input
                type="text"
                placeholder="15 dígitos"
                inputMode="numeric"
                maxLength={15}
                value={receivedImei}
                onChange={(e) => setReceivedImei(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
                required
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Saúde da Bateria (%)</label>
              <input
                type="number"
                value={receivedBatteryHealth}
                onChange={(e) => setReceivedBatteryHealth(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-purple-900 block mb-1">
                Valor de Avaliação Comercial (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={appraisalValue}
                onChange={(e) => setAppraisalValue(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-purple-200 font-black text-sm text-purple-700 focus:outline-none focus:border-purple-600"
                required
              />
              <p className="text-[10px] text-purple-600 mt-1">
                Este valor será o custo de aquisição do aparelho usado quando entrar no estoque.
              </p>
            </div>

            <div>
              <label className="font-bold text-slate-700 block mb-1">Observações</label>
              <textarea
                rows={2}
                value={receivedNotes}
                onChange={(e) => setReceivedNotes(e.target.value)}
                placeholder="Ex: Tela quebrada, tampa com riscos, Face ID inoperante, aparelho impecável..."
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* RESUMO DE VALORES E FECHAMENTO */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="font-semibold text-slate-600">Preço do Aparelho Vendido:</span>
            <span className="font-bold text-slate-800">{formatBRL(soldPriceNum)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="font-semibold text-purple-700">(-) Avaliação do Usado:</span>
            <span className="font-bold text-purple-700">- {formatBRL(appraisalNum)}</span>
          </div>
          <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
            <span className="text-base font-extrabold text-slate-800">DIFERENÇA A RECEBER:</span>
            <span className="text-2xl font-black text-emerald-600">
              {formatBRL(differenceToPay)}
            </span>
          </div>

          {appraisalNum > soldPriceNum && (
            <p className="text-[11px] font-bold text-rose-600">
              A avaliação está acima do preço do aparelho vendido. Ajuste um dos valores para continuar.
            </p>
          )}

          {/* FORMA DE PAGAMENTO DA DIFERENÇA */}
          {differenceToPay > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <label className="text-xs font-bold text-slate-700 block">Forma de Pagamento da Diferença *</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {(['pix', 'credit_card', 'debit_card', 'cash'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      paymentMethod === m
                        ? 'bg-tenant-action text-white border-transparent shadow-sm'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
              {paymentMethod === 'credit_card' && (
                <select
                  value={installments}
                  onChange={(e) => setInstallments(parseInt(e.target.value))}
                  aria-label="Parcelas no cartão"
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18].map((n) => (
                    <option key={n} value={n}>{n}x de {formatBRL(differenceToPay / n)}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <button
            type="submit"
            className="w-full btn-tenant-primary font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 text-sm transition-all mt-3"
          >
            <span>Confirmar Upgrade & Dar Entrada no Estoque</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
