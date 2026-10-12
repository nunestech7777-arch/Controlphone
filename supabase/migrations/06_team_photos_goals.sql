-- ============================================================================
-- CONTROLPHONE — EQUIPE DA LOJA: FOTOS DE PERFIL (STORAGE) E PERMISSÕES DE METAS
-- Pré-requisitos: migrations 01 e 02 (profiles, sales_goals, get_auth_* e is_super_admin).
-- ============================================================================

-- 1. Referência do arquivo no Storage (avatar_url já existe em profiles)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_path TEXT;

-- 2. Bucket de fotos: leitura pública por URL não adivinhável, limite de 5 MB e só imagens
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Escrita: somente o Admin da própria loja (pasta = tenant_id) ou o Super Admin
DROP POLICY IF EXISTS avatars_admin_insert ON storage.objects;
CREATE POLICY avatars_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND (
      ((storage.foldername(name))[1] = get_auth_tenant_id()::text AND get_auth_role() = 'admin')
      OR is_super_admin()
    )
  );

DROP POLICY IF EXISTS avatars_admin_update ON storage.objects;
CREATE POLICY avatars_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      ((storage.foldername(name))[1] = get_auth_tenant_id()::text AND get_auth_role() = 'admin')
      OR is_super_admin()
    )
  );

DROP POLICY IF EXISTS avatars_admin_delete ON storage.objects;
CREATE POLICY avatars_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars' AND (
      ((storage.foldername(name))[1] = get_auth_tenant_id()::text AND get_auth_role() = 'admin')
      OR is_super_admin()
    )
  );

-- 4. Metas: a tabela tinha RLS ativo sem nenhuma policy (nada era acessível).
--    Admin gerencia as metas da loja; vendedor/técnico só LÊ a própria meta.
DROP POLICY IF EXISTS admin_manage_sales_goals ON sales_goals;
CREATE POLICY admin_manage_sales_goals ON sales_goals
  FOR ALL TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin())
  WITH CHECK ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

DROP POLICY IF EXISTS seller_view_own_goal ON sales_goals;
CREATE POLICY seller_view_own_goal ON sales_goals
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() AND seller_id = auth.uid());

-- 5. Tempo real: metas e perfis (foto) atualizam rankings sem recarregar
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales_goals; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sales; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
