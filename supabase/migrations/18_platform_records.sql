-- ============================================================================
-- CONTROLPHONE — PAINEL DA PLATAFORMA NO BANCO (SESSÕES DE SUPORTE E HISTÓRICO)
--
-- Últimos dados que ainda ficavam só no navegador do Super Administrador:
--
--   1. support_sessions tinha a segurança por linha (RLS) ligada, mas nenhuma
--      regra: ninguém conseguia ler nem gravar. Aqui entram as regras.
--        - só o super admin lê;
--        - cada super admin abre e encerra sessões apenas em nome próprio;
--        - ninguém exclui.
--      A sessão de suporte deixa de impedir a exclusão de uma loja sem
--      movimentações: ao excluir a loja, as sessões dela saem junto.
--
--   2. O histórico de ações da plataforma que não pertence a uma loja (ex.:
--      loja excluída) vai para audit_logs, que já tinha regras (migrations 02
--      e 14): só inclusão, em nome próprio; leitura do super admin. Aqui entra
--      só o índice da consulta. As ações feitas em uma loja continuam em
--      tenant_records (migration 17).
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 17.
-- ============================================================================

-- 1. SESSÕES DE SUPORTE
DROP POLICY IF EXISTS super_admin_view_support_sessions ON support_sessions;
CREATE POLICY super_admin_view_support_sessions ON support_sessions
  FOR SELECT TO authenticated
  USING (is_super_admin());

DROP POLICY IF EXISTS super_admin_insert_support_sessions ON support_sessions;
CREATE POLICY super_admin_insert_support_sessions ON support_sessions
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() AND super_admin_id = auth.uid());

DROP POLICY IF EXISTS super_admin_update_support_sessions ON support_sessions;
CREATE POLICY super_admin_update_support_sessions ON support_sessions
  FOR UPDATE TO authenticated
  USING (is_super_admin() AND super_admin_id = auth.uid())
  WITH CHECK (is_super_admin() AND super_admin_id = auth.uid());

REVOKE ALL ON support_sessions FROM anon;
GRANT SELECT, INSERT, UPDATE ON support_sessions TO authenticated;

-- Excluir a loja leva junto as sessões de suporte dela (antes, a sessão bloqueava a exclusão)
ALTER TABLE support_sessions DROP CONSTRAINT IF EXISTS support_sessions_target_tenant_id_fkey;
ALTER TABLE support_sessions ADD CONSTRAINT support_sessions_target_tenant_id_fkey
  FOREIGN KEY (target_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_support_sessions_started ON support_sessions (started_at);

-- 2. HISTÓRICO DA PLATAFORMA (registros sem loja)
CREATE INDEX IF NOT EXISTS idx_audit_logs_platform ON audit_logs (created_at) WHERE tenant_id IS NULL;

-- Conferência: deve devolver 6 linhas —
--   3 regras de support_sessions (super_admin_insert_, super_admin_update_, super_admin_view_),
--   2 regras de audit_logs (insert_audit_logs, view_store_audit_logs),
--   1 linha "exclusão em cascata" com support_sessions.
SELECT 'regra' AS tipo, tablename::TEXT AS tabela, policyname::TEXT AS nome FROM pg_policies
WHERE tablename IN ('support_sessions', 'audit_logs')
UNION ALL
SELECT 'exclusão em cascata', conrelid::regclass::TEXT, conname::TEXT FROM pg_constraint
WHERE conname = 'support_sessions_target_tenant_id_fkey' AND confdeltype = 'c'
ORDER BY 1, 2, 3;
