-- ============================================================================
-- CONTROLPHONE — MÓDULOS OPERACIONAIS NO BANCO (VENDAS, ASSISTÊNCIA, FINANCEIRO...)
--
-- Vendas, upgrades, garantias, trocas e devoluções, crédito do cliente, ordens
-- de serviço, manutenções internas, movimentações de aparelho, despesas, metas
-- e histórico de atividades passam a ser gravados no banco.
--
--   1. tenant_records: cada registro do aplicativo vira um documento JSON, do
--      jeito que o aplicativo já usa, identificado por loja + tipo + id.
--      O id é texto: os registros atuais ("sale-1730000000-ab12c") não precisam
--      ser renomeados. O cálculo da venda continua no aplicativo por enquanto;
--      as tabelas normalizadas (sales, sale_items...) e as funções travadas na
--      migration 14 ficam como estão.
--
--   2. Regras de acesso por tipo e perfil, sempre dentro da própria loja:
--        - administrador e super admin: leem e gravam tudo; podem excluir
--          (usado pelos testes para limpar o que criaram), menos o histórico;
--        - vendedor: lê e grava tudo, menos despesas e histórico; metas só leitura;
--        - técnico: lê e grava ordens de serviço, manutenções internas,
--          movimentações e garantias. Nada além disso;
--        - histórico de atividades: todos inserem, só em nome próprio; só o
--          administrador lê; ninguém altera nem exclui.
--
--   3. Numeração por loja (venda, ordem de serviço e solicitação de troca):
--      contador no servidor, reservado pela função reserve_record_numbers, que
--      confere a loja de quem chama. Antes o número era "maior + 1" calculado
--      em cada navegador, e dois aparelhos podiam gerar o mesmo número.
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 16.
-- ============================================================================

-- 1. TABELA
CREATE TABLE IF NOT EXISTS tenant_records (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  kind       TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  PRIMARY KEY (tenant_id, kind, id),
  CONSTRAINT tenant_records_kind_check CHECK (kind IN (
    'sales', 'tradeIns', 'serviceOrders', 'internalRepairs', 'warranties', 'returnRequests',
    'customerCredits', 'expenses', 'goals', 'deviceMovements', 'auditLogs'
  )),
  CONSTRAINT tenant_records_id_check CHECK (char_length(id) BETWEEN 1 AND 200),
  CONSTRAINT tenant_records_data_check CHECK (jsonb_typeof(data) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_tenant_records_updated ON tenant_records (tenant_id, kind, updated_at);

-- Contador de numeração por loja e por tipo. Sem regra de acesso de propósito:
-- só é lido e alterado pelas funções abaixo.
CREATE TABLE IF NOT EXISTS tenant_counters (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  last_number INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, kind),
  CONSTRAINT tenant_counters_kind_check CHECK (kind IN ('sales', 'serviceOrders', 'returnRequests'))
);

ALTER TABLE tenant_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tenant_records FROM anon;
REVOKE ALL ON tenant_counters FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_records TO authenticated;

-- 2. O QUE CADA PERFIL PODE FAZER COM CADA TIPO (p_action: read, insert, update, delete)
CREATE OR REPLACE FUNCTION tenant_record_allowed(p_kind TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    CASE
      WHEN p_kind = 'auditLogs' THEN
        CASE p_action
          WHEN 'insert' THEN me.role IS NOT NULL
          WHEN 'read' THEN me.role IN ('admin', 'super_admin')
          ELSE FALSE
        END
      WHEN me.role IN ('admin', 'super_admin') THEN TRUE
      WHEN p_action = 'delete' THEN FALSE
      WHEN me.role = 'seller' THEN
        CASE
          WHEN p_kind = 'expenses' THEN FALSE
          WHEN p_kind = 'goals' THEN p_action = 'read'
          ELSE TRUE
        END
      WHEN me.role = 'technician' THEN
        p_kind IN ('serviceOrders', 'internalRepairs', 'deviceMovements', 'warranties')
      ELSE FALSE
    END,
    FALSE)
  FROM (SELECT public.get_auth_role()::TEXT AS role) me;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION tenant_record_allowed(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tenant_record_allowed(TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS tenant_records_select ON tenant_records;
CREATE POLICY tenant_records_select ON tenant_records
  FOR SELECT TO authenticated
  USING (
    (tenant_id = get_auth_tenant_id() OR is_super_admin())
    AND tenant_record_allowed(kind, 'read')
  );

DROP POLICY IF EXISTS tenant_records_insert ON tenant_records;
CREATE POLICY tenant_records_insert ON tenant_records
  FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = get_auth_tenant_id() OR is_super_admin())
    AND tenant_record_allowed(kind, 'insert')
    -- histórico de atividades: cada um registra só o que ele mesmo fez
    AND (kind <> 'auditLogs' OR data->>'user_id' = auth.uid()::TEXT)
  );

DROP POLICY IF EXISTS tenant_records_update ON tenant_records;
CREATE POLICY tenant_records_update ON tenant_records
  FOR UPDATE TO authenticated
  USING (
    (tenant_id = get_auth_tenant_id() OR is_super_admin())
    AND tenant_record_allowed(kind, 'update')
  )
  WITH CHECK (
    (tenant_id = get_auth_tenant_id() OR is_super_admin())
    AND tenant_record_allowed(kind, 'update')
  );

DROP POLICY IF EXISTS tenant_records_delete ON tenant_records;
CREATE POLICY tenant_records_delete ON tenant_records
  FOR DELETE TO authenticated
  USING (
    (tenant_id = get_auth_tenant_id() OR is_super_admin())
    AND tenant_record_allowed(kind, 'delete')
  );

-- 3. GATILHO: data e autor da gravação vêm do servidor (nunca do navegador); o documento
--    sempre carrega o id e a loja da linha; e o contador de numeração acompanha os números
--    que chegam (registros antigos e vendas feitas sem conexão).
CREATE OR REPLACE FUNCTION tenant_records_before_write()
RETURNS TRIGGER AS $$
DECLARE
  v_field  TEXT;
  v_number TEXT;
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  NEW.data := NEW.data || jsonb_build_object('id', NEW.id, 'tenant_id', NEW.tenant_id::TEXT);

  v_field := CASE NEW.kind
    WHEN 'sales' THEN 'sale_number'
    WHEN 'serviceOrders' THEN 'os_number'
    WHEN 'returnRequests' THEN 'request_number'
  END;
  IF v_field IS NOT NULL AND TG_OP = 'INSERT' THEN
    v_number := NEW.data->>v_field;
    IF v_number ~ '^[0-9]{1,9}$' THEN
      INSERT INTO tenant_counters AS c (tenant_id, kind, last_number)
      VALUES (NEW.tenant_id, NEW.kind, v_number::INTEGER)
      ON CONFLICT (tenant_id, kind) DO UPDATE SET last_number = EXCLUDED.last_number
      WHERE c.last_number < EXCLUDED.last_number;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION tenant_records_before_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tenant_records_before_write ON tenant_records;
CREATE TRIGGER trg_tenant_records_before_write
  BEFORE INSERT OR UPDATE ON tenant_records
  FOR EACH ROW EXECUTE FUNCTION tenant_records_before_write();

-- 4. NUMERAÇÃO: reserva os próximos números da loja de quem chama, de forma atômica.
--    A loja vem do cadastro do usuário logado (auth.uid()); o parâmetro p_tenant_id só
--    vale para o super admin, que não pertence a uma loja (modo suporte).
CREATE OR REPLACE FUNCTION reserve_record_numbers(p_kind TEXT, p_count INTEGER DEFAULT 1, p_tenant_id UUID DEFAULT NULL)
RETURNS INTEGER[] AS $$
DECLARE
  v_tenant UUID;
  v_base   INTEGER;
  v_last   INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Faça login para reservar numeração.' USING ERRCODE = '42501';
  END IF;
  v_base := CASE p_kind WHEN 'sales' THEN 1000 WHEN 'serviceOrders' THEN 500 WHEN 'returnRequests' THEN 100 END;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'Tipo de numeração desconhecido: %', p_kind USING ERRCODE = '22023';
  END IF;
  IF p_count IS NULL OR p_count < 1 OR p_count > 20 THEN
    RAISE EXCEPTION 'Quantidade de números inválida (1 a 20).' USING ERRCODE = '22023';
  END IF;

  IF is_super_admin() THEN
    v_tenant := p_tenant_id;
  ELSE
    v_tenant := get_auth_tenant_id();
    IF p_tenant_id IS NOT NULL AND p_tenant_id IS DISTINCT FROM v_tenant THEN
      RAISE EXCEPTION 'Numeração de outra loja não pode ser reservada.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_tenant IS NULL OR NOT tenant_record_allowed(p_kind, 'insert') THEN
    RAISE EXCEPTION 'Este usuário não pode reservar esta numeração.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO tenant_counters AS c (tenant_id, kind, last_number)
  VALUES (v_tenant, p_kind, v_base + p_count)
  ON CONFLICT (tenant_id, kind) DO UPDATE SET last_number = GREATEST(c.last_number, v_base) + p_count
  RETURNING c.last_number INTO v_last;

  RETURN ARRAY(SELECT generate_series(v_last - p_count + 1, v_last));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION reserve_record_numbers(TEXT, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reserve_record_numbers(TEXT, INTEGER, UUID) TO authenticated;

-- 5. Tempo real: venda ou ordem de serviço feita em um aparelho aparece nos outros
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE tenant_records; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- Conferência: deve devolver 9 linhas —
--   4 regras (tenant_records_delete, _insert, _select, _update),
--   1 gatilho (trg_tenant_records_before_write),
--   2 funções (reserve_record_numbers, tenant_record_allowed),
--   1 linha "tempo real" com tenant_records,
--   1 linha "rls sem regra" com tenant_counters.
SELECT 'regra' AS tipo, policyname::TEXT AS nome FROM pg_policies WHERE tablename = 'tenant_records'
UNION ALL
SELECT DISTINCT 'gatilho', trigger_name::TEXT FROM information_schema.triggers WHERE event_object_table = 'tenant_records'
UNION ALL
SELECT 'função', p.proname::TEXT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('reserve_record_numbers', 'tenant_record_allowed')
UNION ALL
SELECT 'tempo real', tablename::TEXT FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tenant_records'
UNION ALL
SELECT 'rls sem regra', c.relname::TEXT FROM pg_class c
WHERE c.relname = 'tenant_counters' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_counters')
ORDER BY 1, 2;
