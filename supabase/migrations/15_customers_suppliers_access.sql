-- ============================================================================
-- CONTROLPHONE — CLIENTES E FORNECEDORES NO BANCO (PRIMEIRO MÓDULO OPERACIONAL)
--
-- A tabela customers tinha a segurança por linha (RLS) ligada, mas nenhuma
-- regra de acesso: ninguém conseguia ler nem gravar. Esta migration cria as
-- regras para o aplicativo passar a guardar os clientes no banco.
--
--   Clientes     : toda a equipe da loja consulta; administrador e vendedor
--                  cadastram e editam; só o administrador exclui.
--   Fornecedores : continuam restritos ao administrador (migration 04).
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 14.
-- ============================================================================

-- 1. CLIENTES
DROP POLICY IF EXISTS tenant_view_customers ON customers;
CREATE POLICY tenant_view_customers ON customers
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS staff_insert_customers ON customers;
CREATE POLICY staff_insert_customers ON customers
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('admin', 'seller'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS staff_update_customers ON customers;
CREATE POLICY staff_update_customers ON customers
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('admin', 'seller'))
    OR is_super_admin()
  )
  WITH CHECK (
    (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('admin', 'seller'))
    OR is_super_admin()
  );

DROP POLICY IF EXISTS admin_delete_customers ON customers;
CREATE POLICY admin_delete_customers ON customers
  FOR DELETE TO authenticated
  USING (
    (tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin')
    OR is_super_admin()
  );

CREATE INDEX IF NOT EXISTS idx_customers_tenant_name ON customers (tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_name ON suppliers (tenant_id, name);

-- 2. Usuário desativado deixa de enxergar e gravar dados da loja na mesma hora
--    (antes, quem já estava com o sistema aberto continuava com acesso).
CREATE OR REPLACE FUNCTION get_auth_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND is_active IS NOT FALSE;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 3. Tempo real: cadastros aparecem nos outros aparelhos da loja sem recarregar
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE customers; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE suppliers; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- Conferência: deve listar as 4 regras de customers e as de suppliers
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('customers', 'suppliers') ORDER BY 1, 2;
