-- ============================================================================
-- CONTROLPHONE — ESQUEMA RELACIONAL MULTI-TENANT (POSTGRESQL / SUPABASE)
-- ============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tipos enumerados
CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'seller', 'technician');
CREATE TYPE tenant_status AS ENUM ('active', 'suspended', 'inactive');
CREATE TYPE device_condition AS ENUM ('new', 'used_like_new', 'used_excellent', 'used_good', 'used_fair');
CREATE TYPE device_status AS ENUM ('available', 'reserved', 'in_maintenance', 'sold', 'decommissioned');
CREATE TYPE device_origin AS ENUM ('purchase', 'trade_in', 'internal_transfer');
CREATE TYPE sale_status AS ENUM ('completed', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'pix', 'credit_card', 'debit_card', 'trade_in_credit', 'other');
CREATE TYPE os_status AS ENUM (
  'waiting_diagnosis',
  'in_diagnosis',
  'quote_pending_admin',
  'quote_ready',
  'waiting_client_approval',
  'approved',
  'in_maintenance',
  'waiting_parts',
  'ready_for_pickup',
  'delivered',
  'rejected',
  'cancelled'
);
CREATE TYPE expense_category AS ENUM (
  'rent',
  'utilities',
  'internet_telecom',
  'salaries_commissions',
  'marketing_ads',
  'parts_maintenance',
  'software_tools',
  'taxes_fees',
  'other'
);

-- 1. LOJAS (TENANTS)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(20),
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  address_street VARCHAR(255),
  address_number VARCHAR(50),
  address_neighborhood VARCHAR(100),
  address_city VARCHAR(100),
  address_state VARCHAR(2),
  address_zipcode VARCHAR(20),
  status tenant_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. PERSONALIZAÇÃO VISUAL DAS LOJAS (EXCLUSIVO SUPER ADMIN)
CREATE TABLE IF NOT EXISTS tenant_themes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  logo_url TEXT,
  display_name VARCHAR(255),
  primary_color VARCHAR(20) NOT NULL DEFAULT '#1845E8',
  secondary_color VARCHAR(20) NOT NULL DEFAULT '#0B0F17',
  theme_mode VARCHAR(10) NOT NULL DEFAULT 'light',
  dashboard_style VARCHAR(50) NOT NULL DEFAULT 'default',
  pdf_header_style VARCHAR(50) NOT NULL DEFAULT 'standard',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PERFIS DE USUÁRIOS
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY, -- Id do Supabase Auth
  tenant_id UUID REFERENCES tenants(id) ON DELETE RESTRICT,
  role user_role NOT NULL DEFAULT 'seller',
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CLIENTES (CRM)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  whatsapp VARCHAR(50),
  email VARCHAR(255),
  cpf VARCHAR(20),
  birth_date DATE,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. FORNECEDORES
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  phone VARCHAR(50) NOT NULL,
  whatsapp VARCHAR(50),
  email VARCHAR(255),
  cpf_cnpj VARCHAR(30),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. APARELHOS (ESTOQUE COM IMEI ÚNICO)
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  imei VARCHAR(50) NOT NULL,
  brand VARCHAR(100) NOT NULL,
  model VARCHAR(150) NOT NULL,
  storage_capacity VARCHAR(50) NOT NULL,
  color VARCHAR(50) NOT NULL,
  condition device_condition NOT NULL DEFAULT 'used_like_new',
  battery_health INT, -- % da saúde da bateria
  physical_condition_notes TEXT,
  photos TEXT[], -- URLs de fotos
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  origin device_origin NOT NULL DEFAULT 'purchase',
  origin_trade_in_id UUID, -- Se veio de um upgrade
  acquisition_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  accumulated_repair_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  suggested_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status device_status NOT NULL DEFAULT 'available',
  entry_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_tenant_imei UNIQUE (tenant_id, imei)
);

-- 7. ACESSÓRIOS
CREATE TABLE IF NOT EXISTS accessories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  barcode VARCHAR(100),
  quantity INT NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  photos TEXT[],
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. BRINDES
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  photos TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. VENDAS
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_number BIGSERIAL,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  sales_origin VARCHAR(100) NOT NULL, -- Pergunta obrigatória de origem
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  gross_profit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  status sale_status NOT NULL DEFAULT 'completed',
  cancellation_reason TEXT,
  cancelled_by UUID REFERENCES profiles(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. ITENS DA VENDA
CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL, -- 'device' ou 'accessory'
  device_id UUID REFERENCES devices(id) ON DELETE RESTRICT,
  accessory_id UUID REFERENCES accessories(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- 11. PAGAMENTOS DA VENDA
CREATE TABLE IF NOT EXISTS sale_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method payment_method NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  installments INT NOT NULL DEFAULT 1,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. BRINDES INCLUSOS NA VENDA (R$ 0,00 cobrado, custo absorvido)
CREATE TABLE IF NOT EXISTS sale_gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  gift_id UUID NOT NULL REFERENCES gifts(id) ON DELETE RESTRICT,
  quantity INT NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00
);

-- 13. UPGRADES (TRADE-IN)
CREATE TABLE IF NOT EXISTS trade_ins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  sold_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  received_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  appraisal_value NUMERIC(12, 2) NOT NULL, -- Valor avaliado do aparelho usado (vira acquisition_cost)
  sold_device_price NUMERIC(12, 2) NOT NULL,
  difference_amount NUMERIC(12, 2) NOT NULL,
  payment_method payment_method NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. ORDENS DE SERVIÇO (ASSISTÊNCIA TÉCNICA DE CLIENTES)
CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  os_number BIGSERIAL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  intake_seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assigned_technician_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  device_brand VARCHAR(100) NOT NULL,
  device_model VARCHAR(150) NOT NULL,
  imei VARCHAR(50),
  reported_defect TEXT NOT NULL,
  physical_condition TEXT,
  photos TEXT[],
  status os_status NOT NULL DEFAULT 'waiting_diagnosis',
  technician_diagnosis TEXT,
  technician_parts_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  technician_service_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  client_quote_amount NUMERIC(12, 2), -- Definido EXCLUSIVAMENTE pelo Admin
  quote_approved_at TIMESTAMPTZ,
  quote_rejected_reason TEXT,
  estimated_delivery_date DATE,
  payment_method payment_method,
  paid_amount NUMERIC(12, 2),
  received_by_seller_id UUID REFERENCES profiles(id),
  delivered_by_seller_id UUID REFERENCES profiles(id),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. MANUTENÇÕES INTERNAS DO ESTOQUE
CREATE TABLE IF NOT EXISTS internal_repairs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  issue_description TEXT NOT NULL,
  diagnosis TEXT,
  parts_used TEXT,
  repair_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Acrescido ao accumulated_repair_cost
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed'
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. DESPESAS E FINANCEIRO
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  category expense_category NOT NULL DEFAULT 'other',
  description VARCHAR(255) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  payment_method payment_method,
  status VARCHAR(20) NOT NULL DEFAULT 'paid', -- 'pending', 'paid'
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. METAS DE VENDAS
CREATE TABLE IF NOT EXISTS sales_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month_year VARCHAR(7) NOT NULL, -- 'YYYY-MM'
  target_device_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_seller_month_goal UNIQUE (tenant_id, seller_id, month_year)
);

-- 18. GARANTIAS
CREATE TABLE IF NOT EXISTS warranties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  terms_text TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'expired', 'claimed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. MODELOS DE DOCUMENTOS E TERMOS
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  template_type VARCHAR(50) NOT NULL, -- 'warranty_term', 'service_order_term', 'sale_receipt'
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_tenant_template UNIQUE (tenant_id, template_type)
);

-- 20. DOCUMENTOS GERADOS E ANEXOS ASSINADOS
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  document_type VARCHAR(50) NOT NULL,
  reference_id UUID NOT NULL, -- sale_id ou service_order_id
  file_url TEXT NOT NULL,
  signed_file_url TEXT, -- Arquivo assinado enviado pelo vendedor
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. AUDITORIA COMPLETA (IMMUTABLE AUDIT LOGS)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  user_role VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  module VARCHAR(100) NOT NULL,
  record_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. SESSÕES DE SUPORTE DO SUPER ADMIN
CREATE TABLE IF NOT EXISTS support_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  super_admin_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  target_tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  reason TEXT NOT NULL
);

-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_devices_tenant_imei ON devices(tenant_id, imei);
CREATE INDEX IF NOT EXISTS idx_devices_tenant_status ON devices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_seller ON sales(tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_date ON sales(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_service_orders_tenant_status ON service_orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_module ON audit_logs(tenant_id, module);
