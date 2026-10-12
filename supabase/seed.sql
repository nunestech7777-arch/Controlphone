-- ============================================================================
-- CONTROLPHONE — DADOS INICIAIS DE SEED (MULTI-TENANT & DEMONSTRAÇÃO)
-- ============================================================================

-- Inserir Loja 1 (iTech Concept Prime)
INSERT INTO tenants (id, name, trade_name, cnpj, email, phone, address_street, address_number, address_city, address_state, status)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'iTech Prime Comércio de Celulares LTDA',
  'iTech Concept Prime',
  '12.345.678/0001-90',
  'contato@itechprime.com.br',
  '(11) 98765-4321',
  'Avenida Paulista',
  '1578',
  'São Paulo',
  'SP',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Inserir Tema Visual da Loja 1
INSERT INTO tenant_themes (tenant_id, display_name, primary_color, secondary_color, theme_mode)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'iTech Concept Prime',
  '#1845E8',
  '#0B0F17',
  'light'
) ON CONFLICT (tenant_id) DO NOTHING;

-- Inserir Loja 2 (Barra Phone Premium)
INSERT INTO tenants (id, name, trade_name, cnpj, email, phone, address_street, address_number, address_city, address_state, status)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Barra Celulares & Serviços LTDA',
  'Barra Phone Premium',
  '98.765.432/0001-10',
  'contato@barraphone.com.br',
  '(21) 99887-7665',
  'Avenida das Américas',
  '4666',
  'Rio de Janeiro',
  'RJ',
  'active'
) ON CONFLICT (id) DO NOTHING;

-- Inserir Tema Visual da Loja 2
INSERT INTO tenant_themes (tenant_id, display_name, primary_color, secondary_color, theme_mode)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Barra Phone Premium',
  '#2563EB',
  '#111827',
  'light'
) ON CONFLICT (tenant_id) DO NOTHING;

-- Inserir Super Admin
INSERT INTO profiles (id, tenant_id, role, full_name, email, phone, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'super_admin',
  'Administrador Controlphone',
  'superadmin@controlphone.com',
  '(11) 90000-0000',
  true
) ON CONFLICT (id) DO NOTHING;

-- Inserir Administrador da Loja 1
INSERT INTO profiles (id, tenant_id, role, full_name, email, phone, is_active)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'admin',
  'Robert William',
  'robert@itechprime.com.br',
  '(11) 98888-1111',
  true
) ON CONFLICT (id) DO NOTHING;

-- Inserir Vendedor da Loja 1
INSERT INTO profiles (id, tenant_id, role, full_name, email, phone, is_active)
VALUES (
  '11111111-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  'seller',
  'Lucas Mendes',
  'lucas.vendas@itechprime.com.br',
  '(11) 98888-2222',
  true
) ON CONFLICT (id) DO NOTHING;

-- Inserir Técnico da Loja 1
INSERT INTO profiles (id, tenant_id, role, full_name, email, phone, is_active)
VALUES (
  '11111111-0000-0000-0000-000000000003',
  '11111111-1111-1111-1111-111111111111',
  'technician',
  'Diego Fonseca',
  'diego.tecnico@itechprime.com.br',
  '(11) 98888-3333',
  true
) ON CONFLICT (id) DO NOTHING;
