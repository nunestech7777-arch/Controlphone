-- ============================================================================
-- CONTROLPHONE — APOIO À FUNÇÃO DE ADMINISTRAÇÃO (supabase/functions/admin)
-- Exclusão de loja em uma única transação, usada pelo painel do Super Admin.
-- Pré-requisitos: migrations 01 a 12.
-- ============================================================================

-- Remove a loja, sua identidade visual, configurações, documentos e usuários.
-- Lojas com movimentações (estoque, vendas, clientes etc.) NÃO são excluídas:
-- as chaves estrangeiras barram a operação e nada é alterado.
-- Devolve os ids dos usuários removidos, para a função apagar os logins.
CREATE OR REPLACE FUNCTION admin_delete_tenant(p_tenant_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'TENANT_NOT_FOUND';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_users FROM profiles WHERE tenant_id = p_tenant_id;

  BEGIN
    DELETE FROM profiles WHERE tenant_id = p_tenant_id;
    DELETE FROM tenants WHERE id = p_tenant_id; -- temas, configurações, notas e documentos saem em cascata
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'TENANT_HAS_DATA';
  END;

  RETURN v_users;
END;
$$;

-- Somente o servidor (service role) pode chamar
REVOKE ALL ON FUNCTION admin_delete_tenant(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_delete_tenant(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_tenant(UUID) TO service_role;
