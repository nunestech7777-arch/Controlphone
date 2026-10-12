-- ============================================================================
-- CONTROLPHONE — CADASTRO COMPLETO DE LOJA (ASSISTENTE DO SUPER ADMIN)
-- Dados da empresa, plano e situação da assinatura, identidade visual ampliada,
-- configurações por loja e modelos de documento (PDF) por tenant.
-- Pré-requisitos: migrations 01 e 02 (tenants, tenant_themes, profiles,
-- get_auth_tenant_id e is_super_admin).
--
-- Usuários com senha (administrador, vendedores e técnicos) são criados no
-- Supabase Auth, o que exige a service role: essa parte do "Criar Loja" deve
-- rodar em uma Edge Function (auth.admin.createUser + insert em profiles),
-- nunca no navegador.
-- ============================================================================

-- 1. Situação da assinatura e plano
ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'trial';
ALTER TYPE tenant_status ADD VALUE IF NOT EXISTS 'cancelled';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_plan') THEN
    CREATE TYPE tenant_plan AS ENUM ('starter', 'professional', 'enterprise');
  END IF;
END $$;

-- 2. Dados da empresa (bairro e CEP já existem desde a migration 01)
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS state_registration VARCHAR(30),
  ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50),
  ADD COLUMN IF NOT EXISTS website VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_complement VARCHAR(150),
  ADD COLUMN IF NOT EXISTS plan tenant_plan,
  ADD COLUMN IF NOT EXISTS plan_start_date DATE,
  ADD COLUMN IF NOT EXISTS plan_due_date DATE;

ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_plan_dates_check;
ALTER TABLE tenants ADD CONSTRAINT tenants_plan_dates_check
  CHECK (plan_start_date IS NULL OR plan_due_date IS NULL OR plan_due_date >= plan_start_date);

-- Um CNPJ por loja (comparado só pelos dígitos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_cnpj_unique
  ON tenants (regexp_replace(cnpj, '\D', '', 'g'))
  WHERE cnpj IS NOT NULL AND cnpj <> '';

-- 3. Observações internas do Super Admin.
--    Ficam em tabela própria porque a policy member_select_own_tenant libera
--    todas as colunas de tenants para os usuários da loja.
CREATE TABLE IF NOT EXISTS tenant_internal_notes (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  notes TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tenant_internal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS super_admin_all_internal_notes ON tenant_internal_notes;
CREATE POLICY super_admin_all_internal_notes ON tenant_internal_notes
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- 4. Identidade visual: logo reduzida, favicon e cores específicas.
--    Cores nulas herdam das principais (botões -> primária, sidebar -> secundária).
ALTER TABLE tenant_themes
  ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20),
  ADD COLUMN IF NOT EXISTS logo_compact_url TEXT,
  ADD COLUMN IF NOT EXISTS favicon_url TEXT,
  ADD COLUMN IF NOT EXISTS button_color VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sidebar_color VARCHAR(20),
  ADD COLUMN IF NOT EXISTS card_color VARCHAR(20),
  ADD COLUMN IF NOT EXISTS action_button_color VARCHAR(20);

-- 5. Usuários: CPF opcional e último acesso
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cpf VARCHAR(20),
  ADD COLUMN IF NOT EXISTS last_access_at TIMESTAMPTZ;

-- 6. Configurações da loja (recursos habilitados)
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  assistance BOOLEAN NOT NULL DEFAULT true,
  upgrade BOOLEAN NOT NULL DEFAULT true,
  imei_control BOOLEAN NOT NULL DEFAULT true,
  gifts BOOLEAN NOT NULL DEFAULT true,
  accessories BOOLEAN NOT NULL DEFAULT true,
  auto_warranty BOOLEAN NOT NULL DEFAULT true,
  send_whatsapp BOOLEAN NOT NULL DEFAULT true,
  send_email BOOLEAN NOT NULL DEFAULT true,
  warranty_days INT NOT NULL DEFAULT 90 CHECK (warranty_days >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

-- Lojas já existentes continuam com tudo habilitado
INSERT INTO tenant_settings (tenant_id)
SELECT id FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

DROP POLICY IF EXISTS super_admin_all_tenant_settings ON tenant_settings;
CREATE POLICY super_admin_all_tenant_settings ON tenant_settings
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS member_select_own_tenant_settings ON tenant_settings;
CREATE POLICY member_select_own_tenant_settings ON tenant_settings
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

-- 7. Modelos de documento da loja (um PDF por tipo, sempre vinculado ao tenant)
CREATE TABLE IF NOT EXISTS tenant_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('warranty_term', 'service_order', 'upgrade_contract', 'sale_receipt')),
  file_name VARCHAR(255) NOT NULL,
  size BIGINT NOT NULL,
  storage_path TEXT NOT NULL, -- {tenant_id}/{type}.pdf no bucket tenant-documents
  fields_total INT NOT NULL DEFAULT 0,
  fields_matched INT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_tenant_document_type UNIQUE (tenant_id, type)
);
ALTER TABLE tenant_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS super_admin_all_tenant_documents ON tenant_documents;
CREATE POLICY super_admin_all_tenant_documents ON tenant_documents
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

DROP POLICY IF EXISTS member_select_own_tenant_documents ON tenant_documents;
CREATE POLICY member_select_own_tenant_documents ON tenant_documents
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

-- 8. Arquivos dos modelos: bucket privado, só PDF, até 10 MB.
--    A primeira pasta do caminho é o tenant_id; a loja lê apenas a própria pasta.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('tenant-documents', 'tenant-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS tenant_documents_member_read ON storage.objects;
CREATE POLICY tenant_documents_member_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tenant-documents' AND (
      (storage.foldername(name))[1] = get_auth_tenant_id()::text
      OR is_super_admin()
    )
  );

DROP POLICY IF EXISTS tenant_documents_super_admin_insert ON storage.objects;
CREATE POLICY tenant_documents_super_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-documents' AND is_super_admin());

DROP POLICY IF EXISTS tenant_documents_super_admin_update ON storage.objects;
CREATE POLICY tenant_documents_super_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-documents' AND is_super_admin());

DROP POLICY IF EXISTS tenant_documents_super_admin_delete ON storage.objects;
CREATE POLICY tenant_documents_super_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'tenant-documents' AND is_super_admin());
