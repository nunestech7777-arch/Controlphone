-- ============================================================================
-- CONTROLPHONE — CADASTRO EM LOTE DE APARELHOS (Estoque > Aparelhos)
--
-- register_devices_batch(lote, loja) cadastra vários aparelhos do mesmo modelo
-- em UMA transação: ou todos entram, ou nenhum. Cada aparelho continua sendo
-- um registro próprio em devices, com IMEI, cor, bateria, custo e preço seus.
-- Junto, na mesma transação:
--   - a compra no histórico do fornecedor (supplier_purchases), uma por aparelho;
--   - a movimentação de entrada no estoque (tenant_records 'deviceMovements');
--   - um registro no histórico de atividades (tenant_records 'auditLogs').
--
-- Conferido aqui, não só na tela:
--   - só administrador da loja (ou super admin em modo suporte);
--   - IMEI com 15 dígitos, sem repetir dentro do lote nem na loja;
--   - modelo, armazenamento, cor e tipo (seminovo/lacrado) preenchidos;
--   - custo >= 0, preço > 0, bateria vazia ou entre 1 e 100;
--   - fornecedor da própria loja; data de entrada não futura.
-- Sem grade estética: nenhum campo de grade é criado ou exigido.
--
-- Reenvio (clique duplo, resposta perdida na conexão): o aplicativo manda os
-- mesmos identificadores; se o lote já entrou inteiro, a função responde
-- "já cadastrado" sem duplicar nada.
--
-- Rodar à mão no SQL Editor. Pode ser rodada mais de uma vez.
-- Pré-requisitos: migrations 01 a 24.
-- ============================================================================

CREATE OR REPLACE FUNCTION register_devices_batch(p_batch JSONB, p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_tenant   UUID;
  v_role     TEXT;
  v_user     profiles%ROWTYPE;
  v_devices  JSONB := p_batch->'devices';
  v_count    INTEGER;
  v_existing INTEGER;
  v_dups     TEXT;
  v_item     JSONB;
  v_dev      JSONB;
  v_now      TEXT := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_log      JSONB := p_batch->'log';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Faça login para cadastrar aparelhos.' USING ERRCODE = '42501';
  END IF;
  v_role := get_auth_role()::TEXT;
  IF is_super_admin() THEN
    v_tenant := p_tenant_id;
  ELSIF v_role = 'admin' THEN
    v_tenant := get_auth_tenant_id();
  END IF;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Somente o administrador da loja pode cadastrar aparelhos.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_user FROM profiles WHERE id = auth.uid();

  IF jsonb_typeof(v_devices) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Lista de aparelhos ausente.';
  END IF;
  v_count := jsonb_array_length(v_devices);
  IF v_count < 1 OR v_count > 100 THEN
    RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'O lote deve ter de 1 a 100 aparelhos.';
  END IF;

  -- um lote por vez em cada loja (clique duplo ou duas abas não cadastram em paralelo)
  PERFORM pg_advisory_xact_lock(hashtext('device-batch:' || v_tenant::TEXT));

  -- reenvio: os mesmos aparelhos já estão gravados → nada a fazer
  SELECT COUNT(*) INTO v_existing
  FROM devices d
  JOIN jsonb_array_elements(v_devices) e(item) ON d.id = (e.item->'device'->>'id')::UUID
  WHERE d.tenant_id = v_tenant AND d.imei = e.item->'device'->>'imei';
  IF v_existing = v_count THEN
    RETURN jsonb_build_object('ok', TRUE, 'already', TRUE, 'count', v_count);
  END IF;
  IF v_existing > 0 OR EXISTS (
    SELECT 1 FROM devices d JOIN jsonb_array_elements(v_devices) e(item) ON d.id = (e.item->'device'->>'id')::UUID
  ) THEN
    RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Identificador de aparelho já usado. Abra o cadastro em lote de novo.';
  END IF;

  -- validação de cada aparelho
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_devices) LOOP
    v_dev := v_item->'device';
    IF COALESCE(v_dev->>'imei', '') !~ '^[0-9]{15}$' THEN
      RAISE EXCEPTION 'IMEI_INVALIDO' USING ERRCODE = '22023', DETAIL = COALESCE(v_dev->>'imei', '');
    END IF;
    IF btrim(COALESCE(v_dev->>'brand', '')) = '' OR btrim(COALESCE(v_dev->>'model', '')) = ''
       OR btrim(COALESCE(v_dev->>'storage_capacity', '')) = '' OR btrim(COALESCE(v_dev->>'color', '')) = '' THEN
      RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Modelo, armazenamento e cor são obrigatórios (IMEI ' || (v_dev->>'imei') || ').';
    END IF;
    IF length(btrim(v_dev->>'brand')) > 100 OR length(btrim(v_dev->>'model')) > 150
       OR length(btrim(v_dev->>'storage_capacity')) > 50 OR length(btrim(v_dev->>'color')) > 50 THEN
      RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Texto longo demais em marca, modelo, armazenamento ou cor.';
    END IF;
    IF COALESCE(v_dev->>'device_type', '') NOT IN ('seminovo', 'lacrado') THEN
      RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Informe a condição: seminovo ou lacrado.';
    END IF;
    IF COALESCE(v_dev->>'origin', '') NOT IN ('purchase', 'internal_transfer') THEN
      RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Origem inválida.';
    END IF;
    IF NOT (COALESCE((v_dev->>'acquisition_cost')::NUMERIC, -1) >= 0)
       OR NOT (COALESCE((v_dev->>'suggested_price')::NUMERIC, 0) > 0) THEN
      RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Custo e preço inválidos (IMEI ' || (v_dev->>'imei') || ').';
    END IF;
    IF v_dev->>'battery_health' IS NOT NULL
       AND NOT ((v_dev->>'battery_health')::INTEGER BETWEEN 1 AND 100) THEN
      RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Saúde da bateria deve ficar entre 1% e 100% (IMEI ' || (v_dev->>'imei') || ').';
    END IF;
    IF v_dev->>'supplier_id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM suppliers s WHERE s.id = (v_dev->>'supplier_id')::UUID AND s.tenant_id = v_tenant
    ) THEN
      RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'Fornecedor não encontrado nesta loja.';
    END IF;
    IF (v_dev->>'entry_date')::TIMESTAMPTZ > now() + INTERVAL '1 day' THEN
      RAISE EXCEPTION 'LOTE_INVALIDO' USING ERRCODE = '22023', DETAIL = 'A data de entrada não pode ser futura.';
    END IF;
  END LOOP;

  -- IMEI repetido dentro do lote
  SELECT string_agg(imei, ', ') INTO v_dups FROM (
    SELECT e.item->'device'->>'imei' AS imei FROM jsonb_array_elements(v_devices) e(item)
    GROUP BY 1 HAVING COUNT(*) > 1
  ) x;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'IMEI_DUPLICADO_LOTE' USING ERRCODE = '23505', DETAIL = v_dups;
  END IF;

  -- IMEI já cadastrado na loja (qualquer situação)
  SELECT string_agg(d.imei, ', ') INTO v_dups
  FROM devices d JOIN jsonb_array_elements(v_devices) e(item) ON d.imei = e.item->'device'->>'imei'
  WHERE d.tenant_id = v_tenant;
  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION 'IMEI_JA_CADASTRADO' USING ERRCODE = '23505', DETAIL = v_dups;
  END IF;

  -- gravação (tudo na mesma transação)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_devices) LOOP
    v_dev := v_item->'device';
    INSERT INTO devices (
      id, tenant_id, imei, brand, model, storage_capacity, color, battery_health, device_type,
      physical_condition_notes, supplier_id, origin, acquisition_cost, accumulated_repair_cost,
      suggested_price, status, entry_date, created_at, updated_at
    ) VALUES (
      (v_dev->>'id')::UUID, v_tenant, v_dev->>'imei', btrim(v_dev->>'brand'), btrim(v_dev->>'model'),
      btrim(v_dev->>'storage_capacity'), btrim(v_dev->>'color'), (v_dev->>'battery_health')::INTEGER,
      v_dev->>'device_type', NULLIF(btrim(COALESCE(v_dev->>'physical_condition_notes', '')), ''),
      (v_dev->>'supplier_id')::UUID, (v_dev->>'origin')::device_origin, ROUND((v_dev->>'acquisition_cost')::NUMERIC, 2), 0,
      ROUND((v_dev->>'suggested_price')::NUMERIC, 2), 'available', (v_dev->>'entry_date')::TIMESTAMPTZ,
      (v_dev->>'created_at')::TIMESTAMPTZ, now()
    );

    IF v_item ? 'purchase' AND v_dev->>'supplier_id' IS NOT NULL THEN
      INSERT INTO supplier_purchases (
        id, tenant_id, supplier_id, item_type, item_id, description, quantity, unit_cost, total_cost, purchased_at, created_at
      ) VALUES (
        (v_item->'purchase'->>'id')::UUID, v_tenant, (v_dev->>'supplier_id')::UUID, 'device', (v_dev->>'id')::UUID,
        left(COALESCE(v_item->'purchase'->>'description', ''), 255), 1,
        ROUND((v_dev->>'acquisition_cost')::NUMERIC, 2), ROUND((v_dev->>'acquisition_cost')::NUMERIC, 2),
        (v_dev->>'entry_date')::TIMESTAMPTZ, (v_item->'purchase'->>'created_at')::TIMESTAMPTZ
      );
    END IF;

    INSERT INTO tenant_records (tenant_id, kind, id, data)
    VALUES (v_tenant, 'deviceMovements', v_item->'movement'->>'id',
      (v_item->'movement') || jsonb_build_object(
        'tenant_id', v_tenant::TEXT, 'device_id', v_dev->>'id', 'imei', v_dev->>'imei',
        'movement_type', 'stock_entry', 'to_status', 'available',
        'cost', ROUND((v_dev->>'acquisition_cost')::NUMERIC, 2),
        'user_id', auth.uid()::TEXT, 'user_name', v_user.full_name
      ));
  END LOOP;

  IF v_log IS NOT NULL THEN
    INSERT INTO tenant_records (tenant_id, kind, id, data)
    VALUES (v_tenant, 'auditLogs', v_log->>'id', v_log || jsonb_build_object(
      'tenant_id', v_tenant::TEXT, 'user_id', auth.uid()::TEXT, 'user_email', v_user.email,
      'user_role', v_user.role::TEXT, 'action', 'APARELHOS_CADASTRADOS_LOTE', 'module', 'Estoque Aparelhos'
    ));
  END IF;

  -- usado pelos testes para provar que uma falha no meio não deixa nada pela metade
  IF COALESCE((p_batch->>'simulate_failure')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'FALHA_SIMULADA' USING ERRCODE = 'P0003';
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'already', FALSE, 'count', v_count, 'created_at', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION register_devices_batch(JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_devices_batch(JSONB, UUID) TO authenticated;

-- Conferência: deve devolver 1 linha com "authenticated" = true
SELECT p.proname AS funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'register_devices_batch';
