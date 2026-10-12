-- ============================================================================
-- CONTROLPHONE — TRAVA DAS FUNÇÕES QUE CONFIAM NA LOJA/USUÁRIO INFORMADOS
--
-- As funções das migrations 03, 05, 07 e 09 rodam com privilégio elevado
-- (SECURITY DEFINER) e recebem a loja (p_tenant_id) e o usuário (p_user_id)
-- como parâmetros, sem conferir quem está chamando. Como o Postgres libera a
-- execução para qualquer usuário logado por padrão, um usuário de uma loja
-- poderia chamá-las informando outra loja ou o id do administrador.
--
-- O aplicativo ainda NÃO chama nenhuma delas (os módulos operacionais gravam
-- no navegador), então esta migration apenas retira a permissão de execução.
-- Cada função volta a ser liberada quando o módulo correspondente for ligado
-- ao banco, já com a conferência de auth.uid() dentro dela.
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 13.
-- ============================================================================

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'finalize_sale', 'process_trade_in_sale', 'cancel_sale',
        'complete_internal_repair', 'send_device_to_assistance', 'create_external_assistance',
        'update_assistance_status', 'complete_internal_assistance', 'complete_external_assistance',
        'deliver_external_assistance', 'cancel_assistance',
        'recalc_sale_totals', 'update_return_status', 'complete_return',
        'resolve_returned_device', 'consume_customer_credit'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
  END LOOP;
END $$;

-- Histórico de atividades: cada usuário só registra em nome próprio e na própria loja
-- (antes, qualquer usuário logado podia inserir registros de qualquer loja).
DROP POLICY IF EXISTS insert_audit_logs ON audit_logs;
CREATE POLICY insert_audit_logs ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (is_super_admin() OR tenant_id = get_auth_tenant_id())
  );

-- Conferência: deve listar as funções acima sem "authenticated" nem "anon" na coluna de permissões
SELECT p.oid::regprocedure AS funcao, p.proacl AS permissoes
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('finalize_sale', 'cancel_sale', 'complete_return', 'process_trade_in_sale')
ORDER BY 1;
