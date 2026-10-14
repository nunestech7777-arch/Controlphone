-- ============================================================================
-- CONTROLPHONE — MÓDULO OPCIONAL "ATACADO"
--
-- Pequeno ERP independente do varejo. Nada aqui lê ou grava em devices, sales,
-- customers, suppliers, tenant_records etc.
--
--   1. tenant_settings ganha duas colunas:
--        wholesale               módulo contratado (só o Super Admin altera;
--                                começa DESLIGADO em todas as lojas)
--        wholesale_seller_sales  administrador da loja permite que vendedores
--                                vendam no Atacado (alterado pela função
--                                wholesale_set_seller_access)
--
--   2. Tabelas próprias: wholesale_suppliers, wholesale_products,
--      wholesale_customers, wholesale_sales, wholesale_sale_items,
--      wholesale_transactions.
--
--   3. Regras de acesso. Com o módulo desligado, NINGUÉM lê nem grava (nem o
--      Super Admin):
--        - administrador e super admin: tudo;
--        - vendedor (somente com wholesale_seller_sales ligado): lê produtos e
--          clientes, cadastra clientes, lê as próprias vendas e vende pela
--          função wholesale_finalize_sale;
--        - técnico: nada.
--
--   4. Venda e entrada de estoque são funções (atômicas, com trava de linha):
--        wholesale_finalize_sale     baixa o estoque, grava venda, itens e o
--                                    lançamento financeiro e atualiza o cliente;
--        wholesale_register_purchase entrada de estoque + lançamento de compra
--                                    (custo médio ponderado).
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 18.
-- ============================================================================

-- 1. CONFIGURAÇÃO DA LOJA
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS wholesale BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS wholesale_seller_sales BOOLEAN NOT NULL DEFAULT false;

-- 2. TABELAS
CREATE TABLE IF NOT EXISTS wholesale_suppliers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  phone      TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wholesale_products (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  category   TEXT,
  quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sale_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  supplier_id UUID REFERENCES wholesale_suppliers(id) ON DELETE SET NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wholesale_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  company         TEXT,
  document        TEXT,
  phone           TEXT,
  whatsapp        TEXT,
  email           TEXT,
  city            TEXT,
  state           TEXT,
  notes           TEXT,
  -- indicadores mantidos pela função de venda
  total_purchased NUMERIC(14,2) NOT NULL DEFAULT 0,
  purchases_count INTEGER NOT NULL DEFAULT 0,
  last_purchase_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wholesale_sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_number    INTEGER NOT NULL,
  customer_id    UUID REFERENCES wholesale_customers(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL,
  seller_id      UUID NOT NULL,
  seller_name    TEXT,
  subtotal       NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  discount       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total          NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  cost_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sale_number)
);

CREATE TABLE IF NOT EXISTS wholesale_sale_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_id      UUID NOT NULL REFERENCES wholesale_sales(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES wholesale_products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost    NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  unit_price   NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS wholesale_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  type        TEXT NOT NULL CHECK (type IN ('sale', 'purchase', 'expense')),
  description TEXT NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  -- custo das mercadorias vendidas (somente em type = 'sale')
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  sale_id     UUID REFERENCES wholesale_sales(id) ON DELETE SET NULL,
  product_id  UUID REFERENCES wholesale_products(id) ON DELETE SET NULL,
  created_by  UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wholesale_suppliers_tenant ON wholesale_suppliers (tenant_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_products_tenant ON wholesale_products (tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_wholesale_customers_tenant ON wholesale_customers (tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_wholesale_sales_tenant ON wholesale_sales (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wholesale_sale_items_sale ON wholesale_sale_items (sale_id);
CREATE INDEX IF NOT EXISTS idx_wholesale_transactions_tenant ON wholesale_transactions (tenant_id, occurred_at DESC);

-- 3. REGRAS DE ACESSO
-- Quem é o usuário e o que ele pode fazer no Atacado de uma loja.
--   'admin'  : administrador da loja ou super admin
--   'seller' : vendedor com permissão ligada
--   NULL     : sem acesso (inclui módulo desligado)
CREATE OR REPLACE FUNCTION wholesale_access(p_tenant_id UUID)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN NOT COALESCE((SELECT s.wholesale FROM tenant_settings s WHERE s.tenant_id = p_tenant_id), false) THEN NULL
    WHEN is_super_admin() THEN 'admin'
    WHEN get_auth_tenant_id() IS DISTINCT FROM p_tenant_id THEN NULL
    WHEN get_auth_role()::TEXT = 'admin' THEN 'admin'
    WHEN get_auth_role()::TEXT = 'seller'
      AND COALESCE((SELECT s.wholesale_seller_sales FROM tenant_settings s WHERE s.tenant_id = p_tenant_id), false)
      THEN 'seller'
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION wholesale_access(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wholesale_access(UUID) TO authenticated;

ALTER TABLE wholesale_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE wholesale_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON wholesale_suppliers, wholesale_products, wholesale_customers,
              wholesale_sales, wholesale_sale_items, wholesale_transactions FROM anon;
-- Vendas, itens e entradas de estoque só nascem pelas funções (SECURITY DEFINER)
GRANT SELECT, INSERT, UPDATE, DELETE ON wholesale_suppliers, wholesale_products, wholesale_customers TO authenticated;
GRANT SELECT ON wholesale_sales, wholesale_sale_items TO authenticated;
GRANT SELECT, INSERT, DELETE ON wholesale_transactions TO authenticated;

-- Fornecedores: somente administrador
DROP POLICY IF EXISTS wholesale_suppliers_all ON wholesale_suppliers;
CREATE POLICY wholesale_suppliers_all ON wholesale_suppliers
  FOR ALL TO authenticated
  USING (wholesale_access(tenant_id) = 'admin')
  WITH CHECK (wholesale_access(tenant_id) = 'admin');

-- Produtos: administrador grava; vendedor só lê
DROP POLICY IF EXISTS wholesale_products_select ON wholesale_products;
CREATE POLICY wholesale_products_select ON wholesale_products
  FOR SELECT TO authenticated
  USING (wholesale_access(tenant_id) IS NOT NULL);

DROP POLICY IF EXISTS wholesale_products_write ON wholesale_products;
CREATE POLICY wholesale_products_write ON wholesale_products
  FOR ALL TO authenticated
  USING (wholesale_access(tenant_id) = 'admin')
  WITH CHECK (wholesale_access(tenant_id) = 'admin');

-- Clientes: vendedor lê e cadastra; só o administrador altera e exclui
DROP POLICY IF EXISTS wholesale_customers_select ON wholesale_customers;
CREATE POLICY wholesale_customers_select ON wholesale_customers
  FOR SELECT TO authenticated
  USING (wholesale_access(tenant_id) IS NOT NULL);

DROP POLICY IF EXISTS wholesale_customers_insert ON wholesale_customers;
CREATE POLICY wholesale_customers_insert ON wholesale_customers
  FOR INSERT TO authenticated
  WITH CHECK (
    wholesale_access(tenant_id) IS NOT NULL
    -- os indicadores nascem zerados: só a função de venda os altera
    AND total_purchased = 0 AND purchases_count = 0 AND last_purchase_at IS NULL
  );

DROP POLICY IF EXISTS wholesale_customers_update ON wholesale_customers;
CREATE POLICY wholesale_customers_update ON wholesale_customers
  FOR UPDATE TO authenticated
  USING (wholesale_access(tenant_id) = 'admin')
  WITH CHECK (wholesale_access(tenant_id) = 'admin');

DROP POLICY IF EXISTS wholesale_customers_delete ON wholesale_customers;
CREATE POLICY wholesale_customers_delete ON wholesale_customers
  FOR DELETE TO authenticated
  USING (wholesale_access(tenant_id) = 'admin');

-- Vendas e itens: administrador lê tudo; vendedor lê só as próprias
DROP POLICY IF EXISTS wholesale_sales_select ON wholesale_sales;
CREATE POLICY wholesale_sales_select ON wholesale_sales
  FOR SELECT TO authenticated
  USING (
    wholesale_access(tenant_id) = 'admin'
    OR (wholesale_access(tenant_id) = 'seller' AND seller_id = auth.uid())
  );

DROP POLICY IF EXISTS wholesale_sale_items_select ON wholesale_sale_items;
CREATE POLICY wholesale_sale_items_select ON wholesale_sale_items
  FOR SELECT TO authenticated
  USING (
    wholesale_access(tenant_id) = 'admin'
    OR (wholesale_access(tenant_id) = 'seller'
        AND EXISTS (SELECT 1 FROM wholesale_sales s WHERE s.id = sale_id AND s.seller_id = auth.uid()))
  );

-- Financeiro: somente administrador; direto só a despesa (compra e venda vêm das funções)
DROP POLICY IF EXISTS wholesale_transactions_select ON wholesale_transactions;
CREATE POLICY wholesale_transactions_select ON wholesale_transactions
  FOR SELECT TO authenticated
  USING (wholesale_access(tenant_id) = 'admin');

DROP POLICY IF EXISTS wholesale_transactions_insert ON wholesale_transactions;
CREATE POLICY wholesale_transactions_insert ON wholesale_transactions
  FOR INSERT TO authenticated
  WITH CHECK (wholesale_access(tenant_id) = 'admin' AND type = 'expense' AND cost = 0);

DROP POLICY IF EXISTS wholesale_transactions_delete ON wholesale_transactions;
CREATE POLICY wholesale_transactions_delete ON wholesale_transactions
  FOR DELETE TO authenticated
  USING (wholesale_access(tenant_id) = 'admin' AND type = 'expense');

-- 4. FUNÇÕES
-- Resolve a loja de quem chama. Só o super admin pode informar outra loja.
CREATE OR REPLACE FUNCTION wholesale_resolve_tenant(p_tenant_id UUID)
RETURNS UUID AS $$
DECLARE
  v_tenant UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Faça login para continuar.' USING ERRCODE = '42501';
  END IF;
  IF is_super_admin() THEN
    v_tenant := p_tenant_id;
  ELSE
    v_tenant := get_auth_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'Operação de outra loja não é permitida.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Loja não identificada.' USING ERRCODE = '22023';
  END IF;
  RETURN v_tenant;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION wholesale_resolve_tenant(UUID) FROM PUBLIC, anon, authenticated;

-- Venda do Atacado.
-- p_items: [{ "product_id": "...", "quantity": 3, "unit_price": 100.00 }]  (unit_price opcional)
CREATE OR REPLACE FUNCTION wholesale_finalize_sale(
  p_tenant_id      UUID,
  p_customer_id    UUID,
  p_items          JSONB,
  p_discount       NUMERIC,
  p_payment_method TEXT,
  p_notes          TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_tenant    UUID := wholesale_resolve_tenant(p_tenant_id);
  v_customer  wholesale_customers%ROWTYPE;
  v_product   wholesale_products%ROWTYPE;
  v_item      JSONB;
  v_product_id UUID;
  v_qty       INTEGER;
  v_price     NUMERIC(12,2);
  v_subtotal  NUMERIC(12,2) := 0;
  v_cost      NUMERIC(12,2) := 0;
  v_discount  NUMERIC(12,2) := COALESCE(p_discount, 0);
  v_total     NUMERIC(12,2);
  v_number    INTEGER;
  v_sale_id   UUID := gen_random_uuid();
  v_seller    TEXT;
BEGIN
  IF wholesale_access(v_tenant) IS NULL THEN
    RAISE EXCEPTION 'Este usuário não pode vender no Atacado.' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um produto.' USING ERRCODE = '22023';
  END IF;
  IF p_payment_method IS NULL OR btrim(p_payment_method) = '' THEN
    RAISE EXCEPTION 'Informe a forma de pagamento.' USING ERRCODE = '22023';
  END IF;
  IF v_discount < 0 THEN
    RAISE EXCEPTION 'Desconto inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_customer FROM wholesale_customers WHERE id = p_customer_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente do Atacado não encontrado.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('wholesale_sale:' || v_tenant::TEXT));
  SELECT COALESCE(MAX(sale_number), 0) + 1 INTO v_number FROM wholesale_sales WHERE tenant_id = v_tenant;
  SELECT full_name INTO v_seller FROM profiles WHERE id = auth.uid();

  INSERT INTO wholesale_sales (id, tenant_id, sale_number, customer_id, customer_name, seller_id, seller_name,
                               subtotal, discount, total, cost_total, payment_method, notes)
  VALUES (v_sale_id, v_tenant, v_number, v_customer.id, v_customer.name, auth.uid(), v_seller,
          0, 0, 0, 0, btrim(p_payment_method), NULLIF(btrim(COALESCE(p_notes, '')), ''));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty := (v_item->>'quantity')::INTEGER;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_product FROM wholesale_products
    WHERE id = v_product_id AND tenant_id = v_tenant FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Produto do Atacado não encontrado.' USING ERRCODE = '22023';
    END IF;
    IF v_product.quantity < v_qty THEN
      RAISE EXCEPTION 'Estoque insuficiente de "%": disponível %, pedido %.', v_product.name, v_product.quantity, v_qty
        USING ERRCODE = '22023';
    END IF;

    v_price := COALESCE((v_item->>'unit_price')::NUMERIC, v_product.sale_price);
    IF v_price < 0 THEN
      RAISE EXCEPTION 'Preço inválido.' USING ERRCODE = '22023';
    END IF;

    UPDATE wholesale_products SET quantity = quantity - v_qty, updated_at = now() WHERE id = v_product.id;
    INSERT INTO wholesale_sale_items (tenant_id, sale_id, product_id, product_name, quantity, unit_cost, unit_price)
    VALUES (v_tenant, v_sale_id, v_product.id, v_product.name, v_qty, v_product.cost_price, v_price);

    v_subtotal := v_subtotal + v_price * v_qty;
    v_cost := v_cost + v_product.cost_price * v_qty;
  END LOOP;

  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'O desconto não pode ser maior que o total da venda.' USING ERRCODE = '22023';
  END IF;
  v_total := v_subtotal - v_discount;

  UPDATE wholesale_sales SET subtotal = v_subtotal, discount = v_discount, total = v_total, cost_total = v_cost
  WHERE id = v_sale_id;

  INSERT INTO wholesale_transactions (tenant_id, type, description, amount, cost, sale_id, created_by)
  VALUES (v_tenant, 'sale', 'Venda #' || v_number || ' — ' || v_customer.name, v_total, v_cost, v_sale_id, auth.uid());

  UPDATE wholesale_customers
  SET total_purchased = total_purchased + v_total,
      purchases_count = purchases_count + 1,
      last_purchase_at = now(),
      updated_at = now()
  WHERE id = v_customer.id;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION wholesale_finalize_sale(UUID, UUID, JSONB, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wholesale_finalize_sale(UUID, UUID, JSONB, NUMERIC, TEXT, TEXT) TO authenticated;

-- Entrada de estoque (compra): soma a quantidade, recalcula o custo médio e lança a compra.
CREATE OR REPLACE FUNCTION wholesale_register_purchase(
  p_tenant_id   UUID,
  p_product_id  UUID,
  p_quantity    INTEGER,
  p_unit_cost   NUMERIC,
  p_notes       TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_tenant  UUID := wholesale_resolve_tenant(p_tenant_id);
  v_product wholesale_products%ROWTYPE;
  v_new_cost NUMERIC(12,2);
BEGIN
  IF wholesale_access(v_tenant) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Somente o administrador registra entrada de estoque.' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Quantidade ou custo inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product FROM wholesale_products WHERE id = p_product_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto do Atacado não encontrado.' USING ERRCODE = '22023';
  END IF;

  v_new_cost := round((v_product.quantity * v_product.cost_price + p_quantity * p_unit_cost)
                      / (v_product.quantity + p_quantity), 2);

  UPDATE wholesale_products
  SET quantity = quantity + p_quantity, cost_price = v_new_cost, updated_at = now()
  WHERE id = v_product.id;

  INSERT INTO wholesale_transactions (tenant_id, type, description, amount, product_id, created_by)
  VALUES (v_tenant, 'purchase',
          'Compra: ' || p_quantity || ' × ' || v_product.name
            || COALESCE(' — ' || NULLIF(btrim(COALESCE(p_notes, '')), ''), ''),
          round(p_quantity * p_unit_cost, 2), v_product.id, auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION wholesale_register_purchase(UUID, UUID, INTEGER, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wholesale_register_purchase(UUID, UUID, INTEGER, NUMERIC, TEXT) TO authenticated;

-- O administrador da loja decide se os vendedores vendem no Atacado.
-- (Contratar o módulo continua sendo exclusivo do Super Admin, pela coluna wholesale.)
CREATE OR REPLACE FUNCTION wholesale_set_seller_access(p_tenant_id UUID, p_enabled BOOLEAN)
RETURNS VOID AS $$
DECLARE
  v_tenant UUID := wholesale_resolve_tenant(p_tenant_id);
BEGIN
  IF wholesale_access(v_tenant) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Somente o administrador da loja altera esta permissão.' USING ERRCODE = '42501';
  END IF;
  UPDATE tenant_settings SET wholesale_seller_sales = COALESCE(p_enabled, false), updated_at = now()
  WHERE tenant_id = v_tenant;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION wholesale_set_seller_access(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION wholesale_set_seller_access(UUID, BOOLEAN) TO authenticated;

-- Conferência: deve devolver 24 linhas —
--   2 colunas de tenant_settings, 6 tabelas, 12 regras, 4 funções (wholesale_access,
--   wholesale_finalize_sale, wholesale_register_purchase, wholesale_set_seller_access).
SELECT 'coluna' AS tipo, column_name::TEXT AS nome FROM information_schema.columns
WHERE table_name = 'tenant_settings' AND column_name IN ('wholesale', 'wholesale_seller_sales')
UNION ALL
SELECT 'tabela', table_name::TEXT FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'wholesale\_%'
UNION ALL
SELECT 'regra', policyname::TEXT FROM pg_policies WHERE tablename LIKE 'wholesale\_%'
UNION ALL
SELECT 'função', p.proname::TEXT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('wholesale_access', 'wholesale_finalize_sale', 'wholesale_register_purchase', 'wholesale_set_seller_access')
ORDER BY 1, 2;
