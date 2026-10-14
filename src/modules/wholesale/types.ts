// ============================================================================
// CONTROLPHONE — ATACADO: TIPOS
// Independentes dos tipos do varejo (src/types). Espelham as tabelas wholesale_*.
// ============================================================================

export interface WholesaleSupplier {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface WholesaleProduct {
  id: string;
  tenant_id: string;
  name: string;
  category: string | null;
  quantity: number;
  cost_price: number;
  sale_price: number;
  supplier_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface WholesaleCustomer {
  id: string;
  tenant_id: string;
  name: string;
  company: string | null;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  total_purchased: number;
  purchases_count: number;
  last_purchase_at: string | null;
  created_at: string;
}

export interface WholesaleSaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
}

export interface WholesaleSale {
  id: string;
  tenant_id: string;
  sale_number: number;
  customer_id: string | null;
  customer_name: string;
  seller_id: string;
  seller_name: string | null;
  subtotal: number;
  discount: number;
  total: number;
  cost_total: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  items: WholesaleSaleItem[];
}

export type WholesaleTransactionType = 'sale' | 'purchase' | 'expense';

export interface WholesaleTransaction {
  id: string;
  tenant_id: string;
  type: WholesaleTransactionType;
  description: string;
  amount: number;
  cost: number;
  sale_id: string | null;
  product_id: string | null;
  occurred_at: string;
}

export interface WholesaleSnapshot {
  products: WholesaleProduct[];
  suppliers: WholesaleSupplier[];
  customers: WholesaleCustomer[];
  sales: WholesaleSale[];
  transactions: WholesaleTransaction[];
}

/** O que cada perfil enxerga: o vendedor não recebe fornecedores nem financeiro. */
export type WholesaleAccess = 'admin' | 'seller';

export interface ProductInput {
  id?: string;
  name: string;
  category: string;
  quantity: number;
  cost_price: number;
  sale_price: number;
  supplier_id: string | null;
  notes: string;
}

export interface CustomerInput {
  id?: string;
  name: string;
  company: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  state: string;
  notes: string;
}

export interface SupplierInput {
  id?: string;
  name: string;
  phone: string;
  notes: string;
}

export interface SaleInput {
  customerId: string;
  items: { product_id: string; quantity: number; unit_price: number }[];
  discount: number;
  paymentMethod: string;
  notes: string;
}

export interface PurchaseInput {
  productId: string;
  quantity: number;
  unitCost: number;
  notes: string;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  occurredAt: string;
}

/** Operações do módulo. Há duas implementações: banco (Supabase) e demonstração (navegador). */
export interface WholesaleRepo {
  load(access: WholesaleAccess): Promise<WholesaleSnapshot>;
  saveProduct(input: ProductInput): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  registerPurchase(input: PurchaseInput): Promise<void>;
  saveSupplier(input: SupplierInput): Promise<string>;
  deleteSupplier(id: string): Promise<void>;
  saveCustomer(input: CustomerInput): Promise<string>;
  deleteCustomer(id: string): Promise<void>;
  finalizeSale(input: SaleInput): Promise<string>;
  addExpense(input: ExpenseInput): Promise<void>;
  deleteExpense(id: string): Promise<void>;
}
