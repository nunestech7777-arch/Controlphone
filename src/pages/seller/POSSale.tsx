// ============================================================================
// CONTROLPHONE — NOVA VENDA (ADMINISTRADOR E VENDEDOR) COM ORIGEM OBRIGATÓRIA
// ============================================================================

import React, { useState } from 'react';
import { ShoppingBag, Smartphone, Package, Gift as GiftIcon, Users, Plus, Trash2, CheckCircle2, FileDown, ArrowRight } from 'lucide-react';
import { store, WARRANTY_DAYS } from '../../lib/store';
import { useAuth } from '../../context/AuthContext';
import { SaleDocumentsMenu } from '../../components/shared/SaleDocumentsMenu';
import { SALES_ORIGINS } from '../../lib/salesOrigins';
import { DeviceInspectionForm } from '../../components/shared/DeviceInspectionForm';
import { AppleWarrantyPanel } from '../../components/shared/AppleWarrantyPanel';
import { isAppleSealed } from '../../lib/appleWarranty';
import { InspectionDraft, emptyInspection, isInspectionComplete } from '../../lib/deviceInspection';
import { saleInterest, saleRevenue } from '../../lib/saleFinance';
import { DeviceTypeBadge, DEVICE_TYPE_LABELS } from '../../components/shared/DeviceTypeBadge';
import { getAutomaticDocuments, getSaleContext, runDocumentAction } from '../../lib/pdf/saleDocuments';
import { Sale, SaleItem, PaymentMethod, Device, Accessory, Gift } from '../../types';
import { QuickCustomerCreate } from '../../components/shared/QuickCustomerCreate';
import { PAYMENT_METHOD_LABELS, formatBRL } from '../../lib/labels';

interface CartItem {
  id: string;
  itemType: 'device' | 'accessory';
  deviceId?: string;
  accessoryId?: string;
  title: string;
  details: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  unitCost: number; // Armazenado internamente mas não exibido ao vendedor
  /** Aparelho seminovo: vistoria preenchida pelo vendedor antes de concluir */
  inspection?: InspectionDraft;
}

interface CartGift {
  giftId: string;
  name: string;
  quantity: number;
  unitCost: number;
}

// Forma de pagamento adicional (a principal recebe o restante do total)
interface ExtraPayment {
  id: string;
  method: PaymentMethod;
  amount: string;
  installments: number;
  /** Juros da maquininha cobrados a mais neste pagamento (somente cartão de crédito) */
  interest: string;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: 'pix', label: 'PIX Instantâneo' },
  { id: 'credit_card', label: 'Cartão de Crédito' },
  { id: 'debit_card', label: 'Cartão de Débito' },
  { id: 'cash', label: 'Dinheiro' }
];
// Valor em reais digitado (vazio = zero); negativo ou inválido vira NaN para a validação recusar
const moneyInput = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(',', '.')));


export const POSSale: React.FC<{ onNavigate: (v: string) => void }> = ({ onNavigate }) => {
  const { currentTenant, currentUser, currentTheme } = useAuth();
  const tenantId = currentTenant?.id || 'tenant-itech-01';

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [salesOrigin, setSalesOrigin] = useState<string>('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartGifts, setCartGifts] = useState<CartGift[]>([]);

  // Modais de seleção
  const [itemSelectorType, setItemSelectorType] = useState<'device' | 'accessory' | 'gift' | null>(null);

  // Pagamento
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  // Cartão de crédito: em vez de parcelas, o vendedor informa os juros da maquininha cobrados do cliente
  const [mainInterest, setMainInterest] = useState('');
  const [extraPayments, setExtraPayments] = useState<ExtraPayment[]>([]);
  const [creditInput, setCreditInput] = useState<string>('');
  const [docNotice, setDocNotice] = useState('');
  const [finishedSale, setFinishedSale] = useState<any | null>(null);
  // Termo de Garantia Apple: ciência de que o termo foi apresentado (só com aparelho Apple lacrado)
  const [appleAck, setAppleAck] = useState(false);

  // Aparelho já colocado no pedido sai da lista (não pode ser vendido duas vezes)
  const availableDevices = store.devices.filter(
    d => d.tenant_id === tenantId && d.status === 'available' && !cartItems.some(i => i.deviceId === d.id)
  );
  const accessories = store.accessories.filter(a => a.tenant_id === tenantId && a.quantity > 0);
  const gifts = store.gifts.filter(g => g.tenant_id === tenantId && g.quantity > 0);
  const accessoryStock = (id?: string) => store.accessories.find(a => a.id === id)?.quantity || 0;
  const giftStock = (id: string) => store.gifts.find(g => g.id === id)?.quantity || 0;
  const features = store.getTenantFeatures(tenantId);
  const customers = store.customers.filter(c => c.tenant_id === tenantId);
  // Aparelhos Apple lacrados do pedido: carregam o componente de garantia Apple, sem campo novo
  const appleSealedDevices = cartItems
    .map(it => ({ it, dev: it.deviceId ? store.devices.find(d => d.id === it.deviceId) : undefined }))
    .filter(({ dev }) => isAppleSealed(dev))
    .map(({ it, dev }) => ({ key: it.id, brand: dev!.brand, model: dev!.model, storage: dev!.storage_capacity, color: dev!.color, imei: dev!.imei }));

  // Cálculos do carrinho (sem expor custo ou lucro ao vendedor)
  const subtotal = cartItems.reduce((acc, it) => acc + (it.unitPrice * it.quantity), 0);
  const totalDiscount = cartItems.reduce((acc, it) => acc + (it.discount * it.quantity), 0);
  const totalAmount = Math.max(0, subtotal - totalDiscount);
  // Crédito do cliente (de devoluções): limitado ao saldo e ao total da venda
  const creditBalance = selectedCustomerId ? store.getCustomerCreditBalance(tenantId, selectedCustomerId) : 0;
  const creditUse = Math.max(0, Math.min(parseFloat(creditInput) || 0, creditBalance, totalAmount));
  const amountDue = Math.round((totalAmount - creditUse) * 100) / 100;
  // Pagamento dividido: as formas adicionais têm valor digitado e a principal fica com o restante
  const extrasTotal = Math.round(extraPayments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0) * 100) / 100;
  const mainAmount = Math.round((amountDue - extrasTotal) * 100) / 100;
  // Juros da maquininha (somente nas formas em cartão de crédito): somam ao total cobrado, não aos produtos
  const mainInterestNum = paymentMethod === 'credit_card' ? moneyInput(mainInterest) : 0;
  const extrasInterest = extraPayments.reduce((acc, p) => acc + (p.method === 'credit_card' ? moneyInput(p.interest) : 0), 0);
  const totalInterest = Math.round(((Number.isFinite(mainInterestNum) ? mainInterestNum : 0) + (Number.isFinite(extrasInterest) ? extrasInterest : 0)) * 100) / 100;
  const totalCharged = Math.round((totalAmount + totalInterest) * 100) / 100;

  const totalCost = cartItems.reduce((acc, it) => acc + (it.unitCost * it.quantity), 0) +
    cartGifts.reduce((acc, g) => acc + (g.unitCost * g.quantity), 0);

  const handleAddDevice = (device: Device) => {
    // Vendedor visualiza apenas suggested_price, custo é mantido oculto
    const newItem: CartItem = {
      id: 'cart-' + Date.now(),
      itemType: 'device',
      deviceId: device.id,
      title: `${device.brand} ${device.model}`,
      details: `${device.storage_capacity} - ${device.color} (IMEI: ${device.imei})${device.device_type ? ` | ${DEVICE_TYPE_LABELS[device.device_type]}` : ''}`,
      quantity: 1,
      unitPrice: Number(device.suggested_price),
      discount: 0,
      unitCost: Number(device.acquisition_cost) + Number(device.accumulated_repair_cost),
      // Vistoria só para seminovo (lacrado e aparelho sem tipo não têm)
      inspection: device.device_type === 'seminovo' ? emptyInspection() : undefined
    };
    setCartItems(prev => [...prev, newItem]);
    setItemSelectorType(null);
  };

  const handleAddAccessory = (acc: Accessory) => {
    // Mesmo acessório de novo: soma na quantidade da linha existente, até o limite do estoque
    if (cartItems.some(i => i.accessoryId === acc.id)) {
      setCartItems(prev => prev.map(i =>
        i.accessoryId === acc.id ? { ...i, quantity: Math.min(i.quantity + 1, acc.quantity) } : i
      ));
      setItemSelectorType(null);
      return;
    }
    const newItem: CartItem = {
      id: 'cart-' + Date.now(),
      itemType: 'accessory',
      accessoryId: acc.id,
      title: acc.name,
      details: `Categoria: ${acc.category}`,
      quantity: 1,
      unitPrice: Number(acc.sale_price),
      discount: 0,
      unitCost: Number(acc.unit_cost)
    };
    setCartItems(prev => [...prev, newItem]);
    setItemSelectorType(null);
  };

  const handleAddGift = (gift: Gift) => {
    if (cartGifts.some(g => g.giftId === gift.id)) {
      setCartGifts(prev => prev.map(g =>
        g.giftId === gift.id ? { ...g, quantity: Math.min(g.quantity + 1, gift.quantity) } : g
      ));
      setItemSelectorType(null);
      return;
    }
    setCartGifts(prev => [
      ...prev,
      {
        giftId: gift.id,
        name: gift.name,
        quantity: 1,
        unitCost: Number(gift.unit_cost)
      }
    ]);
    setItemSelectorType(null);
  };

  const handleRemoveItem = (id: string) => {
    setCartItems(prev => prev.filter(i => i.id !== id));
  };

  const handleRemoveGift = (idx: number) => {
    setCartGifts(prev => prev.filter((_, i) => i !== idx));
  };

  const handleFinishSale = () => {
    if (!selectedCustomerId) {
      alert('Selecione o cliente para continuar!');
      return;
    }
    if (cartItems.length === 0) {
      alert('Adicione pelo menos um aparelho ou acessório ao pedido!');
      return;
    }
    if (!salesOrigin) {
      alert('A resposta da pergunta obrigatória "Como o cliente conheceu nossa loja?" é exigida!');
      return;
    }

    const pendingInspection = cartItems.find(it => it.inspection && !isInspectionComplete(it.inspection));
    if (pendingInspection) {
      alert(`Preencha a vistoria do aparelho ${pendingInspection.title}: marque SIM ou NÃO em todas as perguntas.`);
      return;
    }

    if (cartItems.some(it => !(it.unitPrice > 0))) {
      alert('Informe um preço maior que zero para cada item.');
      return;
    }
    if (cartItems.some(it => it.discount < 0 || it.discount >= it.unitPrice)) {
      alert('O desconto de cada item não pode ser negativo nem igual ou maior que o preço.');
      return;
    }
    if (extraPayments.some(p => !(parseFloat(p.amount) > 0))) {
      alert('Informe o valor de cada forma de pagamento adicional (ou remova a linha).');
      return;
    }
    const interests = [mainInterestNum, ...extraPayments.filter(p => p.method === 'credit_card').map(p => moneyInput(p.interest))];
    if (interests.some(v => !Number.isFinite(v) || v < 0)) {
      alert('Informe os juros da maquininha em reais (zero ou mais).');
      return;
    }
    if (mainInterestNum > 0 && !(mainAmount > 0)) {
      alert('Os juros da maquininha foram informados no cartão de crédito, mas as outras formas já cobrem todo o valor.');
      return;
    }
    if (mainAmount < 0) {
      alert(`As formas de pagamento adicionais somam ${formatBRL(extrasTotal)}, acima do total a receber (${formatBRL(amountDue)}).`);
      return;
    }

    let sale;
    try {
      sale = store.finalizeSale({
        tenantId,
        sellerId: currentUser.id,
        customerId: selectedCustomerId,
        salesOrigin,
        subtotal,
        discountAmount: totalDiscount,
        totalAmount,
        totalCost,
        items: cartItems.map(it => ({
          itemType: it.itemType,
          deviceId: it.deviceId,
          accessoryId: it.accessoryId,
          quantity: it.quantity,
          unitCost: it.unitCost,
          unitPrice: it.unitPrice,
          discount: it.discount,
          totalPrice: (it.unitPrice - it.discount) * it.quantity,
          inspection: it.inspection
        })),
        appleWarrantyAcknowledged: appleSealedDevices.length > 0 && appleAck,
        payments: [
          ...(creditUse > 0 ? [{ paymentMethod: 'store_credit' as PaymentMethod, amount: creditUse, installments: 1 }] : []),
          ...(mainAmount > 0
            ? [{ paymentMethod, amount: mainAmount, installments: 1, interest: mainInterestNum > 0 ? mainInterestNum : undefined }]
            : []),
          ...extraPayments.map(p => ({
            paymentMethod: p.method,
            amount: Math.round(parseFloat(p.amount) * 100) / 100,
            installments: 1,
            interest: p.method === 'credit_card' && moneyInput(p.interest) > 0 ? moneyInput(p.interest) : undefined
          }))
        ],
        gifts: cartGifts.map(g => ({
          giftId: g.giftId,
          quantity: g.quantity,
          unitCost: g.unitCost
        }))

      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível finalizar a venda.');
      return;
    }

    setFinishedSale(sale);

    // Documentos gerados automaticamente ao concluir a venda: Termo de Garantia (seminovo) e,
    // se houver aparelho lacrado, o comprovante de lacrado. O modelo sai do tipo de cada aparelho.
    if (currentTenant) {
      const ctx = getSaleContext(sale, currentTenant, currentTheme);
      getAutomaticDocuments(ctx).forEach(def => void runDocumentAction(def, ctx, 'download'));
    }
  };

  if (finishedSale) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-6 animate-fade-in">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h2 className="text-2xl font-black text-slate-800 tracking-tight">
          Venda #{finishedSale.sale_number} Finalizada com Sucesso!
        </h2>
        <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
          O estoque foi baixado automaticamente. {(finishedSale.items as SaleItem[] | undefined)?.some(i => i.device_type === 'lacrado')
            ? ((finishedSale as Sale).apple_warranty
              ? 'O comprovante do aparelho lacrado, com o Termo de Garantia Apple (1 ano) completo, foi gerado e baixado'
              : 'O comprovante do aparelho lacrado foi gerado e baixado')
            : 'O Termo de Garantia foi gerado e baixado'}; os demais documentos estão em "Documentos da Venda".
        </p>

        <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm max-w-sm mx-auto text-left space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-400">Total Pago:</span>
            <span className="font-black text-blue-600 text-sm">{formatBRL(saleRevenue(finishedSale))}</span>
          </div>
          {saleInterest(finishedSale) > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-slate-400">Valor dos produtos:</span>
                <span className="font-bold text-slate-700">{formatBRL(finishedSale.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Juros da maquininha:</span>
                <span className="font-bold text-slate-700">{formatBRL(saleInterest(finishedSale))}</span>
              </div>
            </>
          )}
          {(finishedSale.payments || []).map((p: { id: string; payment_method: PaymentMethod; amount: number; installments: number; interest?: number }) => (
            <div key={p.id} className="flex justify-between">
              <span className="text-slate-400">
                {PAYMENT_METHOD_LABELS[p.payment_method]}{p.installments > 1 ? ` (${p.installments}x)` : ''}{p.interest ? ' (com juros)' : ''}:
              </span>
              <span className="font-bold text-slate-700">{formatBRL(p.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-slate-400">Canal de Origem:</span>
            <span className="font-semibold text-slate-700">{finishedSale.sales_origin}</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <SaleDocumentsMenu sale={finishedSale} placement="up" variant="primary" onNotice={setDocNotice} />
          <button
            onClick={() => {
              setFinishedSale(null);
              setCartItems([]);
              setCartGifts([]);
              setAppleAck(false);
              setSalesOrigin('');
              setSelectedCustomerId('');
              setCreditInput('');
              setExtraPayments([]);
              setMainInterest('');
              setDocNotice('');
            }}
            className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-xs text-slate-700"
          >
            Nova Venda
          </button>
        </div>
        {docNotice && <p className="text-[11px] font-semibold text-slate-500">{docNotice}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-600" />
            Nova Venda
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Atendimento comercial ágil, aplicação de descontos e emissão imediata de comprovante.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* COLUNA ESQUERDA: CLIENTE & ITENS (OCUPA 2 COLUNAS) */}
        <div className="lg:col-span-2 space-y-5">
          {/* SELEÇÃO DE CLIENTE */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 block">1. Selecionar Cliente *</label>
            </div>
            <QuickCustomerCreate tenantId={tenantId} onCreated={setSelectedCustomerId} />
            <div className="flex items-center gap-3">
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
              >
                <option value="">Selecione um cliente cadastrado...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.phone} {c.cpf ? `(${c.cpf})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* BOTÕES PARA ADICIONAR ITENS */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setItemSelectorType('device')}
              className="btn-tenant-primary text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2"
            >
              <Smartphone className="w-4 h-4" />
              Adicionar Aparelho
            </button>

            {features.accessories && (
            <button
              onClick={() => setItemSelectorType('accessory')}
              className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-md"
            >
              <Package className="w-4 h-4" />
              Adicionar Acessório
            </button>
            )}

            {features.gifts && (
            <button
              onClick={() => setItemSelectorType('gift')}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-md shadow-purple-600/20"
            >
              <GiftIcon className="w-4 h-4" />
              Adicionar Brinde (R$ 0,00)
            </button>
            )}
          </div>

          {/* LISTA DE ITENS NO CARRINHO */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                Itens da Venda ({cartItems.length + cartGifts.length})
              </h3>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {cartItems.map((item) => (
                <div key={item.id} className="p-4 hover:bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1">
                    <span className="font-extrabold text-slate-800 text-sm block">{item.title}</span>
                    <span className="text-[11px] text-slate-400">{item.details}</span>
                    {item.itemType === 'device' && (() => {
                      // lacrado não tem a garantia da loja: Apple tem a garantia Apple de 1 ano; outras marcas, a do fabricante
                      const dev = store.devices.find(d => d.id === item.deviceId);
                      const label = dev?.device_type === 'lacrado'
                        ? (isAppleSealed(dev) ? 'Garantia Apple (1 ano)' : 'Garantia do fabricante')
                        : `${WARRANTY_DAYS} dias`;
                      return (
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-bold text-slate-600">Garantia do Aparelho:</span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                            {label}
                          </span>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {item.itemType === 'accessory' && (
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block">Qtd (máx. {accessoryStock(item.accessoryId)})</label>
                        <input
                          type="number"
                          min={1}
                          max={accessoryStock(item.accessoryId)}
                          step={1}
                          value={item.quantity}
                          onChange={(e) => {
                            const max = accessoryStock(item.accessoryId);
                            const val = Math.max(1, Math.min(parseInt(e.target.value) || 1, max));
                            setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: val } : i));
                          }}
                          className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-900"
                        />
                      </div>
                    )}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block">Preço Cobrado</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, unitPrice: val } : i));
                        }}
                        className="w-24 px-2 py-1 rounded-lg border border-slate-200 text-xs font-black text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block">Desconto (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.discount}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, discount: val } : i));
                        }}
                        className="w-20 px-2 py-1 rounded-lg border border-slate-200 text-xs font-bold text-rose-600"
                      />
                    </div>

                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {item.inspection && (
                  <DeviceInspectionForm
                    idPrefix={`vistoria-${item.id}`}
                    value={item.inspection}
                    onChange={(next) => setCartItems(prev => prev.map(i => i.id === item.id ? { ...i, inspection: next } : i))}
                  />
                )}
                </div>
              ))}

              {/* BRINDES CORTESIA (R$ 0,00) */}
              {cartGifts.map((gift, idx) => (
                <div key={idx} className="p-4 flex items-center justify-between bg-purple-50/30">
                  <div>
                    <span className="font-bold text-purple-900 text-xs flex items-center gap-1.5">
                      <GiftIcon className="w-3.5 h-3.5 text-purple-600" />
                      BRINDE: {gift.name}
                    </span>
                    <span className="text-[10px] text-purple-600 font-semibold">Cortesia para o Cliente</span>
                  </div>

                  <div className="flex items-center gap-4">
                    <div>
                      <label className="text-[10px] text-purple-600 font-bold block">Qtd (máx. {giftStock(gift.giftId)})</label>
                      <input
                        type="number"
                        min={1}
                        max={giftStock(gift.giftId)}
                        step={1}
                        value={gift.quantity}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(parseInt(e.target.value) || 1, giftStock(gift.giftId)));
                          setCartGifts(prev => prev.map((g, i) => i === idx ? { ...g, quantity: val } : g));
                        }}
                        className="w-16 px-2 py-1 rounded-lg border border-purple-200 text-xs font-bold text-slate-900"
                      />
                    </div>
                    <span className="font-black text-emerald-600 text-sm">R$ 0,00</span>
                    <button
                      onClick={() => handleRemoveGift(idx)}
                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {cartItems.length === 0 && cartGifts.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  Nenhum item adicionado à venda. Escolha aparelhos ou acessórios acima.
                </div>
              )}
            </div>
          </div>

          {/* COMPONENTE DE GARANTIA APPLE: só com aparelho Apple lacrado no pedido */}
          {appleSealedDevices.length > 0 && (
            <AppleWarrantyPanel
              devices={appleSealedDevices}
              customerName={customers.find(c => c.id === selectedCustomerId)?.name}
              sellerName={currentUser.full_name}
              acknowledged={appleAck}
              onAcknowledgedChange={setAppleAck}
            />
          )}
        </div>

        {/* COLUNA DIREITA: RESUMO, ORIGEM OBRIGATÓRIA & PAGAMENTO */}
        <div className="space-y-5">
          {/* PERGUNTA OBRIGATÓRIA DE ORIGEM DA VENDA */}
          <div className="bg-white p-5 rounded-2xl border-2 border-blue-100 shadow-sm space-y-2">
            <label className="text-xs font-extrabold text-blue-900 block">
              2. Como o cliente conheceu nossa loja? * (Obrigatório)
            </label>
            <select
              value={salesOrigin}
              onChange={(e) => setSalesOrigin(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-xl border border-blue-200 focus:outline-none focus:border-blue-600 font-bold text-slate-800 bg-blue-50/20"
              required
            >
              <option value="">Selecione o canal de origem...</option>
              {SALES_ORIGINS.map((orig) => (
                <option key={orig} value={orig}>{orig}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1.5">Com "Ads": o cliente chegou por anúncio pago. Sem "Ads": chegou sem anúncio (perfil, publicação, contato direto).</p>
          </div>

          {/* FORMA DE PAGAMENTO */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <label className="text-xs font-bold text-slate-700 block">3. Forma de Pagamento *</label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {PAYMENT_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    paymentMethod === m.id
                      ? 'bg-tenant-action text-white border-transparent shadow-sm'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {paymentMethod === 'credit_card' && (
              <div className="pt-2">
                <label htmlFor="pos-main-interest" className="text-[11px] font-bold text-slate-500 block mb-1">JUROS DA MAQUININHA (R$)</label>
                <input
                  id="pos-main-interest"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={mainInterest}
                  onChange={(e) => setMainInterest(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-bold"
                />
                <p className="text-[11px] text-slate-400 mt-1">Valor cobrado a mais do cliente no crédito. Não muda o preço do aparelho nem o lucro.</p>
              </div>
            )}

            {/* PAGAMENTO DIVIDIDO: outras formas com valor digitado; a principal fica com o restante */}
            {extraPayments.map((p) => (
              <div key={p.id} className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={p.method}
                    onChange={(e) => setExtraPayments(prev => prev.map(x => x.id === p.id ? { ...x, method: e.target.value as PaymentMethod } : x))}
                    aria-label="Forma de pagamento adicional"
                    className="flex-1 min-w-0 text-xs px-2 py-2 rounded-xl border border-slate-200 font-semibold"
                  >
                    {PAYMENT_OPTIONS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Valor"
                    value={p.amount}
                    onChange={(e) => setExtraPayments(prev => prev.map(x => x.id === p.id ? { ...x, amount: e.target.value } : x))}
                    aria-label="Valor desta forma de pagamento"
                    className="w-24 text-xs px-2 py-2 rounded-xl border border-slate-200 font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setExtraPayments(prev => prev.filter(x => x.id !== p.id))}
                    aria-label="Remover forma de pagamento"
                    className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {p.method === 'credit_card' && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Juros da maquininha (R$)"
                    value={p.interest}
                    onChange={(e) => setExtraPayments(prev => prev.map(x => x.id === p.id ? { ...x, interest: e.target.value } : x))}
                    aria-label="Juros da maquininha (R$) neste pagamento"
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-bold"
                  />
                )}
              </div>
            ))}

            {extraPayments.length > 0 && (
              <p className={`text-[11px] font-bold ${mainAmount < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                {mainAmount < 0
                  ? `As formas adicionais passam do total em ${formatBRL(-mainAmount)}.`
                  : `Restante em ${PAYMENT_METHOD_LABELS[paymentMethod]}: ${formatBRL(mainAmount)}`}
              </p>
            )}

            <button
              type="button"
              onClick={() => setExtraPayments(prev => [...prev, { id: 'pay-' + Date.now(), method: 'cash', amount: '', installments: 1, interest: '' }])}
              className="text-[11px] font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Dividir em outra forma de pagamento
            </button>
          </div>

          {/* CRÉDITO DO CLIENTE (DEVOLUÇÕES ANTERIORES) */}
          {creditBalance > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-2 text-xs">
              <label htmlFor="pos-credit" className="font-bold text-slate-700 block">
                Crédito do cliente disponível: {formatBRL(creditBalance)}
              </label>
              <input
                id="pos-credit"
                type="number"
                step="0.01"
                min="0"
                max={Math.min(creditBalance, totalAmount)}
                placeholder="Valor do crédito a utilizar"
                value={creditInput}
                onChange={(e) => setCreditInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-500 font-bold"
              />
              <p className="text-[11px] text-slate-400">
                O uso é limitado ao saldo e ao total da venda. O restante segue na forma de pagamento escolhida.
              </p>
            </div>
          )}

          {/* RESUMO DE VALORES E BOTÃO DE FINALIZAÇÃO */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal dos Itens:</span>
              <span className="font-semibold">{formatBRL(subtotal)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-rose-600">
                <span>Desconto Aplicado:</span>
                <span className="font-bold">- {formatBRL(totalDiscount)}</span>
              </div>
            )}
            {creditUse > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Crédito do cliente utilizado:</span>
                <span className="font-bold">- {formatBRL(creditUse)}</span>
              </div>
            )}
            {/* RESUMO DA VENDA: produtos, juros da maquininha (à parte) e o total cobrado em destaque */}
            <div className="pt-3 border-t border-slate-100 space-y-1.5">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Resumo da venda</span>
              <div className="flex justify-between text-slate-600">
                <span>Valor dos produtos:</span>
                <span className="font-semibold">{formatBRL(totalAmount)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Juros da maquininha:</span>
                <span className="font-semibold">{formatBRL(totalInterest)}</span>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
              <span className="text-sm font-extrabold text-slate-800">TOTAL DA VENDA:</span>
              <span className="text-2xl font-black text-tenant-primary">
                {formatBRL(totalCharged)}
              </span>
            </div>
            {creditUse > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>A receber agora (descontado o crédito do cliente):</span>
                <span className="font-bold">{formatBRL(Math.round((amountDue + totalInterest) * 100) / 100)}</span>
              </div>
            )}

            <button
              onClick={handleFinishSale}
              className="w-full btn-tenant-primary font-extrabold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 text-sm transition-all mt-4"
            >
              <span>Concluir Venda e Emitir Comprovante</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* MODAIS DE SELEÇÃO DE APARELHO / ACESSÓRIO / BRINDE */}
      {itemSelectorType && (
        <div className="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl animate-fade-in max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-extrabold text-slate-800">
                {itemSelectorType === 'device' && 'Selecionar Aparelho do Estoque'}
                {itemSelectorType === 'accessory' && 'Selecionar Acessório'}
                {itemSelectorType === 'gift' && 'Selecionar Brinde Cortesia (R$ 0,00)'}
              </h3>
              <button onClick={() => setItemSelectorType(null)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {itemSelectorType === 'device' &&
                availableDevices.map((dev) => (
                  <div
                    key={dev.id}
                    onClick={() => handleAddDevice(dev)}
                    className="p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/20 cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div>
                      <span className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                        {dev.brand} {dev.model}
                        <DeviceTypeBadge type={dev.device_type} />
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {dev.storage_capacity} - {dev.color} | IMEI: {dev.imei} {dev.battery_health ? `| Bat: ${dev.battery_health}%` : ''}
                      </span>
                    </div>
                    {/* Exibe apenas suggested_price (Custo é estritamente oculto) */}
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-400 block">Sugerido:</span>
                      <span className="font-black text-blue-600 text-sm">{formatBRL(Number(dev.suggested_price))}</span>
                    </div>
                  </div>
                ))}

              {itemSelectorType === 'accessory' &&
                accessories.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => handleAddAccessory(acc)}
                    className="p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/20 cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div>
                      <span className="font-bold text-slate-800 block">{acc.name}</span>
                      <span className="text-[11px] text-slate-400">Estoque: {acc.quantity} un.</span>
                    </div>
                    <span className="font-black text-slate-900">{formatBRL(Number(acc.sale_price))}</span>
                  </div>
                ))}

              {itemSelectorType === 'gift' &&
                gifts.map((gift) => (
                  <div
                    key={gift.id}
                    onClick={() => handleAddGift(gift)}
                    className="p-3 rounded-xl border border-purple-200 hover:border-purple-500 hover:bg-purple-50/20 cursor-pointer flex items-center justify-between transition-all"
                  >
                    <div>
                      <span className="font-bold text-purple-900 block">{gift.name}</span>
                      <span className="text-[11px] text-purple-600">Disponível em estoque: {gift.quantity} un.</span>
                    </div>
                    <span className="font-black text-emerald-600 text-xs">R$ 0,00 (Gratuito)</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
