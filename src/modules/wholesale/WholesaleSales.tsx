// ============================================================================
// CONTROLPHONE — ATACADO: VENDAS
// Cliente → Produtos → Quantidade → Desconto → Pagamento → Finalizar.
// Baixa só o estoque do Atacado e lança só no financeiro do Atacado.
// ============================================================================

import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Minus, Plus, Receipt, Search, ShoppingCart, Trash2, UserPlus } from 'lucide-react';
import { formatBRL } from '../../lib/labels';
import { WholesaleController } from './useWholesale';
import { WholesaleProduct } from './types';
import { round2 } from './calc';
import { CustomerFormModal } from './WholesaleCustomers';
import { Card, Empty, Field, PAYMENT_METHODS, btnPrimary, formatDateTime, inputCls } from './ui';

interface CartLine {
  product_id: string;
  quantity: number;
  unit_price: number;
}

interface Props {
  ctl: WholesaleController;
  color: string;
  isAdmin: boolean;
  onMessage: (text: string, kind?: 'ok' | 'error') => void;
}

export const WholesaleSales: React.FC<Props> = ({ ctl, color, isAdmin, onMessage }) => {
  const { products, customers, sales } = ctl.data;
  const [view, setView] = useState<'new' | 'history'>('new');
  const [customerId, setCustomerId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [term, setTerm] = useState('');
  const [discountMode, setDiscountMode] = useState<'value' | 'percent'>('value');
  const [discountInput, setDiscountInput] = useState('');
  const [payment, setPayment] = useState(PAYMENT_METHODS[0]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [newCustomer, setNewCustomer] = useState(false);
  const [openSale, setOpenSale] = useState<string | null>(null);

  const productOf = (id: string) => products.find(p => p.id === id);
  const subtotal = round2(cart.reduce((acc, l) => acc + l.unit_price * l.quantity, 0));
  const rawDiscount = Number(discountInput) || 0;
  const discount = round2(Math.min(
    subtotal,
    Math.max(0, discountMode === 'percent' ? (subtotal * rawDiscount) / 100 : rawDiscount)
  ));
  const total = round2(subtotal - discount);

  const available = useMemo(() => {
    const t = term.trim().toLowerCase();
    return products.filter(p => p.quantity > 0 && (!t || p.name.toLowerCase().includes(t) || (p.category || '').toLowerCase().includes(t)));
  }, [products, term]);

  const addProduct = (p: WholesaleProduct) =>
    setCart(prev => {
      const existing = prev.find(l => l.product_id === p.id);
      if (existing) {
        return prev.map(l => l.product_id === p.id ? { ...l, quantity: Math.min(p.quantity, l.quantity + 1) } : l);
      }
      return [...prev, { product_id: p.id, quantity: 1, unit_price: p.sale_price }];
    });

  const setQuantity = (id: string, raw: number) => {
    const max = productOf(id)?.quantity ?? 1;
    const quantity = Math.max(1, Math.min(max, Math.floor(raw) || 1));
    setCart(prev => prev.map(l => l.product_id === id ? { ...l, quantity } : l));
  };
  const setPrice = (id: string, price: number) =>
    setCart(prev => prev.map(l => l.product_id === id ? { ...l, unit_price: Math.max(0, price || 0) } : l));
  const removeLine = (id: string) => setCart(prev => prev.filter(l => l.product_id !== id));

  const finalize = async () => {
    if (!customerId) return onMessage('Selecione o cliente do Atacado.', 'error');
    if (cart.length === 0) return onMessage('Adicione ao menos um produto.', 'error');
    setBusy(true);
    const res = await ctl.run(() => ctl.repo.finalizeSale({
      customerId, items: cart, discount, paymentMethod: payment, notes
    }));
    setBusy(false);
    if (!res.ok) return onMessage(res.error, 'error');
    setCart([]); setDiscountInput(''); setNotes(''); setTerm('');
    onMessage('Venda do Atacado concluída.');
  };

  const saveNewCustomer = async (input: Parameters<React.ComponentProps<typeof CustomerFormModal>['onSave']>[0]) => {
    const res = await ctl.run(() => ctl.repo.saveCustomer(input));
    if (!res.ok) return res.error;
    setCustomerId(res.value);
    setNewCustomer(false);
    return null;
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="inline-flex p-1 rounded-xl bg-slate-100 text-xs font-bold">
        {([['new', 'Nova venda', ShoppingCart], ['history', isAdmin ? 'Histórico' : 'Minhas vendas', Receipt]] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setView(id)}
            className={`px-3.5 py-2 rounded-lg inline-flex items-center gap-1.5 transition ${view === id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {view === 'new' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-5">
          {/* 1. CLIENTE + 2. PRODUTOS */}
          <div className="space-y-4">
            <Card className="p-4 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">1. Cliente</span>
              <div className="flex gap-2">
                <select aria-label="Cliente" className={inputCls} value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Selecione o cliente</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>)}
                </select>
                <button type="button" className="shrink-0 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Cadastrar novo cliente" title="Novo cliente" onClick={() => setNewCustomer(true)}>
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">2. Produtos</span>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={term} onChange={e => setTerm(e.target.value)} placeholder="Buscar produto" className={`${inputCls} pl-9`} />
              </div>
              {available.length === 0 ? (
                <Empty icon={ShoppingCart} text={products.length === 0 ? 'Cadastre produtos no estoque do Atacado.' : 'Nenhum produto com estoque encontrado.'} />
              ) : (
                <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto border border-slate-100 rounded-xl">
                  {available.map(p => (
                    <li key={p.id}>
                      <button type="button" onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-slate-800 truncate">{p.name}</span>
                          <span className="block text-[11px] text-slate-400">{p.category || 'Sem categoria'} · {p.quantity} em estoque</span>
                        </span>
                        <span className="text-xs font-bold text-slate-700 shrink-0">{formatBRL(p.sale_price)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* 3. QUANTIDADE, 4. DESCONTO, 5. PAGAMENTO */}
          <Card className="p-4 space-y-4 self-start">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">3. Quantidade</span>
            {cart.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Toque em um produto para adicionar à venda.</p>
            ) : (
              <ul className="space-y-2">
                {cart.map(line => {
                  const p = productOf(line.product_id);
                  return (
                    <li key={line.product_id} className="border border-slate-100 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">{p?.name || 'Produto'}</span>
                        <button type="button" aria-label="Remover item" onClick={() => removeLine(line.product_id)} className="text-rose-500 p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="inline-flex items-center border border-slate-200 rounded-lg">
                          <button type="button" aria-label="Diminuir" className="p-2" onClick={() => setQuantity(line.product_id, line.quantity - 1)}><Minus className="w-3 h-3" /></button>
                          <input type="number" min={1} max={p?.quantity} value={line.quantity} aria-label="Quantidade"
                            onChange={e => setQuantity(line.product_id, Number(e.target.value))}
                            className="w-12 text-center font-bold bg-transparent focus:outline-none" />
                          <button type="button" aria-label="Aumentar" className="p-2" onClick={() => setQuantity(line.product_id, line.quantity + 1)}><Plus className="w-3 h-3" /></button>
                        </div>
                        <span className="text-slate-400">×</span>
                        <input type="number" min={0} step="0.01" value={line.unit_price} aria-label="Preço unitário"
                          onChange={e => setPrice(line.product_id, Number(e.target.value))}
                          className="w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-right" />
                        <span className="ml-auto font-bold text-slate-800">{formatBRL(line.unit_price * line.quantity)}</span>
                      </div>
                      {p && <span className="text-[10px] text-slate-400">Disponível: {p.quantity}</span>}
                    </li>
                  );
                })}
              </ul>
            )}

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">4. Desconto</span>
              <div className="flex gap-2">
                <input type="number" min={0} step="0.01" value={discountInput} onChange={e => setDiscountInput(e.target.value)}
                  placeholder="0,00" aria-label="Desconto" className={inputCls} />
                <select aria-label="Tipo de desconto" value={discountMode} onChange={e => setDiscountMode(e.target.value as 'value' | 'percent')}
                  className={`${inputCls} w-24`}>
                  <option value="value">R$</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </div>

            <Field label="5. Forma de pagamento">
              <select className={inputCls} value={payment} onChange={e => setPayment(e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Observações"><input className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} /></Field>

            <div className="pt-3 border-t border-slate-100 space-y-1 text-xs">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatBRL(subtotal)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Desconto</span><span>− {formatBRL(discount)}</span></div>
              <div className="flex justify-between text-base font-black text-slate-900"><span>Total</span><span>{formatBRL(total)}</span></div>
            </div>

            <button type="button" className={`${btnPrimary} w-full py-3 text-sm`} style={{ backgroundColor: color }}
              disabled={busy || cart.length === 0 || !customerId} onClick={finalize}>
              <Check className="w-4 h-4" /> Finalizar venda
            </button>
          </Card>
        </div>
      ) : (
        <Card className="overflow-hidden">
          {sales.length === 0 ? (
            <Empty icon={Receipt} text="Nenhuma venda do Atacado registrada." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sales.map(sale => {
                const open = openSale === sale.id;
                return (
                  <li key={sale.id}>
                    <button type="button" onClick={() => setOpenSale(open ? null : sale.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50/60">
                      <span className="min-w-0 text-xs">
                        <span className="block font-bold text-slate-800">#{sale.sale_number} · {sale.customer_name}</span>
                        <span className="block text-[11px] text-slate-400">
                          {formatDateTime(sale.created_at)} · {sale.payment_method}{sale.seller_name ? ` · ${sale.seller_name}` : ''}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-black text-slate-900">{formatBRL(sale.total)}</span>
                        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </span>
                    </button>
                    {open && (
                      <div className="px-4 pb-4 text-xs space-y-1.5 bg-slate-50/50">
                        {sale.items.map(item => (
                          <div key={item.id} className="flex justify-between text-slate-600">
                            <span>{item.quantity} × {item.product_name}</span>
                            <span>{formatBRL(item.unit_price * item.quantity)}</span>
                          </div>
                        ))}
                        {sale.discount > 0 && (
                          <div className="flex justify-between text-slate-500"><span>Desconto</span><span>− {formatBRL(sale.discount)}</span></div>
                        )}
                        {sale.notes && <p className="text-slate-400">Obs.: {sale.notes}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {newCustomer && (
        <CustomerFormModal color={color} onClose={() => setNewCustomer(false)} onSave={saveNewCustomer} />
      )}
    </div>
  );
};
