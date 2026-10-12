-- ============================================================================
-- CONTROLPHONE — MÓDULO FORNECEDORES: VÍNCULO EM BRINDES E HISTÓRICO DE COMPRAS
-- ============================================================================

-- Brindes passam a poder ser vinculados a um fornecedor (aparelhos e acessórios já possuem a coluna)
ALTER TABLE gifts
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

-- Histórico de compras por fornecedor (aparelhos, acessórios e brindes)
CREATE TABLE IF NOT EXISTS supplier_purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('device', 'accessory', 'gift')),
  item_id UUID NOT NULL,
  description VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_purchases_supplier
  ON supplier_purchases (tenant_id, supplier_id, purchased_at DESC);

ALTER TABLE supplier_purchases ENABLE ROW LEVEL SECURITY;

-- Fornecedores e histórico de compras expõem custos: restritos ao Admin da loja (e Super Admin)
DROP POLICY IF EXISTS admin_manage_suppliers ON suppliers;
CREATE POLICY admin_manage_suppliers ON suppliers
  FOR ALL TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin())
  WITH CHECK ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

DROP POLICY IF EXISTS admin_manage_supplier_purchases ON supplier_purchases;
CREATE POLICY admin_manage_supplier_purchases ON supplier_purchases
  FOR ALL TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin())
  WITH CHECK ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());
