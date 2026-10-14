// ============================================================================
// CONTROLPHONE — ATACADO: ACESSO A DADOS
//
// Só este arquivo conversa com o banco do Atacado (tabelas wholesale_*). O
// módulo nunca usa o store do varejo. Duas implementações da mesma interface:
//   - remota: Supabase (RLS + funções SQL da migration 19);
//   - demonstração: localStorage, usada quando o Supabase não está configurado.
// ============================================================================

import { supabase } from '../../lib/supabase';
import { nextSaleNumber, round2, weightedCost } from './calc';
import {
  WholesaleAccess, WholesaleCustomer, WholesaleProduct, WholesaleRepo, WholesaleSale,
  WholesaleSaleItem, WholesaleSnapshot, WholesaleSupplier, WholesaleTransaction
} from './types';

const blank = (value: string) => (value.trim() === '' ? null : value.trim());
const num = (value: unknown) => Number(value) || 0;
const uid = () =>
  (globalThis.crypto?.randomUUID?.() as string | undefined)
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

class WholesaleError extends Error {}

// ---- Banco ----

type Row = Record<string, unknown>;

const failIf = (error: { message: string } | null) => {
  if (error) throw new WholesaleError(error.message);
};

const toProduct = (r: Row): WholesaleProduct => ({
  ...(r as unknown as WholesaleProduct),
  quantity: num(r.quantity), cost_price: num(r.cost_price), sale_price: num(r.sale_price)
});

const toCustomer = (r: Row): WholesaleCustomer => ({
  ...(r as unknown as WholesaleCustomer),
  total_purchased: num(r.total_purchased), purchases_count: num(r.purchases_count)
});

const toSale = (r: Row): WholesaleSale => {
  const { wholesale_sale_items, ...sale } = r as Row & { wholesale_sale_items?: Row[] };
  return {
    ...(sale as unknown as WholesaleSale),
    sale_number: num(sale.sale_number), subtotal: num(sale.subtotal), discount: num(sale.discount),
    total: num(sale.total), cost_total: num(sale.cost_total),
    items: (wholesale_sale_items || []).map(i => ({
      ...(i as unknown as WholesaleSaleItem),
      quantity: num(i.quantity), unit_cost: num(i.unit_cost), unit_price: num(i.unit_price)
    }))
  };
};

const toTransaction = (r: Row): WholesaleTransaction => ({
  ...(r as unknown as WholesaleTransaction), amount: num(r.amount), cost: num(r.cost)
});

export function createRemoteRepo(tenantId: string): WholesaleRepo {
  return {
    async load(access: WholesaleAccess): Promise<WholesaleSnapshot> {
      const admin = access === 'admin';
      // Vendedor: só produtos, clientes e as próprias vendas (as regras do banco também impõem isso)
      const [products, customers, sales, suppliers, transactions] = await Promise.all([
        supabase.from('wholesale_products').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('wholesale_customers').select('*').eq('tenant_id', tenantId).order('name'),
        supabase.from('wholesale_sales').select('*, wholesale_sale_items(*)').eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }).limit(1000),
        admin
          ? supabase.from('wholesale_suppliers').select('*').eq('tenant_id', tenantId).order('name')
          : Promise.resolve({ data: [], error: null }),
        admin
          ? supabase.from('wholesale_transactions').select('*').eq('tenant_id', tenantId)
            .order('occurred_at', { ascending: false }).limit(5000)
          : Promise.resolve({ data: [], error: null })
      ]);
      failIf(products.error); failIf(customers.error); failIf(sales.error);
      failIf(suppliers.error); failIf(transactions.error);
      return {
        products: (products.data || []).map(toProduct),
        customers: (customers.data || []).map(toCustomer),
        sales: (sales.data || []).map(toSale),
        suppliers: (suppliers.data || []) as unknown as WholesaleSupplier[],
        transactions: (transactions.data || []).map(toTransaction)
      };
    },

    async saveProduct(input) {
      const fields = {
        name: input.name.trim(),
        category: blank(input.category),
        cost_price: round2(input.cost_price),
        sale_price: round2(input.sale_price),
        supplier_id: input.supplier_id,
        notes: blank(input.notes),
        updated_at: new Date().toISOString()
      };
      if (input.id) {
        // edição de cadastro: a quantidade só muda por entrada de estoque ou ajuste explícito
        const { error } = await supabase.from('wholesale_products')
          .update({ ...fields, quantity: input.quantity }).eq('id', input.id).eq('tenant_id', tenantId);
        failIf(error);
        return;
      }
      // Produto novo nasce vazio; o estoque inicial entra como compra, para o financeiro registrar
      const { data, error } = await supabase.from('wholesale_products')
        .insert({ ...fields, tenant_id: tenantId, quantity: 0 }).select('id').single();
      failIf(error);
      if (input.quantity > 0) {
        const { error: purchaseError } = await supabase.rpc('wholesale_register_purchase', {
          p_tenant_id: tenantId, p_product_id: data!.id, p_quantity: input.quantity,
          p_unit_cost: round2(input.cost_price), p_notes: 'Estoque inicial'
        });
        failIf(purchaseError);
      }
    },

    async deleteProduct(id) {
      const { error } = await supabase.from('wholesale_products').delete().eq('id', id).eq('tenant_id', tenantId);
      failIf(error);
    },

    async registerPurchase(input) {
      const { error } = await supabase.rpc('wholesale_register_purchase', {
        p_tenant_id: tenantId, p_product_id: input.productId, p_quantity: input.quantity,
        p_unit_cost: round2(input.unitCost), p_notes: blank(input.notes)
      });
      failIf(error);
    },

    async saveSupplier(input) {
      const fields = { name: input.name.trim(), phone: blank(input.phone), notes: blank(input.notes), updated_at: new Date().toISOString() };
      if (input.id) {
        const { error } = await supabase.from('wholesale_suppliers').update(fields).eq('id', input.id).eq('tenant_id', tenantId);
        failIf(error);
        return input.id;
      }
      const { data, error } = await supabase.from('wholesale_suppliers')
        .insert({ ...fields, tenant_id: tenantId }).select('id').single();
      failIf(error);
      return data!.id as string;
    },

    async deleteSupplier(id) {
      const { error } = await supabase.from('wholesale_suppliers').delete().eq('id', id).eq('tenant_id', tenantId);
      failIf(error);
    },

    async saveCustomer(input) {
      const fields = {
        name: input.name.trim(), company: blank(input.company), document: blank(input.document),
        phone: blank(input.phone), whatsapp: blank(input.whatsapp), email: blank(input.email),
        city: blank(input.city), state: blank(input.state), notes: blank(input.notes)
      };
      if (input.id) {
        const { error } = await supabase.from('wholesale_customers')
          .update({ ...fields, updated_at: new Date().toISOString() }).eq('id', input.id).eq('tenant_id', tenantId);
        failIf(error);
        return input.id;
      }
      const { data, error } = await supabase.from('wholesale_customers')
        .insert({ ...fields, tenant_id: tenantId }).select('id').single();
      failIf(error);
      return data!.id as string;
    },

    async deleteCustomer(id) {
      const { error } = await supabase.from('wholesale_customers').delete().eq('id', id).eq('tenant_id', tenantId);
      failIf(error);
    },

    async finalizeSale(input) {
      const { data, error } = await supabase.rpc('wholesale_finalize_sale', {
        p_tenant_id: tenantId, p_customer_id: input.customerId, p_items: input.items,
        p_discount: round2(input.discount), p_payment_method: input.paymentMethod, p_notes: blank(input.notes)
      });
      failIf(error);
      return data as string;
    },

    async addExpense(input) {
      const { error } = await supabase.from('wholesale_transactions').insert({
        tenant_id: tenantId, type: 'expense', description: input.description.trim(),
        amount: round2(input.amount), occurred_at: new Date(input.occurredAt).toISOString()
      });
      failIf(error);
    },

    async deleteExpense(id) {
      const { error } = await supabase.from('wholesale_transactions').delete()
        .eq('id', id).eq('tenant_id', tenantId).eq('type', 'expense');
      failIf(error);
    }
  };
}

// ---- Demonstração (sem Supabase) ----

export function createLocalRepo(tenantId: string, userId: string, userName: string): WholesaleRepo {
  const key = `controlphone.wholesale.v1.${tenantId}`;
  const now = () => new Date().toISOString();

  const read = (): WholesaleSnapshot => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as WholesaleSnapshot;
    } catch { /* cache indisponível: começa vazio */ }
    return { products: [], suppliers: [], customers: [], sales: [], transactions: [] };
  };
  const write = (snapshot: WholesaleSnapshot) => {
    try { localStorage.setItem(key, JSON.stringify(snapshot)); } catch { /* sem espaço ou bloqueado */ }
  };
  const change = <T>(fn: (s: WholesaleSnapshot) => T): T => {
    const snapshot = read();
    const result = fn(snapshot);
    write(snapshot);
    return result;
  };

  const purchase = (s: WholesaleSnapshot, product: WholesaleProduct, quantity: number, unitCost: number, notes: string) => {
    product.cost_price = weightedCost(product, quantity, unitCost);
    product.quantity += quantity;
    product.updated_at = now();
    s.transactions.unshift({
      id: uid(), tenant_id: tenantId, type: 'purchase', sale_id: null, product_id: product.id, cost: 0,
      description: `Compra: ${quantity} × ${product.name}${notes.trim() ? ' — ' + notes.trim() : ''}`,
      amount: round2(quantity * unitCost), occurred_at: now()
    });
  };

  return {
    async load() { return read(); },

    async saveProduct(input) {
      change(s => {
        if (input.id) {
          const p = s.products.find(x => x.id === input.id);
          if (!p) throw new WholesaleError('Produto não encontrado.');
          Object.assign(p, {
            name: input.name.trim(), category: blank(input.category), quantity: input.quantity,
            cost_price: round2(input.cost_price), sale_price: round2(input.sale_price),
            supplier_id: input.supplier_id, notes: blank(input.notes), updated_at: now()
          });
          return;
        }
        const product: WholesaleProduct = {
          id: uid(), tenant_id: tenantId, name: input.name.trim(), category: blank(input.category),
          quantity: 0, cost_price: round2(input.cost_price), sale_price: round2(input.sale_price),
          supplier_id: input.supplier_id, notes: blank(input.notes), created_at: now(), updated_at: now()
        };
        s.products.push(product);
        if (input.quantity > 0) purchase(s, product, input.quantity, input.cost_price, 'Estoque inicial');
      });
    },

    async deleteProduct(id) {
      change(s => { s.products = s.products.filter(p => p.id !== id); });
    },

    async registerPurchase(input) {
      change(s => {
        const p = s.products.find(x => x.id === input.productId);
        if (!p) throw new WholesaleError('Produto do Atacado não encontrado.');
        if (input.quantity <= 0 || input.unitCost < 0) throw new WholesaleError('Quantidade ou custo inválido.');
        purchase(s, p, input.quantity, input.unitCost, input.notes);
      });
    },

    async saveSupplier(input) {
      return change(s => {
        const fields = { name: input.name.trim(), phone: blank(input.phone), notes: blank(input.notes) };
        const existing = input.id ? s.suppliers.find(x => x.id === input.id) : undefined;
        if (existing) { Object.assign(existing, fields); return existing.id; }
        const supplier: WholesaleSupplier = { id: uid(), tenant_id: tenantId, created_at: now(), ...fields };
        s.suppliers.push(supplier);
        return supplier.id;
      });
    },

    async deleteSupplier(id) {
      change(s => {
        s.suppliers = s.suppliers.filter(x => x.id !== id);
        s.products.forEach(p => { if (p.supplier_id === id) p.supplier_id = null; });
      });
    },

    async saveCustomer(input) {
      return change(s => {
        const fields = {
          name: input.name.trim(), company: blank(input.company), document: blank(input.document),
          phone: blank(input.phone), whatsapp: blank(input.whatsapp), email: blank(input.email),
          city: blank(input.city), state: blank(input.state), notes: blank(input.notes)
        };
        const existing = input.id ? s.customers.find(x => x.id === input.id) : undefined;
        if (existing) { Object.assign(existing, fields); return existing.id; }
        const customer: WholesaleCustomer = {
          id: uid(), tenant_id: tenantId, created_at: now(), total_purchased: 0, purchases_count: 0,
          last_purchase_at: null, ...fields
        };
        s.customers.push(customer);
        return customer.id;
      });
    },

    async deleteCustomer(id) {
      change(s => { s.customers = s.customers.filter(c => c.id !== id); });
    },

    async finalizeSale(input) {
      return change(s => {
        const customer = s.customers.find(c => c.id === input.customerId);
        if (!customer) throw new WholesaleError('Cliente do Atacado não encontrado.');
        if (input.items.length === 0) throw new WholesaleError('Informe ao menos um produto.');
        // valida tudo antes de baixar qualquer estoque
        const wanted = new Map<string, number>();
        input.items.forEach(i => wanted.set(i.product_id, (wanted.get(i.product_id) || 0) + i.quantity));
        for (const [productId, qty] of wanted) {
          const p = s.products.find(x => x.id === productId);
          if (!p) throw new WholesaleError('Produto do Atacado não encontrado.');
          if (qty <= 0) throw new WholesaleError('Quantidade inválida.');
          if (p.quantity < qty) {
            throw new WholesaleError(`Estoque insuficiente de "${p.name}": disponível ${p.quantity}, pedido ${qty}.`);
          }
        }
        const saleId = uid();
        const items: WholesaleSaleItem[] = input.items.map(i => {
          const p = s.products.find(x => x.id === i.product_id)!;
          return {
            id: uid(), sale_id: saleId, product_id: p.id, product_name: p.name, quantity: i.quantity,
            unit_cost: p.cost_price, unit_price: round2(i.unit_price)
          };
        });
        const subtotal = round2(items.reduce((acc, i) => acc + i.unit_price * i.quantity, 0));
        const discount = round2(input.discount);
        if (discount < 0 || discount > subtotal) throw new WholesaleError('Desconto inválido.');
        const total = round2(subtotal - discount);
        const costTotal = round2(items.reduce((acc, i) => acc + i.unit_cost * i.quantity, 0));
        const number = nextSaleNumber(s.sales);

        items.forEach(i => { s.products.find(x => x.id === i.product_id)!.quantity -= i.quantity; });
        s.sales.unshift({
          id: saleId, tenant_id: tenantId, sale_number: number, customer_id: customer.id,
          customer_name: customer.name, seller_id: userId, seller_name: userName, subtotal, discount, total,
          cost_total: costTotal, payment_method: input.paymentMethod, notes: blank(input.notes),
          created_at: now(), items
        });
        s.transactions.unshift({
          id: uid(), tenant_id: tenantId, type: 'sale', description: `Venda #${number} — ${customer.name}`,
          amount: total, cost: costTotal, sale_id: saleId, product_id: null, occurred_at: now()
        });
        customer.total_purchased = round2(customer.total_purchased + total);
        customer.purchases_count += 1;
        customer.last_purchase_at = now();
        return saleId;
      });
    },

    async addExpense(input) {
      change(s => {
        s.transactions.unshift({
          id: uid(), tenant_id: tenantId, type: 'expense', description: input.description.trim(),
          amount: round2(input.amount), cost: 0, sale_id: null, product_id: null,
          occurred_at: new Date(input.occurredAt).toISOString()
        });
      });
    },

    async deleteExpense(id) {
      change(s => { s.transactions = s.transactions.filter(t => !(t.id === id && t.type === 'expense')); });
    }
  };
}

export const describeError = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;
