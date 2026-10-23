-- ============================================================================
-- CONTROLPHONE — RESET GERAL DA LOJA COM CICLOS OPERACIONAIS E ARQUIVAMENTO PAGO
-- Rodar à mão no SQL Editor. Seguro rodar mais de uma vez.
-- Pré-requisitos: migrations 01 a 26 (usa as funções de backup da migration 20).
--
-- 1. CICLOS: cada loja tem um ciclo operacional ativo (tenant_cycles). O reset
--    encerra o ciclo atual e abre o próximo (Ciclo 1 → 2 → 3...). A loja nunca
--    é excluída, suspensa nem recriada.
--
-- 2. O QUE ZERA: todos os dados operacionais da loja — estoque (aparelhos,
--    acessórios, brindes), compras de fornecedor, vendas, upgrades, garantias,
--    trocas e devoluções, créditos, assistência, despesas, movimentações,
--    clientes, fornecedores e o módulo Atacado.
--    O QUE FICA: cadastro e identidade da loja, plano, usuários e permissões,
--    configurações, modelos de documentos, textos dos comprovantes, metas
--    configuradas, numeração (nenhum número de venda é reutilizado), histórico
--    de atividades, backups e os registros deste módulo.
--
-- 3. COMPROVANTES E GARANTIAS (sempre, pague ou não): antes de zerar, cada venda
--    vira um registro em preserved_sale_documents com tudo o que o sistema usa
--    para gerar de novo o comprovante e as garantias dela (venda, cliente,
--    vendedor, aparelhos e garantias). Os PDFs são gerados a partir desses dados;
--    nada fica em vendas ativas nem entra nos indicadores. Leitura: administrador
--    da loja e Super Admin.
--
-- 4. ARQUIVAMENTO PAGO: com um pedido de arquivamento PAGO (tenant_archive_orders),
--    o ciclo encerrado é guardado inteiro em tenant_cycle_archives (somente
--    leitura, consultado pela área "Históricos Arquivados"). O pagamento só vale
--    quando registrado no banco pelo Super Admin com a referência do recebimento;
--    não existe aprovação pela tela. Sem pagamento, os dados operacionais do ciclo
--    são descartados (fica só o backup de segurança, visível apenas ao Super Admin
--    e sujeito à retenção dos backups).
--
-- 5. SEGURANÇA: só o Super Admin executa (conferido aqui). Um reset por loja de
--    cada vez; nome da loja conferido; pedido de arquivamento usado uma única vez;
--    mesmo pedido de reset (p_request_id) nunca roda duas vezes; tudo numa única
--    transação (arquivar, preservar, zerar e trocar o ciclo): se qualquer etapa
--    falhar, nada muda e a falha fica registrada em tenant_reset_runs.
--    Depois de um reset, o banco recusa dados do ciclo encerrado enviados por um
--    aparelho que ainda tinha a cópia antiga (gatilho trg_cycle_guard).
--
-- ATENÇÃO: se a migration 20 (backups) for rodada de novo depois desta, rode esta
-- de novo também (ela tira as tabelas de ciclos e documentos preservados do backup).
-- ============================================================================

-- 1. TABELAS ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tenant_cycles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number           INTEGER NOT NULL CHECK (number >= 1),
  status           TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  archive_status   TEXT NOT NULL DEFAULT 'none' CHECK (archive_status IN ('none', 'archived', 'not_archived')),
  summary          JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_by        UUID,
  closed_by_name   TEXT,
  UNIQUE (tenant_id, number)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_cycles_one_active ON tenant_cycles (tenant_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS tenant_cycle_archives (
  cycle_id     UUID PRIMARY KEY REFERENCES tenant_cycles(id) ON DELETE CASCADE,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payload      JSONB NOT NULL,
  counts       JSONB NOT NULL DEFAULT '{}'::jsonb,
  size_bytes   BIGINT NOT NULL DEFAULT 0,
  verified_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_archive_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status          TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'refused', 'used')),
  payment_reference TEXT,
  refusal_reason  TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_by    UUID,
  confirmed_at    TIMESTAMPTZ,
  used_at         TIMESTAMPTZ,
  used_by_run     UUID
);
-- um pedido em aberto (aguardando ou pago e ainda não usado) por loja: evita cobrança duplicada
CREATE UNIQUE INDEX IF NOT EXISTS idx_archive_orders_open ON tenant_archive_orders (tenant_id) WHERE status IN ('pending', 'paid');

CREATE TABLE IF NOT EXISTS tenant_reset_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id       UUID,
  mode             TEXT,
  status           TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'denied')),
  user_id          UUID,
  user_name        TEXT,
  closed_cycle_id  UUID,
  closed_cycle_number INTEGER,
  new_cycle_id     UUID,
  new_cycle_number INTEGER,
  archive_order_id UUID,
  payment_status   TEXT,
  archive_status   TEXT,
  preserved_documents INTEGER,
  counts           JSONB NOT NULL DEFAULT '{}'::jsonb,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reset_runs_request ON tenant_reset_runs (request_id) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_reset_runs_tenant ON tenant_reset_runs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS preserved_sale_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cycle_id       UUID REFERENCES tenant_cycles(id) ON DELETE SET NULL,
  cycle_number   INTEGER,
  sale_id        TEXT NOT NULL,
  sale_number    INTEGER,
  sale_date      TIMESTAMPTZ,
  sale_status    TEXT,
  customer_name  TEXT,
  products       TEXT,
  imeis          TEXT[] NOT NULL DEFAULT '{}',
  warranties     JSONB NOT NULL DEFAULT '[]'::jsonb,
  store_name     TEXT,
  payload        JSONB NOT NULL,
  preserved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sale_id)
);
CREATE INDEX IF NOT EXISTS idx_preserved_docs_tenant ON preserved_sale_documents (tenant_id, sale_number DESC);

CREATE TABLE IF NOT EXISTS platform_config (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

-- 2. ACESSO (RLS) ---------------------------------------------------------------
ALTER TABLE tenant_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_cycle_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_archive_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_reset_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE preserved_sale_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tenant_cycles, tenant_cycle_archives, tenant_archive_orders, tenant_reset_runs,
  preserved_sale_documents, platform_config FROM anon, authenticated;
-- só leitura pela API; toda gravação passa pelas funções abaixo
GRANT SELECT ON tenant_cycles, tenant_archive_orders, tenant_reset_runs, preserved_sale_documents, platform_config TO authenticated;

-- administrador da loja (dele) ou Super Admin
CREATE OR REPLACE FUNCTION cycle_reader(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT is_super_admin() OR (get_auth_role()::TEXT = 'admin' AND get_auth_tenant_id() = p_tenant_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION cycle_reader(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cycle_reader(UUID) TO authenticated;

DROP POLICY IF EXISTS tenant_cycles_read ON tenant_cycles;
CREATE POLICY tenant_cycles_read ON tenant_cycles FOR SELECT TO authenticated USING (cycle_reader(tenant_id));
DROP POLICY IF EXISTS archive_orders_read ON tenant_archive_orders;
CREATE POLICY archive_orders_read ON tenant_archive_orders FOR SELECT TO authenticated USING (cycle_reader(tenant_id));
DROP POLICY IF EXISTS reset_runs_read ON tenant_reset_runs;
CREATE POLICY reset_runs_read ON tenant_reset_runs FOR SELECT TO authenticated USING (is_super_admin());
DROP POLICY IF EXISTS preserved_docs_read ON preserved_sale_documents;
CREATE POLICY preserved_docs_read ON preserved_sale_documents FOR SELECT TO authenticated USING (cycle_reader(tenant_id));
DROP POLICY IF EXISTS platform_config_read ON platform_config;
CREATE POLICY platform_config_read ON platform_config FOR SELECT TO authenticated USING (true);
-- tenant_cycle_archives: sem regra de propósito; o conteúdo só sai por get_cycle_archive()

-- 3. BACKUP: as tabelas deste módulo não entram em backup nem em restauração ----
CREATE OR REPLACE FUNCTION backup_table_plan()
RETURNS JSONB AS $$
DECLARE
  v_all      TEXT[];
  v_done     TEXT[] := '{}';
  v_next     TEXT[];
  v_deferred JSONB := '[]'::jsonb;
  v_break    JSONB;
BEGIN
  SELECT COALESCE(array_agg(c.table_name::TEXT ORDER BY c.table_name), '{}') INTO v_all
  FROM information_schema.columns c
  JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
  WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id' AND t.table_type = 'BASE TABLE'
    AND c.table_name NOT IN ('tenant_backups', 'profiles', 'audit_logs',
      -- ciclos operacionais (migration 27): não entram em backup nem em restauração
      'tenant_cycles', 'tenant_cycle_archives', 'tenant_reset_runs', 'tenant_archive_orders', 'preserved_sale_documents');

  LOOP
    EXIT WHEN cardinality(v_done) = cardinality(v_all);

    -- referências ainda pendentes entre tabelas da loja (fora as já adiadas)
    WITH RECURSIVE edges AS (
      SELECT child.relname::TEXT AS child, parent.relname::TEXT AS parent, a.attname::TEXT AS col,
             (cardinality(k.conkey) = 1 AND NOT a.attnotnull) AS can_defer
      FROM pg_constraint k
      JOIN pg_class child ON child.oid = k.conrelid
      JOIN pg_class parent ON parent.oid = k.confrelid
      JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
      WHERE k.contype = 'f'
        AND child.relnamespace = 'public'::regnamespace AND parent.relnamespace = 'public'::regnamespace
        AND child.relname <> parent.relname
        AND child.relname = ANY (v_all) AND parent.relname = ANY (v_all)
        AND child.relname <> ALL (v_done) AND parent.relname <> ALL (v_done)
        AND NOT v_deferred @> jsonb_build_array(jsonb_build_object('table', child.relname, 'column', a.attname))
    ),
    reach AS (
      SELECT child AS src, parent AS dst FROM edges
      UNION
      SELECT r.src, e.parent FROM reach r JOIN edges e ON e.child = r.dst
    )
    SELECT
      (SELECT array_agg(t ORDER BY t) FROM unnest(v_all) t
       WHERE t <> ALL (v_done) AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.child = t)),
      (SELECT jsonb_build_object('table', e.child, 'column', e.col) FROM edges e
       WHERE e.can_defer AND EXISTS (SELECT 1 FROM reach r WHERE r.src = e.parent AND r.dst = e.child)
       ORDER BY e.child, e.col LIMIT 1)
    INTO v_next, v_break;

    IF v_next IS NOT NULL THEN
      v_done := v_done || v_next;
    ELSIF v_break IS NOT NULL THEN
      v_deferred := v_deferred || v_break;
    ELSE
      RAISE EXCEPTION 'Não foi possível ordenar as tabelas da loja (referência circular obrigatória).';
    END IF;
  END LOOP;

  RETURN jsonb_build_object('order', to_jsonb(v_done), 'deferred', v_deferred);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- 4. APOIO ------------------------------------------------------------------------

-- Tabelas da loja que o reset NÃO zera (cadastro, aparência, documentos, numeração, suporte)
CREATE OR REPLACE FUNCTION reset_kept_tables()
RETURNS TEXT[] AS $$
  SELECT ARRAY['tenant_counters', 'tenant_documents', 'tenant_settings', 'tenant_themes',
               'tenant_internal_notes', 'support_sessions', 'document_templates'];
$$ LANGUAGE sql IMMUTABLE;

-- Tipos de tenant_records que o reset NÃO zera: histórico de atividades, textos dos comprovantes, metas configuradas
CREATE OR REPLACE FUNCTION reset_kept_kinds()
RETURNS TEXT[] AS $$
  SELECT ARRAY['auditLogs', 'documentTexts', 'goals'];
$$ LANGUAGE sql IMMUTABLE;

-- Tabelas operacionais (zeradas no reset), na ordem de gravação
CREATE OR REPLACE FUNCTION reset_operational_tables()
RETURNS TEXT[] AS $$
  SELECT COALESCE(array_agg(t ORDER BY pos), '{}')
  FROM unnest(backup_table_order()) WITH ORDINALITY AS x(t, pos)
  WHERE t <> ALL (reset_kept_tables());
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION reset_kept_tables(), reset_kept_kinds(), reset_operational_tables() FROM PUBLIC, anon, authenticated;

-- Histórico de atividades da loja gravado pelo servidor
CREATE OR REPLACE FUNCTION reset_log(p_tenant_id UUID, p_action TEXT, p_record_id TEXT, p_details JSONB)
RETURNS VOID AS $$
DECLARE
  v_id   TEXT := 'log-reset-' || gen_random_uuid()::TEXT;
  v_user profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM profiles WHERE id = auth.uid();
  INSERT INTO tenant_records (tenant_id, kind, id, data)
  VALUES (p_tenant_id, 'auditLogs', v_id, jsonb_build_object(
    'id', v_id, 'tenant_id', p_tenant_id::TEXT, 'user_id', v_user.id::TEXT,
    'user_email', v_user.email::TEXT, 'user_role', v_user.role::TEXT,
    'action', p_action, 'module', 'Reset da Loja', 'record_id', p_record_id,
    'details', COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('responsavel', v_user.full_name::TEXT),
    'created_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION reset_log(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION reset_require_super_admin()
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_super_admin() THEN
    RAISE EXCEPTION 'Somente o Super Administrador da plataforma pode fazer isto.' USING ERRCODE = '42501';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION reset_require_super_admin() FROM PUBLIC, anon, authenticated;

-- Ciclo ativo da loja; a loja que nunca foi reiniciada ganha o Ciclo 1 (desde a criação dela)
CREATE OR REPLACE FUNCTION reset_ensure_cycle(p_tenant_id UUID)
RETURNS tenant_cycles AS $$
DECLARE
  v_cycle tenant_cycles%ROWTYPE;
BEGIN
  SELECT * INTO v_cycle FROM tenant_cycles WHERE tenant_id = p_tenant_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO tenant_cycles (tenant_id, number, status, started_at)
    SELECT p_tenant_id, COALESCE(MAX(number), 0) + 1, 'active',
           COALESCE((SELECT created_at FROM tenants WHERE id = p_tenant_id), now())
    FROM tenant_cycles WHERE tenant_id = p_tenant_id
    RETURNING * INTO v_cycle;
  END IF;
  RETURN v_cycle;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION reset_ensure_cycle(UUID) FROM PUBLIC, anon, authenticated;

-- Números do ciclo (somente vendas concluídas; canceladas e excluídas não contam)
CREATE OR REPLACE FUNCTION reset_cycle_summary(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v JSONB;
BEGIN
  SELECT jsonb_build_object(
    'sales', COUNT(*) FILTER (WHERE data->>'status' = 'completed'),
    'cancelled_sales', COUNT(*) FILTER (WHERE data->>'status' = 'cancelled'),
    'revenue', COALESCE(SUM((data->>'total_amount')::NUMERIC + COALESCE((data->>'card_interest')::NUMERIC, 0))
                 FILTER (WHERE data->>'status' = 'completed'), 0),
    'gross_profit', COALESCE(SUM((data->>'gross_profit')::NUMERIC) FILTER (WHERE data->>'status' = 'completed'), 0)
  ) INTO v
  FROM tenant_records WHERE tenant_id = p_tenant_id AND kind = 'sales';

  RETURN v || jsonb_build_object(
    'devices_sold', (
      SELECT COUNT(*) FROM tenant_records r, jsonb_array_elements(COALESCE(r.data->'items', '[]'::jsonb)) it
      WHERE r.tenant_id = p_tenant_id AND r.kind = 'sales' AND r.data->>'status' = 'completed'
        AND it->>'item_type' = 'device' AND it->>'returned_at' IS NULL),
    'expenses', (
      SELECT COALESCE(SUM((data->>'amount')::NUMERIC), 0) FROM tenant_records
      WHERE tenant_id = p_tenant_id AND kind = 'expenses'),
    'devices', (SELECT COUNT(*) FROM devices WHERE tenant_id = p_tenant_id),
    'devices_available', (SELECT COUNT(*) FROM devices WHERE tenant_id = p_tenant_id AND status = 'available'),
    'accessory_units', (SELECT COALESCE(SUM(quantity), 0) FROM accessories WHERE tenant_id = p_tenant_id),
    'customers', (SELECT COUNT(*) FROM customers WHERE tenant_id = p_tenant_id),
    'suppliers', (SELECT COUNT(*) FROM suppliers WHERE tenant_id = p_tenant_id)
  ) || jsonb_build_object('result', (v->>'gross_profit')::NUMERIC - (
      SELECT COALESCE(SUM((data->>'amount')::NUMERIC), 0) FROM tenant_records
      WHERE tenant_id = p_tenant_id AND kind = 'expenses'));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION reset_cycle_summary(UUID) FROM PUBLIC, anon, authenticated;

-- 5. GUARDA DO CICLO --------------------------------------------------------------
-- Depois de um reset, registro operacional criado antes do início do ciclo ativo é recusado:
-- é dado do ciclo encerrado reenviado por um aparelho que ainda tinha a cópia antiga.
-- (2 minutos de folga para diferença de relógio; o aplicativo também confere o ciclo antes de enviar.)
CREATE OR REPLACE FUNCTION cycle_guard()
RETURNS TRIGGER AS $$
DECLARE
  v_start   TIMESTAMPTZ;
  v_created TIMESTAMPTZ;
BEGIN
  IF TG_TABLE_NAME = 'tenant_records' THEN
    IF NEW.kind = ANY (reset_kept_kinds()) THEN RETURN NEW; END IF;
    BEGIN
      v_created := (NEW.data->>'created_at')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      v_created := NULL;
    END;
  ELSE
    BEGIN
      v_created := (to_jsonb(NEW)->>'created_at')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
      v_created := NULL;
    END;
  END IF;
  IF v_created IS NULL THEN RETURN NEW; END IF;

  SELECT started_at INTO v_start FROM tenant_cycles
  WHERE tenant_id = NEW.tenant_id AND status = 'active' AND number > 1;
  IF v_start IS NOT NULL AND v_created < v_start - INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'CICLO_ENCERRADO: este registro pertence a um ciclo operacional encerrado da loja.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION cycle_guard() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY reset_operational_tables() LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'created_at')
       OR v_table = 'tenant_records' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_cycle_guard ON public.%I', v_table);
      EXECUTE format('CREATE TRIGGER trg_cycle_guard BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION cycle_guard()', v_table);
    END IF;
  END LOOP;
END $$;

-- 6. CICLO ATIVO (qualquer usuário da loja: o aplicativo descarta a cópia de um ciclo encerrado)
CREATE OR REPLACE FUNCTION my_active_cycle(p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_tenant UUID := CASE WHEN is_super_admin() THEN COALESCE(p_tenant_id, get_auth_tenant_id()) ELSE get_auth_tenant_id() END;
  v_cycle  tenant_cycles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_tenant IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_cycle FROM tenant_cycles WHERE tenant_id = v_tenant AND status = 'active';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', v_cycle.id, 'number', v_cycle.number, 'started_at', v_cycle.started_at);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE ALL ON FUNCTION my_active_cycle(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION my_active_cycle(UUID) TO authenticated;

-- 7. PREÇO E PEDIDO DE ARQUIVAMENTO (Super Admin) -----------------------------------
CREATE OR REPLACE FUNCTION set_archive_price(p_amount NUMERIC)
RETURNS JSONB AS $$
BEGIN
  PERFORM reset_require_super_admin();
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO platform_config (key, value, updated_at, updated_by)
  VALUES ('archive_price', jsonb_build_object('amount', ROUND(p_amount, 2)), now(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = auth.uid();
  RETURN jsonb_build_object('ok', TRUE, 'amount', ROUND(p_amount, 2));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION create_archive_order(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_price NUMERIC;
  v_id    UUID;
BEGIN
  PERFORM reset_require_super_admin();
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Loja não encontrada.' USING ERRCODE = '22023';
  END IF;
  SELECT (value->>'amount')::NUMERIC INTO v_price FROM platform_config WHERE key = 'archive_price';
  IF v_price IS NULL OR v_price <= 0 THEN
    RAISE EXCEPTION 'Defina antes o valor do arquivamento.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    INSERT INTO tenant_archive_orders (tenant_id, amount, status, created_by)
    VALUES (p_tenant_id, v_price, 'pending', auth.uid()) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta loja já tem um pedido de arquivamento em aberto.' USING ERRCODE = '23505';
  END;
  PERFORM reset_log(p_tenant_id, 'ARQUIVAMENTO_PEDIDO', v_id::TEXT, jsonb_build_object('valor', v_price));
  RETURN jsonb_build_object('ok', TRUE, 'id', v_id, 'amount', v_price);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Pagamento recebido fora do sistema (PIX, transferência): registrado pelo Super Admin com a
-- referência do comprovante. É a única forma de um pedido valer como pago.
CREATE OR REPLACE FUNCTION confirm_archive_payment(p_order_id UUID, p_reference TEXT)
RETURNS JSONB AS $$
DECLARE
  v_order tenant_archive_orders%ROWTYPE;
BEGIN
  PERFORM reset_require_super_admin();
  IF length(btrim(COALESCE(p_reference, ''))) < 4 THEN
    RAISE EXCEPTION 'Informe a referência do pagamento recebido (ex.: identificador do PIX).' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM tenant_archive_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = '22023'; END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Este pedido não está aguardando pagamento.' USING ERRCODE = '22023';
  END IF;
  UPDATE tenant_archive_orders
  SET status = 'paid', payment_reference = left(btrim(p_reference), 200), confirmed_by = auth.uid(), confirmed_at = now()
  WHERE id = p_order_id;
  PERFORM reset_log(v_order.tenant_id, 'ARQUIVAMENTO_PAGO', p_order_id::TEXT,
    jsonb_build_object('valor', v_order.amount, 'referencia', left(btrim(p_reference), 200)));
  RETURN jsonb_build_object('ok', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION refuse_archive_order(p_order_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
  v_order tenant_archive_orders%ROWTYPE;
BEGIN
  PERFORM reset_require_super_admin();
  SELECT * INTO v_order FROM tenant_archive_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = '22023'; END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Somente pedido aguardando pagamento pode ser recusado.' USING ERRCODE = '22023';
  END IF;
  UPDATE tenant_archive_orders SET status = 'refused', refusal_reason = left(btrim(COALESCE(p_reason, '')), 300)
  WHERE id = p_order_id;
  PERFORM reset_log(v_order.tenant_id, 'ARQUIVAMENTO_RECUSADO', p_order_id::TEXT, jsonb_build_object('motivo', p_reason));
  RETURN jsonb_build_object('ok', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. RESUMO ANTES DO RESET (Super Admin) -------------------------------------------
CREATE OR REPLACE FUNCTION tenant_reset_preview(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_cycle  tenant_cycles%ROWTYPE;
  v_order  tenant_archive_orders%ROWTYPE;
BEGIN
  PERFORM reset_require_super_admin();
  SELECT * INTO v_cycle FROM tenant_cycles WHERE tenant_id = p_tenant_id AND status = 'active';
  SELECT * INTO v_order FROM tenant_archive_orders WHERE tenant_id = p_tenant_id AND status IN ('pending', 'paid')
  ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object(
    'cycle_number', COALESCE(v_cycle.number, 1),
    'cycle_started_at', COALESCE(v_cycle.started_at, (SELECT created_at FROM tenants WHERE id = p_tenant_id)),
    'summary', reset_cycle_summary(p_tenant_id),
    'documents_to_preserve', (SELECT COUNT(*) FROM tenant_records WHERE tenant_id = p_tenant_id AND kind = 'sales'
                              AND data->>'deleted_at' IS NULL AND data->>'purged_at' IS NULL),
    'archive_price', (SELECT (value->>'amount')::NUMERIC FROM platform_config WHERE key = 'archive_price'),
    'open_order', CASE WHEN v_order.id IS NULL THEN NULL ELSE to_jsonb(v_order) END
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 9. RESET ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reset_tenant_cycle(
  p_tenant_id UUID, p_mode TEXT, p_confirm_name TEXT, p_request_id UUID,
  p_order_id UUID DEFAULT NULL, p_simulate_failure TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_tenant     tenants%ROWTYPE;
  v_user       profiles%ROWTYPE;
  v_done       tenant_reset_runs%ROWTYPE;
  v_order      tenant_archive_orders%ROWTYPE;
  v_cycle      tenant_cycles%ROWTYPE;
  v_new        tenant_cycles%ROWTYPE;
  v_summary    JSONB;
  v_payload    JSONB;
  v_counts     JSONB;
  v_preserved  INTEGER := 0;
  v_plan       JSONB;
  v_def        JSONB;
  v_tables     TEXT[];
  v_table      TEXT;
  v_n          BIGINT;
  v_run        UUID := gen_random_uuid();
  v_err        TEXT;
  i            INT;
BEGIN
  SELECT * INTO v_user FROM profiles WHERE id = auth.uid();
  SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Loja não encontrada.');
  END IF;

  -- tentativa sem permissão também fica registrada
  IF auth.uid() IS NULL OR NOT is_super_admin() THEN
    INSERT INTO tenant_reset_runs (id, tenant_id, request_id, mode, status, user_id, user_name, error)
    VALUES (v_run, p_tenant_id, p_request_id, p_mode, 'denied', auth.uid(), v_user.full_name,
            'Somente o Super Administrador da plataforma pode reiniciar uma loja.');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Somente o Super Administrador da plataforma pode reiniciar uma loja.');
  END IF;
  IF p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Pedido de reset sem identificação.');
  END IF;

  -- um reset por loja de cada vez; o mesmo pedido nunca roda duas vezes
  PERFORM pg_advisory_xact_lock(hashtext('controlphone-reset:' || p_tenant_id::TEXT));
  SELECT * INTO v_done FROM tenant_reset_runs WHERE request_id = p_request_id AND status = 'completed';
  IF FOUND THEN
    RETURN jsonb_build_object('ok', TRUE, 'already', TRUE, 'run_id', v_done.id,
      'new_cycle_number', v_done.new_cycle_number, 'preserved_documents', v_done.preserved_documents,
      'archive_status', v_done.archive_status);
  END IF;

  BEGIN
    IF p_mode NOT IN ('archive', 'no_archive') THEN
      RAISE EXCEPTION 'Escolha arquivar os históricos ou reiniciar sem arquivar.';
    END IF;
    IF btrim(COALESCE(p_confirm_name, '')) <> btrim(v_tenant.trade_name) THEN
      RAISE EXCEPTION 'O nome digitado não confere com o nome da loja.';
    END IF;

    IF p_mode = 'archive' THEN
      SELECT * INTO v_order FROM tenant_archive_orders WHERE id = p_order_id FOR UPDATE;
      IF NOT FOUND OR v_order.tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'Pedido de arquivamento não encontrado para esta loja.';
      END IF;
      IF v_order.status <> 'paid' THEN
        RAISE EXCEPTION 'O pagamento do arquivamento não está confirmado (situação: %). O reset com arquivamento não foi executado.', v_order.status;
      END IF;
    END IF;

    v_cycle := reset_ensure_cycle(p_tenant_id);
    v_summary := reset_cycle_summary(p_tenant_id);

    -- backup de segurança do estado atual (só o Super Admin vê; segue a retenção dos backups)
    PERFORM backup_perform(p_tenant_id, 'pre_restore');

    -- a) comprovantes e garantias: preservados sempre, com o que é preciso para gerar os PDFs de novo
    INSERT INTO preserved_sale_documents (tenant_id, cycle_id, cycle_number, sale_id, sale_number, sale_date, sale_status,
      customer_name, products, imeis, warranties, store_name, payload)
    SELECT p_tenant_id, v_cycle.id, v_cycle.number, r.id,
      NULLIF(r.data->>'sale_number', '')::INTEGER,
      (r.data->>'created_at')::TIMESTAMPTZ,
      r.data->>'status',
      c.name,
      (SELECT string_agg(btrim(COALESCE(it->'device_info'->>'brand', '') || ' ' || COALESCE(it->'device_info'->>'model', '') || ' ' ||
                               COALESCE(it->'device_info'->>'storage_capacity', '')), ', ')
         FROM jsonb_array_elements(COALESCE(r.data->'items', '[]'::jsonb)) it WHERE it->>'item_type' = 'device'),
      COALESCE((SELECT array_agg(it->'device_info'->>'imei') FROM jsonb_array_elements(COALESCE(r.data->'items', '[]'::jsonb)) it
                WHERE it->>'item_type' = 'device' AND it->'device_info'->>'imei' IS NOT NULL), '{}'),
      COALESCE((SELECT jsonb_agg(jsonb_build_object('imei', w.data->>'imei', 'days', w.data->'warranty_days',
                  'start', w.data->>'start_date', 'end', w.data->>'end_date', 'status', w.data->>'status'))
                FROM tenant_records w WHERE w.tenant_id = p_tenant_id AND w.kind = 'warranties' AND w.data->>'sale_id' = r.id), '[]'::jsonb)
        || CASE WHEN r.data ? 'apple_warranty' THEN jsonb_build_array(jsonb_build_object('type', 'apple', 'version', r.data->'apple_warranty'->>'version')) ELSE '[]'::jsonb END,
      v_tenant.trade_name,
      jsonb_build_object(
        'sale', r.data,
        'customer', to_jsonb(c),
        'seller_name', s.full_name,
        'warranties', COALESCE((SELECT jsonb_agg(w.data) FROM tenant_records w
                                WHERE w.tenant_id = p_tenant_id AND w.kind = 'warranties' AND w.data->>'sale_id' = r.id), '[]'::jsonb),
        'devices', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM devices d
                             WHERE d.tenant_id = p_tenant_id AND (d.id::TEXT IN (
                               SELECT it->>'device_id' FROM jsonb_array_elements(COALESCE(r.data->'items', '[]'::jsonb)) it)
                               OR d.id::TEXT = (SELECT t.data->>'received_device_id' FROM tenant_records t
                                                WHERE t.tenant_id = p_tenant_id AND t.kind = 'tradeIns' AND t.id = r.data->>'trade_in_id'))), '[]'::jsonb),
        'accessories', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM accessories a
                                 WHERE a.tenant_id = p_tenant_id AND a.id::TEXT IN (
                                   SELECT it->>'accessory_id' FROM jsonb_array_elements(COALESCE(r.data->'items', '[]'::jsonb)) it)), '[]'::jsonb),
        'gifts', COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM gifts g
                           WHERE g.tenant_id = p_tenant_id AND g.id::TEXT IN (
                             SELECT x->>'gift_id' FROM jsonb_array_elements(COALESCE(r.data->'gifts', '[]'::jsonb)) x)), '[]'::jsonb),
        'trade_in', (SELECT t.data FROM tenant_records t
                     WHERE t.tenant_id = p_tenant_id AND t.kind = 'tradeIns' AND t.id = r.data->>'trade_in_id')
      )
    FROM tenant_records r
    LEFT JOIN customers c ON c.id::TEXT = r.data->>'customer_id' AND c.tenant_id = p_tenant_id
    LEFT JOIN profiles s ON s.id::TEXT = r.data->>'seller_id'
    WHERE r.tenant_id = p_tenant_id AND r.kind = 'sales'
      AND r.data->>'deleted_at' IS NULL AND r.data->>'purged_at' IS NULL
    ON CONFLICT (tenant_id, sale_id) DO NOTHING;
    GET DIAGNOSTICS v_preserved = ROW_COUNT;

    -- b) arquivamento pago: o ciclo inteiro, conferido tabela por tabela antes de zerar
    IF p_mode = 'archive' THEN
      v_payload := backup_build_payload(p_tenant_id, v_cycle.id, 'cycle_archive');
      v_counts := backup_counts(v_payload);
      FOREACH v_table IN ARRAY backup_table_order() LOOP
        EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE tenant_id = $1', v_table) INTO v_n USING p_tenant_id;
        IF v_n <> COALESCE(jsonb_array_length(v_payload->'tables'->v_table), 0) THEN
          RAISE EXCEPTION 'Arquivo do ciclo incompleto em % (% de % registros). O reset não foi executado.',
            v_table, COALESCE(jsonb_array_length(v_payload->'tables'->v_table), 0), v_n;
        END IF;
      END LOOP;
      IF p_simulate_failure = 'archive' THEN
        RAISE EXCEPTION 'Falha simulada no arquivamento. O reset não foi executado.';
      END IF;
      INSERT INTO tenant_cycle_archives (cycle_id, tenant_id, payload, counts, size_bytes)
      VALUES (v_cycle.id, p_tenant_id, v_payload, v_counts, octet_length(v_payload::TEXT));
    END IF;

    -- c) zera os dados operacionais (referências circulares esvaziadas antes, como na restauração)
    v_tables := reset_operational_tables();
    v_plan := backup_table_plan();
    FOR v_def IN SELECT * FROM jsonb_array_elements(v_plan->'deferred') LOOP
      IF (v_def->>'table') = ANY (v_tables) THEN
        EXECUTE format('UPDATE public.%I SET %I = NULL WHERE tenant_id = $1 AND %I IS NOT NULL',
                       v_def->>'table', v_def->>'column', v_def->>'column') USING p_tenant_id;
      END IF;
    END LOOP;
    FOR i IN REVERSE cardinality(v_tables)..1 LOOP
      v_table := v_tables[i];
      IF v_table = 'tenant_records' THEN
        DELETE FROM tenant_records WHERE tenant_id = p_tenant_id AND kind <> ALL (reset_kept_kinds());
      ELSE
        EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1', v_table) USING p_tenant_id;
      END IF;
    END LOOP;
    IF p_simulate_failure = 'delete' THEN
      RAISE EXCEPTION 'Falha simulada ao zerar os dados. Nada foi alterado.';
    END IF;

    -- d) troca de ciclo
    UPDATE tenant_cycles SET status = 'closed', ended_at = clock_timestamp(),
      archive_status = CASE WHEN p_mode = 'archive' THEN 'archived' ELSE 'not_archived' END,
      summary = v_summary || jsonb_build_object('preserved_documents', v_preserved),
      closed_by = auth.uid(), closed_by_name = v_user.full_name
    WHERE id = v_cycle.id;
    INSERT INTO tenant_cycles (tenant_id, number, status, started_at)
    VALUES (p_tenant_id, v_cycle.number + 1, 'active', clock_timestamp())
    RETURNING * INTO v_new;

    IF p_mode = 'archive' THEN
      UPDATE tenant_archive_orders SET status = 'used', used_at = now(), used_by_run = v_run WHERE id = v_order.id;
    END IF;

    INSERT INTO tenant_reset_runs (id, tenant_id, request_id, mode, status, user_id, user_name,
      closed_cycle_id, closed_cycle_number, new_cycle_id, new_cycle_number, archive_order_id,
      payment_status, archive_status, preserved_documents, counts)
    VALUES (v_run, p_tenant_id, p_request_id, p_mode, 'completed', auth.uid(), v_user.full_name,
      v_cycle.id, v_cycle.number, v_new.id, v_new.number, v_order.id,
      CASE WHEN p_mode = 'archive' THEN 'paid' ELSE NULL END,
      CASE WHEN p_mode = 'archive' THEN 'archived' ELSE 'not_archived' END,
      v_preserved, v_summary);

    PERFORM reset_log(p_tenant_id, 'LOJA_REINICIADA', v_run::TEXT, jsonb_build_object(
      'ciclo_encerrado', v_cycle.number, 'novo_ciclo', v_new.number,
      'modalidade', CASE WHEN p_mode = 'archive' THEN 'com arquivamento' ELSE 'sem arquivamento' END,
      'documentos_preservados', v_preserved));

    RETURN jsonb_build_object('ok', TRUE, 'run_id', v_run, 'closed_cycle_number', v_cycle.number,
      'new_cycle_number', v_new.number, 'new_cycle_id', v_new.id, 'preserved_documents', v_preserved,
      'archive_status', CASE WHEN p_mode = 'archive' THEN 'archived' ELSE 'not_archived' END, 'summary', v_summary);
  EXCEPTION WHEN OTHERS THEN
    -- tudo o que foi feito acima é desfeito; a falha fica registrada
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    INSERT INTO tenant_reset_runs (id, tenant_id, request_id, mode, status, user_id, user_name,
      archive_order_id, payment_status, error)
    VALUES (v_run, p_tenant_id, p_request_id, p_mode, 'failed', auth.uid(), v_user.full_name,
      p_order_id, (SELECT status FROM tenant_archive_orders WHERE id = p_order_id), v_err);
    RETURN jsonb_build_object('ok', FALSE, 'error', v_err, 'run_id', v_run);
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '300s';

-- 10. HISTÓRICOS ARQUIVADOS (administrador da loja e Super Admin, somente leitura) ----
CREATE OR REPLACE FUNCTION get_cycle_archive(p_cycle_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_cycle tenant_cycles%ROWTYPE;
  v_arch  tenant_cycle_archives%ROWTYPE;
BEGIN
  SELECT * INTO v_cycle FROM tenant_cycles WHERE id = p_cycle_id;
  IF NOT FOUND OR NOT cycle_reader(v_cycle.tenant_id) THEN
    RAISE EXCEPTION 'Histórico não encontrado.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_arch FROM tenant_cycle_archives WHERE cycle_id = p_cycle_id;
  IF NOT FOUND OR v_cycle.archive_status <> 'archived' THEN
    RAISE EXCEPTION 'Este ciclo não teve arquivamento contratado.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'cycle', to_jsonb(v_cycle),
    'tables', (v_arch.payload->'tables') - 'tenants' - 'profiles'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION set_archive_price(NUMERIC), create_archive_order(UUID), confirm_archive_payment(UUID, TEXT),
  refuse_archive_order(UUID, TEXT), tenant_reset_preview(UUID),
  reset_tenant_cycle(UUID, TEXT, TEXT, UUID, UUID, TEXT), get_cycle_archive(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_archive_price(NUMERIC), create_archive_order(UUID), confirm_archive_payment(UUID, TEXT),
  refuse_archive_order(UUID, TEXT), tenant_reset_preview(UUID),
  reset_tenant_cycle(UUID, TEXT, TEXT, UUID, UUID, TEXT), get_cycle_archive(UUID) TO authenticated;

-- Conferência: deve devolver 1 linha com as 5 colunas = true
SELECT
  to_regclass('public.tenant_cycles') IS NOT NULL AS ciclos,
  to_regclass('public.preserved_sale_documents') IS NOT NULL AS documentos_preservados,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reset_tenant_cycle') AS funcao_reset,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cycle_guard') AS guarda_do_ciclo,
  NOT ('tenant_cycles' = ANY (backup_table_order())) AS fora_do_backup;
