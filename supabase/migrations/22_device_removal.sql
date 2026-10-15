-- ============================================================================
-- CONTROLPHONE — EXCLUSÃO E INATIVAÇÃO DE APARELHOS DO ESTOQUE
--
-- Para corrigir um aparelho cadastrado por engano, em uma única transação:
--
--   device_removal_check(id)   mostra o impacto e o que impede a exclusão
--                              (não altera nada).
--   delete_device(id)          exclui o aparelho, o registro de compra que o
--                              cadastro gerou automaticamente no histórico do
--                              fornecedor e a movimentação de entrada no
--                              estoque. Grava o histórico de atividades.
--                              Se qualquer etapa falhar, nada é alterado.
--   deactivate_device(id, motivo)
--                              alternativa quando há histórico a preservar:
--                              o aparelho sai do estoque disponível (não pode
--                              mais ser vendido) e nada é apagado.
--
-- O que bloqueia a exclusão (conferido aqui, não só na tela):
--   aparelho vendido, em manutenção, reservado ou aguardando avaliação;
--   aparelho recebido em upgrade; aparelho citado em venda, upgrade, ordem de
--   serviço, manutenção interna, garantia, troca/devolução ou crédito de
--   cliente; movimentação de estoque além da entrada do cadastro.
--
-- Financeiro: hoje o cadastro de um aparelho não gera despesa. O único
-- lançamento automático ligado a ele é a compra no histórico do fornecedor
-- (supplier_purchases), que não tem pagamento associado: ela sai junto com o
-- aparelho. Despesas (Financeiro/DRE) não são ligadas a aparelhos e nunca são
-- apagadas aqui; o DRE usa o custo das vendas, que não muda.
--
-- Permissão: administrador da própria loja ou super admin. A loja é conferida
-- pelo usuário logado (auth.uid()), nunca por parâmetro.
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 21.
-- Correção (15/10/2026): a lista de motivos usava "lista || texto", que o Postgres
-- recusa (malformed array literal) e fazia todo aparelho com vínculo responder com
-- erro genérico. Agora usa array_append. Basta rodar este arquivo de novo.
-- ============================================================================

-- Histórico de atividades gravado pelo servidor (mesmo formato do aplicativo)
CREATE OR REPLACE FUNCTION device_audit_log(p_tenant_id UUID, p_action TEXT, p_record_id TEXT, p_details JSONB)
RETURNS VOID AS $$
DECLARE
  v_id   TEXT := 'log-' || gen_random_uuid()::TEXT;
  v_user profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM profiles WHERE id = auth.uid();
  INSERT INTO tenant_records (tenant_id, kind, id, data)
  VALUES (p_tenant_id, 'auditLogs', v_id, jsonb_build_object(
    'id', v_id,
    'tenant_id', p_tenant_id::TEXT,
    'user_id', auth.uid()::TEXT,
    'user_email', v_user.email,
    'user_role', v_user.role::TEXT,
    'action', p_action,
    'module', 'Estoque Aparelhos',
    'record_id', p_record_id,
    'details', COALESCE(p_details, '{}'::JSONB),
    'created_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION device_audit_log(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Aparelho da loja de quem chama, já travado contra outra operação simultânea.
-- Aparelho de outra loja responde como "não encontrado" (não revela que existe).
CREATE OR REPLACE FUNCTION device_for_admin(p_device_id UUID)
RETURNS devices AS $$
DECLARE
  v_dev devices%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;
  IF NOT (is_super_admin() OR get_auth_role() = 'admin') THEN
    RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_dev FROM devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR (NOT is_super_admin() AND v_dev.tenant_id IS DISTINCT FROM get_auth_tenant_id()) THEN
    RAISE EXCEPTION 'APARELHO_NAO_ENCONTRADO' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_dev;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION device_for_admin(UUID) FROM PUBLIC, anon, authenticated;

-- O que impede a exclusão definitiva (lista vazia = pode excluir)
CREATE OR REPLACE FUNCTION device_removal_blockers(p_dev devices)
RETURNS TEXT[] AS $$
DECLARE
  v_blockers TEXT[] := '{}';
  v_id       TEXT := p_dev.id::TEXT;
  v_kind     RECORD;
BEGIN
  IF p_dev.status::TEXT = 'sold' THEN v_blockers := array_append(v_blockers, 'Aparelho vendido');
  ELSIF p_dev.status::TEXT = 'in_maintenance' THEN v_blockers := array_append(v_blockers, 'Aparelho em manutenção');
  ELSIF p_dev.status::TEXT = 'reserved' THEN v_blockers := array_append(v_blockers, 'Aparelho reservado');
  ELSIF p_dev.status::TEXT NOT IN ('available', 'decommissioned') THEN v_blockers := array_append(v_blockers, 'Aparelho aguardando avaliação');
  END IF;
  IF p_dev.origin::TEXT = 'trade_in' OR p_dev.origin_trade_in_id IS NOT NULL THEN
    v_blockers := array_append(v_blockers, 'Aparelho recebido em upgrade');
  END IF;

  -- Registros operacionais que citam o aparelho (o id é um UUID: a busca no documento é exata)
  FOR v_kind IN
    SELECT DISTINCT r.kind FROM tenant_records r
    WHERE r.tenant_id = p_dev.tenant_id
      AND r.kind IN ('sales', 'tradeIns', 'serviceOrders', 'internalRepairs', 'warranties', 'returnRequests', 'customerCredits')
      AND strpos(r.data::TEXT, v_id) > 0
  LOOP
    v_blockers := array_append(v_blockers, CASE v_kind.kind
      WHEN 'sales' THEN 'Venda vinculada'
      WHEN 'tradeIns' THEN 'Upgrade vinculado'
      WHEN 'serviceOrders' THEN 'Ordem de serviço vinculada'
      WHEN 'internalRepairs' THEN 'Manutenção vinculada'
      WHEN 'warranties' THEN 'Garantia vinculada'
      WHEN 'returnRequests' THEN 'Troca ou devolução vinculada'
      ELSE 'Crédito de cliente vinculado'
    END);
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM tenant_records r
    WHERE r.tenant_id = p_dev.tenant_id AND r.kind = 'deviceMovements'
      AND r.data->>'device_id' = v_id AND COALESCE(r.data->>'movement_type', '') <> 'stock_entry'
  ) THEN
    v_blockers := array_append(v_blockers, 'Movimentações de estoque além do cadastro');
  END IF;

  RETURN (SELECT COALESCE(array_agg(DISTINCT b), '{}') FROM unnest(v_blockers) b);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION device_removal_blockers(devices) FROM PUBLIC, anon, authenticated;

-- 1. IMPACTO (só leitura)
CREATE OR REPLACE FUNCTION device_removal_check(p_device_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_dev       devices%ROWTYPE;
  v_blockers  TEXT[];
  v_count     INTEGER;
  v_total     NUMERIC;
BEGIN
  v_dev := device_for_admin(p_device_id);
  v_blockers := device_removal_blockers(v_dev);
  SELECT COUNT(*), COALESCE(SUM(total_cost), 0) INTO v_count, v_total
  FROM supplier_purchases
  WHERE tenant_id = v_dev.tenant_id AND item_type = 'device' AND item_id = v_dev.id;

  RETURN jsonb_build_object(
    'can_delete', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'can_deactivate', v_dev.status::TEXT = 'available',
    'purchases_count', v_count,
    'purchases_total', v_total
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. EXCLUSÃO (transação única: aparelho + compra automática + entrada no estoque + histórico)
CREATE OR REPLACE FUNCTION delete_device(p_device_id UUID, p_simulate_failure BOOLEAN DEFAULT FALSE)
RETURNS JSONB AS $$
DECLARE
  v_dev        devices%ROWTYPE;
  v_blockers   TEXT[];
  v_purchases  INTEGER;
  v_total      NUMERIC;
  v_movements  INTEGER;
BEGIN
  v_dev := device_for_admin(p_device_id);
  v_blockers := device_removal_blockers(v_dev);
  IF cardinality(v_blockers) > 0 THEN
    RAISE EXCEPTION 'APARELHO_VINCULADO' USING ERRCODE = 'P0001', DETAIL = array_to_string(v_blockers, '; ');
  END IF;

  -- Compra registrada automaticamente no cadastro (histórico do fornecedor; sem pagamento associado)
  WITH gone AS (
    DELETE FROM supplier_purchases
    WHERE tenant_id = v_dev.tenant_id AND item_type = 'device' AND item_id = v_dev.id
    RETURNING total_cost
  )
  SELECT COUNT(*), COALESCE(SUM(total_cost), 0) INTO v_purchases, v_total FROM gone;

  -- Movimentação de entrada do cadastro (a única que um aparelho excluível pode ter)
  WITH gone AS (
    DELETE FROM tenant_records
    WHERE tenant_id = v_dev.tenant_id AND kind = 'deviceMovements'
      AND data->>'device_id' = v_dev.id::TEXT AND data->>'movement_type' = 'stock_entry'
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_movements FROM gone;

  DELETE FROM devices WHERE id = v_dev.id;

  PERFORM device_audit_log(v_dev.tenant_id, 'APARELHO_EXCLUIDO', v_dev.id::TEXT, jsonb_build_object(
    'aparelho', trim(v_dev.brand || ' ' || v_dev.model || ' ' || COALESCE(v_dev.storage_capacity, '')),
    'imei', v_dev.imei,
    'custo_aquisicao', v_dev.acquisition_cost,
    'compras_do_fornecedor_removidas', v_purchases,
    'valor_das_compras_removidas', v_total,
    'resultado', 'excluido'
  ));

  -- Usado pelos testes para provar que uma falha no meio não deixa nada pela metade
  IF p_simulate_failure THEN
    RAISE EXCEPTION 'FALHA_SIMULADA' USING ERRCODE = 'P0003';
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'purchases_removed', v_purchases, 'purchases_total', v_total, 'movements_removed', v_movements);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. INATIVAÇÃO (preserva tudo; só tira o aparelho do estoque disponível)
CREATE OR REPLACE FUNCTION deactivate_device(p_device_id UUID, p_reason TEXT)
RETURNS JSONB AS $$
DECLARE
  v_dev    devices%ROWTYPE;
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_mov_id TEXT := 'mov-' || gen_random_uuid()::TEXT;
  v_user   profiles%ROWTYPE;
BEGIN
  v_dev := device_for_admin(p_device_id);
  IF v_dev.status::TEXT <> 'available' THEN
    RAISE EXCEPTION 'APARELHO_INDISPONIVEL' USING ERRCODE = 'P0001';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO' USING ERRCODE = '22023';
  END IF;

  UPDATE devices SET status = 'decommissioned', updated_at = now() WHERE id = v_dev.id;

  SELECT * INTO v_user FROM profiles WHERE id = auth.uid();
  INSERT INTO tenant_records (tenant_id, kind, id, data)
  VALUES (v_dev.tenant_id, 'deviceMovements', v_mov_id, jsonb_build_object(
    'id', v_mov_id,
    'tenant_id', v_dev.tenant_id::TEXT,
    'device_id', v_dev.id::TEXT,
    'imei', v_dev.imei,
    'movement_type', 'decommissioned',
    'description', 'Aparelho inativado: retirado do estoque disponível',
    'from_status', 'available',
    'to_status', 'decommissioned',
    'notes', left(v_reason, 500),
    'user_id', auth.uid()::TEXT,
    'user_name', v_user.full_name,
    'created_at', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));

  PERFORM device_audit_log(v_dev.tenant_id, 'APARELHO_INATIVADO', v_dev.id::TEXT, jsonb_build_object(
    'aparelho', trim(v_dev.brand || ' ' || v_dev.model || ' ' || COALESCE(v_dev.storage_capacity, '')),
    'imei', v_dev.imei,
    'motivo', left(v_reason, 500),
    'resultado', 'inativado'
  ));

  RETURN jsonb_build_object('ok', TRUE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION device_removal_check(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION delete_device(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION deactivate_device(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION device_removal_check(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_device(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION deactivate_device(UUID, TEXT) TO authenticated;

-- Conferência: deve devolver 6 linhas, todas com "authenticated" = false nas 3 internas e true nas 3 públicas:
--   deactivate_device (true), delete_device (true), device_audit_log (false),
--   device_for_admin (false), device_removal_blockers (false), device_removal_check (true)
SELECT p.proname AS funcao, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('device_audit_log', 'device_for_admin', 'device_removal_blockers', 'device_removal_check', 'delete_device', 'deactivate_device')
ORDER BY 1;
