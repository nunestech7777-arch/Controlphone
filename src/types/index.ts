// ============================================================================
// CONTROLPHONE — DEFINIÇÕES DE TIPOS TYPESCRIPT
// ============================================================================

export type UserRole = 'super_admin' | 'admin' | 'seller' | 'technician';
// trial: em período de teste | cancelled: assinatura encerrada (dados preservados)
export type TenantStatus = 'active' | 'trial' | 'suspended' | 'cancelled' | 'inactive';
export type TenantPlan = 'starter' | 'professional' | 'enterprise';
// awaiting_evaluation: devolvido pelo cliente, bloqueado para venda até a avaliação
export type DeviceStatus = 'available' | 'reserved' | 'in_maintenance' | 'sold' | 'decommissioned' | 'awaiting_evaluation';
export type DeviceOrigin = 'purchase' | 'trade_in' | 'internal_transfer';
export type SaleStatus = 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'trade_in_credit' | 'store_credit' | 'other';
export type OSStatus = 
  | 'waiting_diagnosis'
  | 'in_diagnosis'
  | 'quote_pending_admin'
  | 'quote_ready'
  | 'waiting_client_approval'
  | 'approved'
  | 'in_maintenance'
  | 'waiting_parts'
  | 'repair_completed'
  | 'ready_for_pickup'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

export type ServiceOrderOrigin = 'internal' | 'external';
export type ServicePaymentStatus = 'pending' | 'paid';
export type MovementType =
  | 'stock_entry'
  | 'sold'
  | 'sale_cancelled'
  | 'sent_to_assistance'
  | 'assistance_started'
  | 'assistance_waiting_parts'
  | 'assistance_completed'
  | 'returned_to_stock'
  | 'assistance_cancelled'
  | 'external_received'
  | 'external_completed'
  | 'external_delivered'
  | 'returned_by_customer'
  | 'return_released_to_stock';

export type ExpenseCategory = 
  | 'rent'
  | 'utilities'
  | 'internet_telecom'
  | 'salaries_commissions'
  | 'marketing_ads'
  | 'parts_maintenance'
  | 'software_tools'
  | 'taxes_fees'
  | 'other';

export interface Tenant {
  id: string;
  name: string;
  trade_name: string;
  cnpj?: string;
  state_registration?: string; // Inscrição Estadual
  email: string;
  phone: string;
  whatsapp?: string;
  website?: string;
  address_zipcode?: string;
  address_street?: string;
  address_number?: string;
  address_complement?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  status: TenantStatus;
  plan?: TenantPlan;
  plan_start_date?: string; // 'YYYY-MM-DD'
  plan_due_date?: string; // 'YYYY-MM-DD'
  internal_notes?: string; // Anotações internas do Super Admin (nunca exibidas à loja)
  created_at: string;
}

export interface TenantTheme {
  id: string;
  tenant_id: string;
  logo_url?: string; // Logo principal
  logo_compact_url?: string; // Logo reduzida (espaços pequenos)
  favicon_url?: string;
  display_name: string;
  primary_color: string;
  secondary_color: string;
  accent_color?: string;
  // Quando ausentes, herdam das cores acima (ver resolveThemeColors em lib/tenantSetup)
  button_color?: string;
  sidebar_color?: string;
  card_color?: string;
  action_button_color?: string;
  theme_mode: 'light' | 'dark';
  dashboard_style: string;
  pdf_header_style: string;
}

export interface UserProfile {
  id: string;
  tenant_id?: string | null;
  role: UserRole;
  full_name: string;
  email: string;
  phone?: string;
  cpf?: string;
  avatar_url?: string;
  avatar_path?: string; // Caminho do arquivo no Supabase Storage (bucket avatars)
  is_active: boolean;
  last_access_at?: string;
  created_at: string;
}

export interface Customer {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  cpf?: string;
  birth_date?: string;
  address?: string;
  notes?: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  tenant_id: string;
  name: string;
  company_name?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  cpf_cnpj?: string;
  address?: string;
  notes?: string;
  created_at: string;
}

export type SupplierPurchaseItemType = 'device' | 'accessory' | 'gift';

// Registro histórico de compra junto a um fornecedor (não muda quando o estoque é vendido)
export interface SupplierPurchase {
  id: string;
  tenant_id: string;
  supplier_id: string;
  item_type: SupplierPurchaseItemType;
  item_id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  purchased_at: string;
  created_at: string;
}

export interface Device {
  id: string;
  tenant_id: string;
  imei: string;
  brand: string;
  model: string;
  storage_capacity: string;
  color: string;
  battery_health?: number;
  physical_condition_notes?: string; // "Observações" do aparelho (texto livre)
  photos?: string[];
  supplier_id?: string;
  origin: DeviceOrigin;
  origin_trade_in_id?: string;
  acquisition_cost: number; // Protegido contra vendedor/técnico
  accumulated_repair_cost: number; // Incrementado a cada manutenção interna
  suggested_price: number;
  status: DeviceStatus;
  entry_date: string;
  sold_at?: string;
  created_at: string;
}

export interface Accessory {
  id: string;
  tenant_id: string;
  name: string;
  category: string;
  barcode?: string;
  quantity: number;
  unit_cost: number;
  sale_price: number;
  photos?: string[];
  supplier_id?: string;
  created_at: string;
}

export interface Gift {
  id: string;
  tenant_id: string;
  name: string;
  category: string;
  quantity: number;
  unit_cost: number;
  photos?: string[];
  notes?: string;
  supplier_id?: string;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  item_type: 'device' | 'accessory';
  device_id?: string;
  accessory_id?: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  discount: number;
  total_price: number;
  warranty_days?: number; // Prazo comercial registrado no momento da venda (somente aparelhos)
  returned_at?: string; // Item trocado/devolvido: deixa de contar em vendas, ranking e receita
  return_request_id?: string;
  return_type?: ReturnResolution;
  device?: Device;
  accessory?: Accessory;
}

// Ajuste rastreável de receita gerado por troca/devolução (a venda original nunca é apagada)
export interface SaleAdjustment {
  id: string;
  type: 'refund' | 'credit' | 'exchange_difference';
  amount: number; // valor devolvido/creditado ao cliente (positivo) ou diferença cobrada (negativo = cliente pagou)
  retained_amount: number; // parte do valor do item que permaneceu como receita
  payment_method?: PaymentMethod;
  return_request_id: string;
  description: string;
  created_by: string;
  created_at: string;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  payment_method: PaymentMethod;
  amount: number;
  installments: number;
  received_at: string;
}

export interface SaleGift {
  id: string;
  sale_id: string;
  gift_id: string;
  quantity: number;
  unit_cost: number;
  gift?: Gift;
}

export interface Sale {
  id: string;
  tenant_id: string;
  sale_number: number;
  seller_id: string;
  customer_id: string;
  sales_origin: string; // Obrigatória
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  total_cost: number;
  gross_profit: number;
  status: SaleStatus;
  trade_in_id?: string; // Upgrade é uma modalidade de venda: aponta para o aparelho recebido na troca
  cancellation_reason?: string;
  cancelled_by?: string;
  cancelled_at?: string;
  created_at: string;
  customer?: Customer;
  seller?: UserProfile;
  items?: SaleItem[];
  payments?: SalePayment[];
  gifts?: SaleGift[];
  adjustments?: SaleAdjustment[];
}

export interface TradeIn {
  id: string;
  tenant_id: string;
  customer_id: string;
  seller_id: string;
  sold_device_id: string;
  received_device_id: string;
  appraisal_value: number; // Avaliação do usado
  sold_device_price: number;
  difference_amount: number;
  payment_method: PaymentMethod;
  sale_id?: string; // Venda (número normal da sequência) que originou o upgrade
  received_device_snapshot?: Device; // Cadastro anterior do aparelho recebido, quando a loja já o havia vendido
  closed_warranty_ids?: string[]; // Garantias encerradas quando esse aparelho voltou para a loja
  status: string;
  created_at: string;
  customer?: Customer;
  seller?: UserProfile;
  sold_device?: Device;
  received_device?: Device;
}

export interface ServiceOrder {
  id: string;
  tenant_id: string;
  os_number: number;
  origin: ServiceOrderOrigin; // INTERNAL = aparelho da loja (volta ao estoque) | EXTERNAL = cliente/terceiro (volta ao dono)
  device_id?: string; // Vínculo com o aparelho do estoque (somente assistência interna)
  customer_id?: string; // Proprietário (somente assistência externa)
  device_storage?: string;
  device_color?: string;
  entered_at?: string; // Data de entrada na assistência
  service_performed?: string;
  parts_used?: string;
  payment_status?: ServicePaymentStatus;
  completed_at?: string;
  closed_at?: string; // Preenchido quando a OS deixa de estar ativa
  warranty_id?: string; // Garantia comercial localizada pelo IMEI (informativo; não decide cobertura)
  sale_id?: string;
  warranty_analysis?: 'pending' | 'covered' | 'not_covered';
  warranty_analysis_notes?: string;
  // Ordem de Serviço (documento): entrada, diagnóstico e orçamento apresentado ao cliente
  imei2?: string;
  intake_checklist?: Record<string, 'ok' | 'fail' | 'untested'>;
  problem_found?: string;
  service_needed?: string;
  technical_notes?: string;
  quote_service_description?: string;
  quote_service_amount?: number;
  quote_parts_description?: string;
  quote_parts_amount?: number;
  quote_deadline?: string; // prazo estimado informado ao cliente
  intake_seller_id: string;
  assigned_technician_id?: string;
  device_brand: string;
  device_model: string;
  imei?: string;
  reported_defect: string;
  physical_condition?: string;
  photos?: string[];
  status: OSStatus;
  technician_diagnosis?: string;
  technician_parts_cost: number;
  technician_service_cost: number;
  client_quote_amount?: number; // Exclusivo do Admin
  quote_approved_at?: string;
  quote_rejected_reason?: string;
  estimated_delivery_date?: string;
  payment_method?: PaymentMethod;
  paid_amount?: number;
  received_by_seller_id?: string;
  delivered_by_seller_id?: string;
  delivered_at?: string;
  created_at: string;
  customer?: Customer;
  intake_seller?: UserProfile;
  assigned_technician?: UserProfile;
}

export interface InternalRepair {
  id: string;
  tenant_id: string;
  device_id: string;
  technician_id: string;
  issue_description: string;
  diagnosis?: string;
  parts_used?: string;
  repair_cost: number;
  service_order_id?: string;
  status: 'in_progress' | 'completed';
  completed_at?: string;
  created_at: string;
  device?: Device;
  technician?: UserProfile;
}

// ---------------------------------------------------------------------------
// GARANTIAS COMERCIAIS, TROCAS & DEVOLUÇÕES
// A garantia comercial é concedida pela loja e NÃO substitui os direitos legais (CDC).
// ---------------------------------------------------------------------------

// Módulos e recursos habilitados para a loja (definidos no cadastro, alteráveis depois)
export interface TenantFeatures {
  assistance: boolean; // Trabalha com Assistência Técnica
  upgrade: boolean; // Trabalha com Upgrade
  imei_control: boolean; // Controla estoque por IMEI
  gifts: boolean; // Trabalha com Brindes
  accessories: boolean; // Trabalha com Acessórios
  auto_warranty: boolean; // Garantia registrada automaticamente na venda
  send_whatsapp: boolean; // Envio de documentos por WhatsApp
  send_email: boolean; // Envio de documentos por e-mail
}

export interface TenantSettings extends Partial<TenantFeatures> {
  warranty_days?: number; // prazo comercial padrão aplicado às PRÓXIMAS vendas
}

// Modelos de documento próprios de cada loja (PDF), sempre vinculados ao tenant
export type TenantDocumentType = 'warranty_term' | 'service_order' | 'upgrade_contract' | 'sale_receipt';

export interface TenantDocument {
  id: string;
  tenant_id: string;
  type: TenantDocumentType;
  file_name: string;
  size: number;
  storage_path?: string; // definido quando o arquivo foi para o Supabase Storage
  fields_total: number; // campos preenchíveis encontrados no PDF
  fields_matched: number; // campos que o sistema sabe preencher
  uploaded_by: string;
  uploaded_at: string;
}

export interface RecordEvent {
  at: string;
  user_id?: string;
  user_name?: string;
  description: string;
  notes?: string;
}

export interface Warranty {
  id: string;
  tenant_id: string;
  sale_id?: string;
  sale_item_id?: string;
  trade_in_id?: string;
  device_id: string;
  imei: string;
  customer_id: string;
  sale_date: string;
  warranty_days: number;
  start_date: string; // 'YYYY-MM-DD'
  end_date: string; // 'YYYY-MM-DD'
  terms: string;
  status: 'active' | 'cancelled'; // "a vencer" e "vencida" são calculadas pelas datas
  cancelled_at?: string;
  cancel_reason?: string;
  replaces_warranty_id?: string; // garantia do aparelho original (em caso de troca)
  replaced_by_warranty_id?: string;
  history: RecordEvent[];
  created_at: string;
}

export type ReturnResolution = 'exchange' | 'refund' | 'credit';
export type ReturnStatus = 'open' | 'in_review' | 'approved' | 'rejected' | 'completed' | 'cancelled';
export type ReturnDeviceDestination = 'pending_evaluation' | 'returned_to_stock' | 'sent_to_assistance';

export interface ReturnRequest {
  id: string;
  tenant_id: string;
  request_number: number;
  sale_id: string;
  sale_item_id: string;
  device_id: string;
  imei: string;
  customer_id: string;
  requested_by: string;
  reason: string;
  notes?: string;
  resolution: ReturnResolution;
  status: ReturnStatus;
  item_paid_amount: number;
  // Preenchidos na conclusão
  refund_amount?: number;
  refund_method?: PaymentMethod;
  credit_id?: string;
  credit_amount?: number;
  new_device_id?: string;
  new_device_price?: number;
  difference_amount?: number; // > 0: cliente paga | < 0: loja devolve
  difference_method?: PaymentMethod;
  device_destination?: ReturnDeviceDestination;
  service_order_id?: string;
  history: RecordEvent[];
  created_at: string;
  completed_at?: string;
}

export interface CustomerCredit {
  id: string;
  tenant_id: string;
  customer_id: string;
  origin_sale_id: string;
  return_request_id: string;
  amount: number;
  balance: number;
  usages: { sale_id: string; amount: number; at: string }[];
  created_at: string;
}

// Rastreabilidade: cada movimentação de um aparelho (estoque, venda, assistência)
export interface DeviceMovement {
  id: string;
  tenant_id: string;
  device_id?: string;
  service_order_id?: string;
  imei?: string;
  movement_type: MovementType;
  description: string;
  from_status?: string;
  to_status?: string;
  cost?: number;
  notes?: string;
  user_id?: string;
  user_name?: string;
  created_at: string;
}

export interface Expense {
  id: string;
  tenant_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  due_date: string;
  payment_date?: string;
  payment_method?: PaymentMethod;
  status: 'pending' | 'paid';
  notes?: string;
  paid_method?: PaymentMethod; // forma efetivamente utilizada no pagamento
  receipt_name?: string; // comprovante (opcional)
  receipt_url?: string;
  created_by: string;
  created_at: string;
}

export interface SalesGoal {
  id: string;
  tenant_id: string;
  seller_id: string;
  month_year: string; // 'YYYY-MM'
  target_device_count: number;
  seller?: UserProfile;
}

export interface AuditLog {
  id: string;
  tenant_id?: string;
  user_id?: string;
  user_email?: string;
  user_role?: string;
  action: string;
  module: string;
  record_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  created_at: string;
}

export interface SupportSession {
  id: string;
  super_admin_id: string;
  target_tenant_id: string;
  started_at: string;
  ended_at?: string;
  reason: string;
}
