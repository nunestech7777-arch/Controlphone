-- ============================================================================
-- CONTROLPHONE — ESTOQUE NO BANCO (APARELHOS, ACESSÓRIOS, BRINDES E COMPRAS)
--
-- O aplicativo passa a guardar o estoque no banco. Para isso:
--
--   1. accessories e gifts tinham a segurança por linha (RLS) ligada, mas sem
--      nenhuma regra: ninguém conseguia ler nem gravar. Aqui entram as regras.
--        - toda a equipe da loja consulta e atualiza (a venda baixa a quantidade);
--        - só o administrador cadastra e exclui.
--      devices e supplier_purchases já tinham regras (migrations 02 e 04).
--
--   2. Dois gatilhos de devices são desligados por enquanto. Eles foram escritos
--      para quando vendas e assistência rodarem dentro do banco; hoje essas
--      operações ainda acontecem no aplicativo, que envia só o resultado, e os
--      gatilhos recusariam mudanças legítimas (ex.: aparelho vendido que volta
--      em um upgrade) ou gravariam movimentações duplicadas. Eles voltam junto
--      com a migração de Vendas e Assistência.
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 15.
-- ============================================================================

-- 1. ACESSÓRIOS
DROP POLICY IF EXISTS tenant_view_accessories ON accessories;
CREATE POLICY tenant_view_accessories ON accessories
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS admin_insert_accessories ON accessories;
CREATE POLICY admin_insert_accessories ON accessories
  FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

DROP POLICY IF EXISTS staff_update_accessories ON accessories;
CREATE POLICY staff_update_accessories ON accessories
  FOR UPDATE TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_auth_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS admin_delete_accessories ON accessories;
CREATE POLICY admin_delete_accessories ON accessories
  FOR DELETE TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

-- 2. BRINDES
DROP POLICY IF EXISTS tenant_view_gifts ON gifts;
CREATE POLICY tenant_view_gifts ON gifts
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS admin_insert_gifts ON gifts;
CREATE POLICY admin_insert_gifts ON gifts
  FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

DROP POLICY IF EXISTS staff_update_gifts ON gifts;
CREATE POLICY staff_update_gifts ON gifts
  FOR UPDATE TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin())
  WITH CHECK (tenant_id = get_auth_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS admin_delete_gifts ON gifts;
CREATE POLICY admin_delete_gifts ON gifts
  FOR DELETE TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

-- 3. Gatilhos de devices desligados até Vendas e Assistência rodarem no banco
DROP TRIGGER IF EXISTS trg_guard_device_status ON devices;
DROP TRIGGER IF EXISTS trg_log_device_sale ON devices;

CREATE INDEX IF NOT EXISTS idx_devices_tenant_status ON devices (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_accessories_tenant ON accessories (tenant_id);
CREATE INDEX IF NOT EXISTS idx_gifts_tenant ON gifts (tenant_id);

-- 4. Tempo real: baixa de estoque aparece nos outros aparelhos da loja
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE devices; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE accessories; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE gifts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- Conferência: 4 regras para accessories, 4 para gifts, e nenhum gatilho "trg_" em devices
SELECT 'regra' AS tipo, tablename AS tabela, policyname AS nome FROM pg_policies
WHERE tablename IN ('accessories', 'gifts', 'devices', 'supplier_purchases')
UNION ALL
SELECT 'gatilho', event_object_table, trigger_name FROM information_schema.triggers
WHERE event_object_table = 'devices'
ORDER BY 1, 2, 3;
