-- ============================================================================
-- CONTROLPHONE — POLÍTICAS DE SEGURANÇA POR NÍVEL DE LINHA (RLS)
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;

-- Função auxiliar: obter tenant_id do usuário autenticado
CREATE OR REPLACE FUNCTION get_auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Função auxiliar: obter role do usuário autenticado
CREATE OR REPLACE FUNCTION get_auth_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Função auxiliar: verificar se é super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. TENANTS: Super admin tem acesso total. Usuários normais apenas veem sua própria loja.
CREATE POLICY super_admin_all_tenants ON tenants
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY member_select_own_tenant ON tenants
  FOR SELECT TO authenticated
  USING (id = get_auth_tenant_id());

-- 2. TENANT THEMES: Super admin pode ler e editar tudo. Usuários apenas leem de sua loja.
CREATE POLICY super_admin_all_themes ON tenant_themes
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY member_select_own_theme ON tenant_themes
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

-- 3. PROFILES: Super admin tudo. Admin da loja gerencia seu time. Vendedor/Técnico veem apenas perfis de sua loja.
CREATE POLICY super_admin_all_profiles ON profiles
  FOR ALL TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY admin_manage_store_profiles ON profiles
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin')
  WITH CHECK (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin' AND role IN ('seller', 'technician'));

CREATE POLICY member_view_same_store_profiles ON profiles
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id());

-- 4. DEVICES (ESTOQUE):
-- Super admin vê tudo.
-- Admin e Técnico e Vendedor veem estoque da própria loja.
CREATE POLICY tenant_isolation_devices ON devices
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_auth_tenant_id() OR is_super_admin());

-- 5. SALES & SALE ITEMS & TRADE-INS:
-- Vendedor pode criar vendas e upgrades de sua loja e ver suas próprias vendas.
-- Admin vê todas as vendas de sua loja.
CREATE POLICY tenant_isolation_sales ON sales
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_auth_tenant_id() OR is_super_admin());

CREATE POLICY tenant_isolation_sale_items ON sale_items
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_auth_tenant_id() OR is_super_admin());

CREATE POLICY tenant_isolation_trade_ins ON trade_ins
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_auth_tenant_id() OR is_super_admin());

-- 6. SERVICE ORDERS:
-- Vendedor cria, recebe pagamento e entrega. Técnico diagnostica e repara. Admin orça.
CREATE POLICY tenant_isolation_service_orders ON service_orders
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_auth_tenant_id() OR is_super_admin());

-- 7. INTERNAL REPAIRS:
-- Técnico e Admin da loja gerenciam manutenções internas.
CREATE POLICY tenant_isolation_internal_repairs ON internal_repairs
  FOR ALL TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_auth_tenant_id() OR is_super_admin());

-- 8. EXPENSES (DESPESAS FINANCEIRAS):
-- Exclusivo do Administrador da loja e Super Admin. Vendedores e Técnicos NÃO TÊM ACESSO.
CREATE POLICY admin_manage_expenses ON expenses
  FOR ALL TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin())
  WITH CHECK ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

-- 9. AUDIT LOGS (IMMUTABLE):
-- Somente inserção automática via triggers e leitura restrita por loja/admin.
CREATE POLICY view_store_audit_logs ON audit_logs
  FOR SELECT TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

CREATE POLICY insert_audit_logs ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);
