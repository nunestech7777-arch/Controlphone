-- ============================================================================
-- CONTROLPHONE — COMPROVANTES COM RUBRICA FORA DO RESET E DOS BACKUPS
-- Rodar à mão no SQL Editor. Seguro rodar mais de uma vez.
-- Pré-requisitos: migrations 01 a 28.
--
-- O backup (migration 20) e o Reset Geral (migration 27) tratam como dado da loja
-- toda tabela com coluna tenant_id. A tabela warranty_signatures (migration 28)
-- entrou nessa lista sozinha: o reset tentava apagar os comprovantes confirmados
-- pelo cliente, a trava da migration 28 recusava e o reset inteiro era desfeito
-- ("Comprovante de garantia confirmado pelo cliente não pode ser excluído.").
--
-- Os comprovantes com rubrica são registro histórico, como os documentos
-- preservados: ficam fora do backup, da restauração e do reset. A lista sai de
-- backup_table_plan(), da qual backup_table_order() e reset_operational_tables()
-- dependem; abaixo, a mesma função da migration 27 com a tabela acrescentada.
-- ============================================================================

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
      'tenant_cycles', 'tenant_cycle_archives', 'tenant_reset_runs', 'tenant_archive_orders', 'preserved_sale_documents',
      -- comprovantes de garantia com rubrica (migration 28): registro histórico permanente
      'warranty_signatures');

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

REVOKE ALL ON FUNCTION backup_table_plan() FROM PUBLIC, anon, authenticated;

-- CONFERÊNCIA: as duas colunas devem ser false
SELECT 'warranty_signatures' = ANY (backup_table_order()) AS entra_no_backup,
       'warranty_signatures' = ANY (reset_operational_tables()) AS entra_no_reset;
