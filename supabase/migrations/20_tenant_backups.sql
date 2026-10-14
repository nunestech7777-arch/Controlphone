-- ============================================================================
-- CONTROLPHONE — BACKUP E RESTAURAÇÃO POR LOJA (EXCLUSIVO SUPER ADMIN)
--
--   1. Cada backup pertence a UMA loja. tenant_backups guarda a ficha (data,
--      tipo, tamanho, situação) e tenant_backup_payloads guarda o conteúdo.
--      O conteúdo nunca é lido direto pela API: só pelas funções abaixo.
--
--   2. O que entra no backup: TODAS as tabelas que têm a coluna tenant_id
--      (descobertas na hora, então um módulo novo entra sozinho), mais o
--      cadastro da loja (tenants) e os usuários (profiles). Sempre filtrado
--      pela loja pedida.
--
--   3. Restauração (restore_tenant_backup), tudo em uma única transação:
--        - recusa arquivo inválido ou de outra loja;
--        - antes de mexer, guarda um backup de segurança do estado atual
--          (tipo pre_restore), para a restauração poder ser desfeita;
--        - apaga e regrava os dados da loja, forçando o tenant_id da loja em
--          cada linha (um arquivo adulterado não alcança outra loja);
--        - histórico de atividades NUNCA é apagado: o do backup é somado;
--        - situação e plano da loja NÃO voltam ao passado (são da plataforma);
--        - usuários: nome, perfil, telefone e situação voltam ao que eram;
--          logins e senhas não mudam, ninguém é criado nem excluído.
--
--   4. Backup automático a cada 4 dias por loja (backup_run_due, agendada no
--      pg_cron a cada 10 minutos, 10 lojas por vez). Ficam os 30 automáticos
--      mais recentes de cada loja; os manuais nunca são apagados sozinhos.
--
--   5. Criar, baixar, restaurar e excluir entram no histórico de atividades
--      da loja (tenant_records, tipo auditLogs), gravados pelo servidor.
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 19.
-- ============================================================================

-- 1. TABELAS
CREATE TABLE IF NOT EXISTS tenant_backups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('manual', 'automatic', 'pre_restore')),
  status          TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
  size_bytes      BIGINT NOT NULL DEFAULT 0,
  counts          JSONB NOT NULL DEFAULT '{}'::jsonb,
  error           TEXT,
  created_by      UUID,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_backup_payloads (
  backup_id UUID PRIMARY KEY REFERENCES tenant_backups(id) ON DELETE CASCADE,
  payload   JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_backups_tenant ON tenant_backups (tenant_id, created_at DESC);

ALTER TABLE tenant_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_backup_payloads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON tenant_backups, tenant_backup_payloads FROM anon, authenticated;
GRANT SELECT ON tenant_backups TO authenticated;

-- A ficha é só do Super Admin. O conteúdo não tem regra de propósito: ninguém lê pela API.
DROP POLICY IF EXISTS tenant_backups_super_admin_select ON tenant_backups;
CREATE POLICY tenant_backups_super_admin_select ON tenant_backups
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- 2. APOIO
CREATE OR REPLACE FUNCTION backup_require_super_admin()
RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT is_super_admin() THEN
    RAISE EXCEPTION 'Apenas o Super Administrador gerencia backups.' USING ERRCODE = '42501';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Tabelas da loja (as que têm tenant_id), na ordem em que podem ser gravadas:
-- quem é referenciada vem antes de quem referencia. Para apagar, usa-se a ordem inversa.
-- Ficam de fora: os próprios backups, usuários e histórico (tratados à parte).
--
-- Quando duas tabelas se referenciam (vendas <-> upgrades), não existe ordem possível.
-- Nesse caso uma das colunas opcionais do ciclo vai para "deferred": na restauração ela
-- é gravada vazia e preenchida no final, depois que as duas tabelas já existem.
--
-- Devolve { "order": ["tabela", ...], "deferred": [{ "table": "...", "column": "..." }] }
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
    AND c.table_name NOT IN ('tenant_backups', 'profiles', 'audit_logs');

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

CREATE OR REPLACE FUNCTION backup_table_order()
RETURNS TEXT[] AS $$
  SELECT COALESCE(array_agg(t ORDER BY pos), '{}')
  FROM jsonb_array_elements_text(backup_table_plan()->'order') WITH ORDINALITY AS x(t, pos);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Resumo mostrado antes de restaurar (o aplicativo calcula o mesmo a partir do arquivo)
CREATE OR REPLACE FUNCTION backup_counts(p_payload JSONB)
RETURNS JSONB AS $$
  WITH t AS (SELECT COALESCE(p_payload->'tables', '{}'::jsonb) AS tables),
  len AS (
    SELECT key, CASE WHEN jsonb_typeof(value) = 'array' THEN jsonb_array_length(value) ELSE 0 END AS n
    FROM t, jsonb_each(t.tables)
  ),
  docs AS (
    SELECT r->>'kind' AS kind, count(*)::INT AS n
    FROM t, jsonb_array_elements(
      CASE WHEN jsonb_typeof(t.tables->'tenant_records') = 'array' THEN t.tables->'tenant_records' ELSE '[]'::jsonb END
    ) r
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'customers',      COALESCE((SELECT n FROM len WHERE key = 'customers'), 0),
    'products',       COALESCE((SELECT sum(n)::INT FROM len WHERE key IN ('devices', 'accessories', 'gifts')), 0),
    'sales',          COALESCE((SELECT n FROM docs WHERE kind = 'sales'), 0) + COALESCE((SELECT n FROM len WHERE key = 'sales'), 0),
    'service_orders', COALESCE((SELECT n FROM docs WHERE kind = 'serviceOrders'), 0) + COALESCE((SELECT n FROM len WHERE key = 'service_orders'), 0),
    'warranties',     COALESCE((SELECT n FROM docs WHERE kind = 'warranties'), 0) + COALESCE((SELECT n FROM len WHERE key = 'warranties'), 0),
    'users',          COALESCE((SELECT n FROM len WHERE key = 'profiles'), 0),
    'financial',      COALESCE((SELECT n FROM docs WHERE kind = 'expenses'), 0) + COALESCE((SELECT n FROM len WHERE key = 'expenses'), 0)
  );
$$ LANGUAGE sql IMMUTABLE;

-- Registro no histórico de atividades da loja. Rotina automática (p_system) ou chamada sem
-- usuário logado fica em nome do sistema, mesmo quando foi o painel do Super Admin que a disparou.
CREATE OR REPLACE FUNCTION backup_log(p_tenant_id UUID, p_action TEXT, p_record_id TEXT, p_details JSONB, p_system BOOLEAN DEFAULT false)
RETURNS VOID AS $$
DECLARE
  v_id   TEXT := 'log-backup-' || gen_random_uuid()::TEXT;
  v_user profiles%ROWTYPE;
BEGIN
  IF NOT p_system THEN
    SELECT * INTO v_user FROM profiles WHERE id = auth.uid();
  END IF;
  INSERT INTO tenant_records (tenant_id, kind, id, data)
  VALUES (p_tenant_id, 'auditLogs', v_id, jsonb_build_object(
    'id', v_id,
    'tenant_id', p_tenant_id::TEXT,
    'user_id', v_user.id::TEXT,
    'user_email', COALESCE(v_user.email::TEXT, 'sistema'),
    'user_role', COALESCE(v_user.role::TEXT, 'system'),
    'action', p_action,
    'module', 'Backup',
    'record_id', p_record_id,
    'details', COALESCE(p_details, '{}'::jsonb)
      || jsonb_build_object('responsavel', COALESCE(v_user.full_name::TEXT, 'Sistema (automático)')),
    'created_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. GERAR O BACKUP
-- Conteúdo completo da loja. Toda consulta filtra por p_tenant_id.
CREATE OR REPLACE FUNCTION backup_build_payload(p_tenant_id UUID, p_backup_id UUID, p_type TEXT)
RETURNS JSONB AS $$
DECLARE
  v_tenant tenants%ROWTYPE;
  v_tables JSONB := '{}'::jsonb;
  v_rows   JSONB;
  v_table  TEXT;
BEGIN
  SELECT * INTO v_tenant FROM tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loja não encontrada.' USING ERRCODE = '22023';
  END IF;

  v_tables := jsonb_build_object(
    'tenants', jsonb_build_array(to_jsonb(v_tenant)),
    'profiles', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at), '[]'::jsonb) FROM profiles p WHERE p.tenant_id = p_tenant_id)
  );

  FOREACH v_table IN ARRAY backup_table_order() || ARRAY['audit_logs'] LOOP
    EXECUTE format('SELECT COALESCE(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) FROM public.%I x WHERE x.tenant_id = $1', v_table)
      INTO v_rows USING p_tenant_id;
    v_tables := v_tables || jsonb_build_object(v_table, v_rows);
  END LOOP;

  RETURN jsonb_build_object(
    'format', 'controlphone-backup',
    'version', 1,
    'backup_id', p_backup_id,
    'tenant_id', p_tenant_id,
    'tenant_name', v_tenant.trade_name,
    'type', p_type,
    'created_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'tables', v_tables
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Gera e guarda o backup. Uso interno: quem chama já conferiu a permissão.
CREATE OR REPLACE FUNCTION backup_perform(p_tenant_id UUID, p_type TEXT)
RETURNS UUID AS $$
DECLARE
  v_id      UUID := gen_random_uuid();
  v_payload JSONB;
  v_counts  JSONB;
  v_user    UUID;
  v_name    TEXT;
BEGIN
  -- uma operação de backup por loja de cada vez
  PERFORM pg_advisory_xact_lock(hashtext('controlphone-backup:' || p_tenant_id::TEXT));

  v_payload := backup_build_payload(p_tenant_id, v_id, p_type);
  v_counts := backup_counts(v_payload);
  v_payload := v_payload || jsonb_build_object('counts', v_counts);
  IF p_type <> 'automatic' THEN
    SELECT id, full_name INTO v_user, v_name FROM profiles WHERE id = auth.uid();
  END IF;

  INSERT INTO tenant_backups (id, tenant_id, type, status, size_bytes, counts, created_by, created_by_name)
  VALUES (v_id, p_tenant_id, p_type, 'completed', octet_length(v_payload::TEXT), v_counts,
          v_user, COALESCE(v_name, 'Sistema (automático)'));
  INSERT INTO tenant_backup_payloads (backup_id, payload) VALUES (v_id, v_payload);

  PERFORM backup_log(p_tenant_id,
    CASE p_type WHEN 'automatic' THEN 'BACKUP_AUTOMATICO' WHEN 'pre_restore' THEN 'BACKUP_DE_SEGURANCA' ELSE 'BACKUP_CRIADO' END,
    v_id::TEXT,
    jsonb_build_object('tipo', p_type, 'tamanho_bytes', octet_length(v_payload::TEXT)),
    p_type = 'automatic');

  -- Retenção: 30 automáticos e 5 de segurança por loja. Manuais nunca saem sozinhos.
  DELETE FROM tenant_backups b
  WHERE b.tenant_id = p_tenant_id AND b.status = 'completed' AND b.type IN ('automatic', 'pre_restore')
    AND b.id IN (
      SELECT id FROM (
        SELECT id, type, row_number() OVER (PARTITION BY type ORDER BY created_at DESC, id) AS pos
        FROM tenant_backups
        WHERE tenant_id = p_tenant_id AND status = 'completed' AND type IN ('automatic', 'pre_restore')
      ) ranked
      WHERE (type = 'automatic' AND pos > 30) OR (type = 'pre_restore' AND pos > 5)
    );
  DELETE FROM tenant_backups
  WHERE tenant_id = p_tenant_id AND status = 'failed' AND created_at < now() - INTERVAL '30 days';

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '180s';

CREATE OR REPLACE FUNCTION create_tenant_backup(p_tenant_id UUID)
RETURNS UUID AS $$
BEGIN
  PERFORM backup_require_super_admin();
  RETURN backup_perform(p_tenant_id, 'manual');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '180s';

-- Conteúdo de um backup, para baixar
CREATE OR REPLACE FUNCTION get_tenant_backup(p_backup_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_backup  tenant_backups%ROWTYPE;
  v_payload JSONB;
BEGIN
  PERFORM backup_require_super_admin();
  SELECT * INTO v_backup FROM tenant_backups WHERE id = p_backup_id AND status = 'completed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Backup não encontrado.' USING ERRCODE = '22023';
  END IF;
  SELECT payload INTO v_payload FROM tenant_backup_payloads WHERE backup_id = p_backup_id;
  PERFORM backup_log(v_backup.tenant_id, 'BACKUP_BAIXADO', p_backup_id::TEXT,
    jsonb_build_object('tipo', v_backup.type, 'backup_de', v_backup.created_at));
  RETURN v_payload;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '180s';

CREATE OR REPLACE FUNCTION delete_tenant_backup(p_backup_id UUID)
RETURNS VOID AS $$
DECLARE
  v_backup tenant_backups%ROWTYPE;
BEGIN
  PERFORM backup_require_super_admin();
  SELECT * INTO v_backup FROM tenant_backups WHERE id = p_backup_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Backup não encontrado.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM tenant_backups WHERE id = p_backup_id;
  PERFORM backup_log(v_backup.tenant_id, 'BACKUP_EXCLUIDO', p_backup_id::TEXT,
    jsonb_build_object('tipo', v_backup.type, 'backup_de', v_backup.created_at));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. RESTAURAR
-- Informe p_backup_id (backup guardado no servidor) OU p_payload (conteúdo de um arquivo baixado).
CREATE OR REPLACE FUNCTION restore_tenant_backup(p_tenant_id UUID, p_backup_id UUID DEFAULT NULL, p_payload JSONB DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_payload  JSONB := p_payload;
  v_tables   JSONB;
  v_order    TEXT[];
  v_table    TEXT;
  v_rows     JSONB;
  v_cols     TEXT;
  v_where    TEXT;
  v_safety   UUID;
  v_skipped  TEXT[] := '{}';
  v_notes    TEXT[] := '{}';
  v_users_missing INT := 0;
  v_plan     JSONB;
  v_def      JSONB;
  v_nulls    JSONB;
  i          INT;
BEGIN
  PERFORM backup_require_super_admin();
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'Loja não encontrada.' USING ERRCODE = '22023';
  END IF;

  IF p_backup_id IS NOT NULL THEN
    SELECT p.payload INTO v_payload
    FROM tenant_backups b JOIN tenant_backup_payloads p ON p.backup_id = b.id
    WHERE b.id = p_backup_id AND b.status = 'completed';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Backup não encontrado.' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Validação: arquivo do Controlphone, de versão conhecida e DESTA loja
  IF v_payload IS NULL OR jsonb_typeof(v_payload) <> 'object'
     OR v_payload->>'format' IS DISTINCT FROM 'controlphone-backup'
     OR jsonb_typeof(v_payload->'tables') IS DISTINCT FROM 'object'
     OR COALESCE(v_payload->>'tenant_id', '') !~ '^[0-9a-fA-F-]{36}$' THEN
    RAISE EXCEPTION 'Arquivo de backup inválido.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_payload->>'version', '') <> '1' THEN
    RAISE EXCEPTION 'Este backup foi gerado por uma versão mais nova do sistema e não pode ser restaurado aqui.' USING ERRCODE = '22023';
  END IF;
  IF (v_payload->>'tenant_id')::UUID <> p_tenant_id THEN
    RAISE EXCEPTION 'Este backup pertence a outra loja (%). A restauração foi bloqueada.',
      COALESCE(v_payload->>'tenant_name', 'loja desconhecida') USING ERRCODE = '42501';
  END IF;
  v_tables := v_payload->'tables';

  -- Estado atual guardado antes de qualquer alteração (some junto se a restauração falhar)
  v_safety := backup_perform(p_tenant_id, 'pre_restore');

  v_plan := backup_table_plan();
  SELECT COALESCE(array_agg(t ORDER BY pos), '{}') INTO v_order
  FROM jsonb_array_elements_text(v_plan->'order') WITH ORDINALITY AS x(t, pos);

  -- Colunas de referência circular: esvaziadas antes de apagar, preenchidas no fim (4.2b)
  FOR v_def IN SELECT * FROM jsonb_array_elements(v_plan->'deferred') LOOP
    IF v_tables ? (v_def->>'table') THEN
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE tenant_id = $1 AND %I IS NOT NULL',
                     v_def->>'table', v_def->>'column', v_def->>'column') USING p_tenant_id;
    END IF;
  END LOOP;

  -- 4.1 Apaga os dados atuais, de quem referencia para quem é referenciada.
  --     Tabela que o backup não conhece (módulo criado depois dele) fica como está.
  FOR i IN REVERSE cardinality(v_order)..1 LOOP
    v_table := v_order[i];
    IF NOT (v_tables ? v_table) THEN
      v_skipped := v_skipped || v_table;
      CONTINUE;
    END IF;
    v_where := CASE WHEN v_table = 'tenant_records' THEN ' AND kind <> ''auditLogs''' ELSE '' END;
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1%s', v_table, v_where) USING p_tenant_id;
  END LOOP;

  -- 4.2 Regrava o conteúdo do backup. Só entram tabelas da lista (nada fora dela é tocado) e
  --     só as colunas que existem hoje; o tenant_id de cada linha é sempre o desta loja.
  FOREACH v_table IN ARRAY v_order LOOP
    v_rows := v_tables->v_table;
    IF v_rows IS NULL OR jsonb_typeof(v_rows) <> 'array' OR jsonb_array_length(v_rows) = 0 THEN
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = v_table
      AND c.is_generated = 'NEVER' AND c.identity_generation IS DISTINCT FROM 'ALWAYS'
      AND (v_rows->0) ? c.column_name;
    IF v_cols IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(jsonb_object_agg(d->>'column', NULL::TEXT), '{}'::jsonb) INTO v_nulls
    FROM jsonb_array_elements(v_plan->'deferred') d WHERE d->>'table' = v_table;

    SELECT jsonb_agg(r || jsonb_build_object('tenant_id', p_tenant_id) || v_nulls) INTO v_rows
    FROM jsonb_array_elements(v_rows) r;

    -- linhas criadas por gatilho durante a regravação de outra tabela não podem duplicar o backup
    v_where := CASE WHEN v_table = 'tenant_records' THEN ' AND kind <> ''auditLogs''' ELSE '' END;
    EXECUTE format('DELETE FROM public.%I WHERE tenant_id = $1%s', v_table, v_where) USING p_tenant_id;

    EXECUTE format(
      'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)%s',
      v_table, v_cols, v_cols, v_table,
      CASE WHEN v_table = 'tenant_records' THEN ' ON CONFLICT DO NOTHING' ELSE '' END
    ) USING v_rows;
  END LOOP;

  -- 4.2b Preenche as colunas de referência circular, agora que as duas pontas existem
  FOR v_def IN SELECT * FROM jsonb_array_elements(v_plan->'deferred') LOOP
    v_rows := v_tables->(v_def->>'table');
    IF v_rows IS NOT NULL AND jsonb_typeof(v_rows) = 'array' AND jsonb_array_length(v_rows) > 0 THEN
      EXECUTE format(
        'UPDATE public.%1$I t SET %2$I = b.%2$I FROM jsonb_populate_recordset(NULL::public.%1$I, $1) b '
        || 'WHERE t.id = b.id AND t.tenant_id = $2 AND b.%2$I IS NOT NULL',
        v_def->>'table', v_def->>'column'
      ) USING v_rows, p_tenant_id;
    END IF;
  END LOOP;

  -- 4.3 Histórico da plataforma: o do backup é somado, nada é apagado
  IF jsonb_typeof(v_tables->'audit_logs') = 'array' AND jsonb_array_length(v_tables->'audit_logs') > 0 THEN
    INSERT INTO audit_logs (id, tenant_id, user_id, user_email, user_role, action, module, record_id, details, ip_address, created_at)
    SELECT a.id, p_tenant_id, (SELECT p.id FROM profiles p WHERE p.id = a.user_id), a.user_email, a.user_role,
           a.action, a.module, a.record_id, a.details, a.ip_address, a.created_at
    FROM jsonb_populate_recordset(NULL::audit_logs, v_tables->'audit_logs') a
    WHERE a.id IS NOT NULL AND a.action IS NOT NULL AND a.module IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 4.4 Cadastro da loja. Situação e plano são da plataforma e não voltam ao passado.
  IF jsonb_typeof(v_tables->'tenants') = 'array' AND jsonb_array_length(v_tables->'tenants') = 1 THEN
    SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) INTO v_cols
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'tenants' AND c.is_generated = 'NEVER'
      AND c.column_name NOT IN ('id', 'status', 'plan', 'plan_start_date', 'plan_due_date', 'created_at', 'updated_at')
      AND (v_tables->'tenants'->0) ? c.column_name;
    IF v_cols IS NOT NULL THEN
      EXECUTE format(
        'UPDATE public.tenants t SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.tenants, $1)), updated_at = now() WHERE t.id = $2',
        v_cols, v_cols
      ) USING v_tables->'tenants'->0, p_tenant_id;
    END IF;
  END IF;

  -- 4.5 Usuários que continuam existindo voltam ao cadastro do backup (login e senha não mudam).
  --     Ninguém vira super admin por arquivo.
  IF jsonb_typeof(v_tables->'profiles') = 'array' THEN
    UPDATE profiles p
    SET full_name = COALESCE(b.full_name, p.full_name),
        role = b.role,
        phone = b.phone,
        cpf = b.cpf,
        avatar_url = b.avatar_url,
        avatar_path = b.avatar_path,
        is_active = COALESCE(b.is_active, p.is_active),
        updated_at = now()
    FROM jsonb_populate_recordset(NULL::profiles, v_tables->'profiles') b
    WHERE p.id = b.id AND p.tenant_id = p_tenant_id
      AND p.role <> 'super_admin' AND b.role IN ('admin', 'seller', 'technician');

    SELECT count(*) INTO v_users_missing
    FROM jsonb_array_elements(v_tables->'profiles') r
    WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id::TEXT = r->>'id' AND p.tenant_id = p_tenant_id);
    IF v_users_missing > 0 THEN
      v_notes := v_notes || format('%s usuário(s) do backup não existem mais e não foram recriados.', v_users_missing);
    END IF;
  END IF;

  IF cardinality(v_skipped) > 0 THEN
    v_notes := v_notes || ('Tabelas mais novas que o backup, mantidas como estavam: ' || array_to_string(v_skipped, ', ') || '.');
  END IF;

  PERFORM backup_log(p_tenant_id, 'BACKUP_RESTAURADO', COALESCE(p_backup_id::TEXT, v_payload->>'backup_id'),
    jsonb_build_object(
      'origem', CASE WHEN p_backup_id IS NOT NULL THEN 'servidor' ELSE 'arquivo' END,
      'backup_utilizado', v_payload->>'backup_id',
      'backup_de', v_payload->>'created_at',
      'tipo_do_backup', v_payload->>'type',
      'backup_de_seguranca', v_safety,
      'resumo', backup_counts(v_payload),
      'avisos', to_jsonb(v_notes)
    ));

  RETURN jsonb_build_object(
    'safety_backup_id', v_safety,
    'counts', backup_counts(v_payload),
    'notes', to_jsonb(v_notes)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '300s';

-- 5. BACKUP AUTOMÁTICO
-- Faz o backup das lojas com mais de 4 dias sem backup automático, as mais atrasadas primeiro.
-- Uma loja que falha não trava as outras e só é tentada de novo depois de 6 horas.
CREATE OR REPLACE FUNCTION backup_run_due(p_limit INTEGER DEFAULT 10)
RETURNS INTEGER AS $$
DECLARE
  v_tenant UUID;
  v_done   INTEGER := 0;
BEGIN
  -- duas execuções ao mesmo tempo fariam backup em dobro
  IF NOT pg_try_advisory_xact_lock(hashtext('controlphone-backup-run')) THEN
    RETURN 0;
  END IF;

  FOR v_tenant IN
    SELECT t.id
    FROM tenants t
    WHERE NOT EXISTS (
      SELECT 1 FROM tenant_backups b
      WHERE b.tenant_id = t.id AND b.type = 'automatic'
        AND ((b.status = 'completed' AND b.created_at > now() - INTERVAL '4 days')
          OR (b.status = 'failed' AND b.created_at > now() - INTERVAL '6 hours'))
    )
    ORDER BY (SELECT max(b.created_at) FROM tenant_backups b
              WHERE b.tenant_id = t.id AND b.type = 'automatic' AND b.status = 'completed') NULLS FIRST, t.created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 50))
  LOOP
    BEGIN
      PERFORM backup_perform(v_tenant, 'automatic');
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO tenant_backups (tenant_id, type, status, error, created_by_name)
      VALUES (v_tenant, 'automatic', 'failed', left(SQLERRM, 500), 'Sistema (automático)');
    END;
  END LOOP;
  RETURN v_done;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '300s';

-- Reforço do agendamento: o painel do Super Admin chama ao abrir a lista de lojas
CREATE OR REPLACE FUNCTION run_due_tenant_backups()
RETURNS INTEGER AS $$
BEGIN
  PERFORM backup_require_super_admin();
  RETURN backup_run_due(3);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '300s';

-- 6. INDICADORES
-- Último backup de cada loja (coluna "Status do Backup" da listagem do Super Admin)
CREATE OR REPLACE FUNCTION tenant_backup_overview()
RETURNS TABLE (tenant_id UUID, last_backup_at TIMESTAMPTZ, last_type TEXT, last_size_bytes BIGINT, backups_count BIGINT) AS $$
BEGIN
  PERFORM backup_require_super_admin();
  RETURN QUERY
  SELECT DISTINCT ON (b.tenant_id)
         b.tenant_id, b.created_at, b.type, b.size_bytes,
         count(*) OVER (PARTITION BY b.tenant_id)
  FROM tenant_backups b
  WHERE b.status = 'completed'
  ORDER BY b.tenant_id, b.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- O administrador da loja só enxerga a data do último backup da PRÓPRIA loja
CREATE OR REPLACE FUNCTION my_tenant_last_backup()
RETURNS TIMESTAMPTZ AS $$
  SELECT max(b.created_at)
  FROM tenant_backups b
  WHERE b.status = 'completed'
    AND b.tenant_id = get_auth_tenant_id()
    AND get_auth_role()::TEXT = 'admin';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 7. QUEM PODE CHAMAR O QUÊ
REVOKE ALL ON FUNCTION backup_require_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION backup_table_plan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION backup_table_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION backup_log(UUID, TEXT, TEXT, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION backup_build_payload(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION backup_perform(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION backup_run_due(INTEGER) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION create_tenant_backup(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION get_tenant_backup(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION delete_tenant_backup(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION restore_tenant_backup(UUID, UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION run_due_tenant_backups() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tenant_backup_overview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION my_tenant_last_backup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_tenant_backup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_tenant_backup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_tenant_backup(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION restore_tenant_backup(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION run_due_tenant_backups() TO authenticated;
GRANT EXECUTE ON FUNCTION tenant_backup_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION my_tenant_last_backup() TO authenticated;

-- 8. AGENDAMENTO (pg_cron). Se a extensão não puder ser ligada aqui, a migration continua
--    e o reforço do item 5 mantém os backups em dia sempre que o Super Admin abre o painel.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'controlphone-backup-automatico';
  PERFORM cron.schedule('controlphone-backup-automatico', '*/10 * * * *', 'SELECT public.backup_run_due(10)');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Agendamento automático não configurado (%). Ative a extensão pg_cron e rode esta migration de novo.', SQLERRM;
END $$;

-- Conferência: deve devolver 13 linhas —
--   2 tabelas, 1 regra, 9 funções e 1 linha "agendamento".
--   Se a linha "agendamento" disser "NÃO CONFIGURADO", ative a extensão pg_cron
--   (Database > Extensions) e rode esta migration de novo.
SELECT 'tabela' AS tipo, table_name::TEXT AS nome FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('tenant_backups', 'tenant_backup_payloads')
UNION ALL
SELECT 'regra', policyname::TEXT FROM pg_policies WHERE tablename = 'tenant_backups'
UNION ALL
SELECT 'função', p.proname::TEXT FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'create_tenant_backup', 'get_tenant_backup', 'delete_tenant_backup', 'restore_tenant_backup',
  'run_due_tenant_backups', 'tenant_backup_overview', 'my_tenant_last_backup', 'backup_run_due', 'backup_perform')
UNION ALL
SELECT 'agendamento',
       CASE WHEN to_regclass('cron.job') IS NULL THEN 'NÃO CONFIGURADO (pg_cron desligado)' ELSE 'pg_cron ligado' END
ORDER BY 1, 2;
