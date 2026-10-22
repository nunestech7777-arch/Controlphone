-- ============================================================================
-- CONTROLPHONE — LIXEIRA DE VENDAS (vendas canceladas)
-- Rodar à mão no SQL Editor. Seguro rodar mais de uma vez. Pré-requisito: migration 24.
--
-- A lixeira é lógica, em tenant_records (kind = 'sales'), com campos próprios
-- (separados da "Excluir Venda", que usa deleted_at):
--   trashed_at / trashed_by   venda cancelada enviada para a lixeira;
--   purged_at  / purged_by    excluída definitivamente da interface.
-- Nada é apagado: a venda, os pagamentos e o histórico de atividades continuam
-- no banco para auditoria, e o número da venda nunca é reutilizado.
--
-- Este arquivo recria o gatilho da migration 24 (mesmas regras de exclusão) e
-- acrescenta, valendo também para requisição manual:
--   1. só administrador envia para a lixeira, restaura ou exclui definitivamente
--      (de outros perfis, esses campos são ignorados e mantidos como estavam);
--   2. só venda CANCELADA entra na lixeira;
--   3. exclusão definitiva só de venda que está na lixeira, e depois dela os
--      campos ficam travados (não volta para a lixeira nem para o histórico).
-- ============================================================================

CREATE OR REPLACE FUNCTION tenant_records_before_write()
RETURNS TRIGGER AS $$
DECLARE
  v_field   TEXT;
  v_number  TEXT;
  v_admin   BOOLEAN;
  v_locked  TEXT[] := ARRAY['deleted_at', 'deleted_by', 'deletion_reason'];
  v_admin_only TEXT[] := ARRAY['refund_status', 'refund_amount', 'refund_note', 'refund_updated_at', 'refund_updated_by',
    'deletion_device_situation', 'deletion_return_pending', 'deletion_return_confirmed_at', 'deletion_return_confirmed_by'];
  v_key     TEXT;
  v_old     JSONB;
  v_trash   TEXT[] := ARRAY['trashed_at', 'trashed_by', 'purged_at', 'purged_by'];
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  NEW.data := NEW.data || jsonb_build_object('id', NEW.id, 'tenant_id', NEW.tenant_id::TEXT);

  -- EXCLUSÃO LÓGICA DE VENDAS
  IF NEW.kind = 'sales' THEN
    v_admin := COALESCE(get_auth_role()::TEXT IN ('admin', 'super_admin'), FALSE);
    -- o aplicativo grava com "inserir ou atualizar": linha que já existe vale como atualização
    IF TG_OP = 'UPDATE' THEN
      v_old := OLD.data;
    ELSE
      SELECT r.data INTO v_old FROM tenant_records r WHERE r.id = NEW.id AND r.kind = 'sales';
    END IF;

    IF v_old IS NULL THEN
      IF NOT v_admin AND (NEW.data->>'deleted_at' IS NOT NULL OR NEW.data->>'status' = 'cancelled') THEN
        RAISE EXCEPTION 'Somente administradores podem excluir ou cancelar vendas.' USING ERRCODE = '42501';
      END IF;
    ELSIF v_old->>'deleted_at' IS NOT NULL THEN
      -- já excluída: trava os campos da exclusão e o status
      NEW.data := NEW.data || jsonb_build_object('status', 'cancelled');
      FOREACH v_key IN ARRAY v_locked LOOP
        NEW.data := (NEW.data - v_key) || jsonb_build_object(v_key, v_old->v_key);
      END LOOP;
      IF NOT v_admin THEN
        FOREACH v_key IN ARRAY v_admin_only LOOP
          NEW.data := NEW.data - v_key;
          IF v_old ? v_key THEN
            NEW.data := NEW.data || jsonb_build_object(v_key, v_old->v_key);
          END IF;
        END LOOP;
      END IF;
    ELSE
      IF NOT v_admin AND (
        (NEW.data->>'deleted_at' IS NOT NULL)
        OR (NEW.data->>'status' = 'cancelled' AND COALESCE(v_old->>'status', '') <> 'cancelled')
      ) THEN
        -- vendedor: só exclui (com deleted_at) venda feita por ele mesmo
        IF NOT (
          get_auth_role()::TEXT = 'seller'
          AND v_old->>'seller_id' = auth.uid()::TEXT
          AND NEW.data->>'seller_id' = v_old->>'seller_id'
          AND NEW.data->>'deleted_at' IS NOT NULL
          AND NEW.data->>'deleted_by' = auth.uid()::TEXT
          AND COALESCE(v_old->>'status', '') <> 'cancelled'
        ) THEN
          RAISE EXCEPTION 'Somente administradores podem excluir ou cancelar vendas.' USING ERRCODE = '42501';
        END IF;
        -- o estorno do dinheiro quem acerta é o administrador
        IF NEW.data->>'refund_status' IN ('done', 'partial') THEN
          NEW.data := (NEW.data - 'refund_amount') || jsonb_build_object('refund_status', 'pending');
        END IF;
      END IF;
    END IF;

    -- LIXEIRA: só administrador mexe; só venda cancelada entra; removida da lixeira não volta
    IF NOT v_admin THEN
      FOREACH v_key IN ARRAY v_trash LOOP
        NEW.data := NEW.data - v_key;
        IF v_old IS NOT NULL AND v_old ? v_key THEN
          NEW.data := NEW.data || jsonb_build_object(v_key, v_old->v_key);
        END IF;
      END LOOP;
    ELSE
      IF v_old IS NOT NULL AND v_old->>'purged_at' IS NOT NULL THEN
        FOREACH v_key IN ARRAY v_trash LOOP
          NEW.data := (NEW.data - v_key) || jsonb_build_object(v_key, v_old->v_key);
        END LOOP;
      END IF;
      IF NEW.data->>'trashed_at' IS NOT NULL AND COALESCE(NEW.data->>'status', '') <> 'cancelled' THEN
        RAISE EXCEPTION 'Somente vendas canceladas podem ir para a lixeira.' USING ERRCODE = '42501';
      END IF;
      IF NEW.data->>'purged_at' IS NOT NULL AND NEW.data->>'trashed_at' IS NULL THEN
        RAISE EXCEPTION 'Somente vendas na lixeira podem ser excluídas definitivamente.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

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

-- Conferência: deve devolver 1 linha com "protege_exclusao" e "protege_lixeira" = true
SELECT proname AS funcao,
  prosrc LIKE '%Somente administradores podem excluir%' AS protege_exclusao,
  prosrc LIKE '%Somente vendas canceladas podem ir para a lixeira%' AS protege_lixeira
FROM pg_proc WHERE proname = 'tenant_records_before_write';
