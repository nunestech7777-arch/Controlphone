-- ============================================================================
-- CONTROLPHONE — COMPROVANTE DE GARANTIA COM RUBRICA DIGITAL (ENVIO POR WHATSAPP)
-- Rodar à mão no SQL Editor. Seguro rodar mais de uma vez.
-- Pré-requisitos: migrations 01 a 27 (usa tenant_record_allowed da migration 17).
--
-- 1. warranty_signatures: um registro por venda. Guarda só o HASH (SHA-256) do
--    token do link enviado ao cliente — o token em si nunca fica no banco —,
--    o resumo do comprovante exibido na página pública (sem custos nem lucros),
--    o caminho do PDF original e, depois da confirmação, a rubrica, o PDF
--    assinado, o hash do PDF assinado e a data/hora da confirmação.
--
-- 2. Quem grava: só a função edge "warranty-signature" (chave de serviço).
--    O navegador não insere nem altera nada nesta tabela.
--    Quem lê: quem já pode ler as vendas da loja (tenant_record_allowed('sales','read')):
--    administrador, vendedor e Super Admin. Técnico não lê, como nas vendas.
--
-- 3. Registro histórico: depois de confirmado, o gatilho trg_warranty_signature_lock
--    impede qualquer alteração ou exclusão do registro (inclusive pela chave de
--    serviço). Os arquivos ficam no bucket privado "warranty-receipts", sem regra
--    de escrita, alteração ou exclusão para usuários: só a função grava.
--
-- 4. Tempo real: a tabela entra na publicação supabase_realtime; os detalhes da
--    venda mudam para "Comprovante confirmado" assim que o cliente confirma.
-- ============================================================================

-- 1. TABELA
CREATE TABLE IF NOT EXISTS warranty_signatures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_id             TEXT NOT NULL,
  sale_number         INTEGER,
  customer_id         TEXT,
  document_id         TEXT NOT NULL DEFAULT 'warranty-term',
  token_hash          TEXT NOT NULL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'pending',
  snapshot            JSONB NOT NULL,
  original_pdf_path   TEXT NOT NULL,
  original_pdf_sha256 TEXT NOT NULL,
  signature_path      TEXT,
  signed_pdf_path     TEXT,
  signed_pdf_sha256   TEXT,
  signed_at           TIMESTAMPTZ,
  signer_ip           TEXT,
  signer_user_agent   TEXT,
  link_sent_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT warranty_signatures_status_check CHECK (status IN ('pending', 'signing', 'signed')),
  CONSTRAINT warranty_signatures_sale_unique UNIQUE (tenant_id, sale_id, document_id),
  CONSTRAINT warranty_signatures_snapshot_check CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT warranty_signatures_signed_check CHECK (
    status <> 'signed' OR (signed_at IS NOT NULL AND signed_pdf_path IS NOT NULL AND signature_path IS NOT NULL AND signed_pdf_sha256 IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_warranty_signatures_sale ON warranty_signatures (tenant_id, sale_id);

-- 2. ACESSO
ALTER TABLE warranty_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON warranty_signatures FROM anon, authenticated;
GRANT SELECT ON warranty_signatures TO authenticated;

DROP POLICY IF EXISTS warranty_signatures_select ON warranty_signatures;
CREATE POLICY warranty_signatures_select ON warranty_signatures
  FOR SELECT TO authenticated
  USING (
    (tenant_id = get_auth_tenant_id() OR is_super_admin())
    AND tenant_record_allowed('sales', 'read')
  );
-- token_hash fica legível para a loja de propósito: é o SHA-256 de um token aleatório
-- de 256 bits, não permite reconstruir o link, e uma restrição por coluna quebraria o tempo real.

-- 3. REGISTRO HISTÓRICO: confirmado não muda mais
CREATE OR REPLACE FUNCTION warranty_signature_lock()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'signed' THEN
      RAISE EXCEPTION 'Comprovante de garantia confirmado pelo cliente não pode ser excluído.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'Comprovante de garantia confirmado pelo cliente não pode ser alterado.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_warranty_signature_lock ON warranty_signatures;
CREATE TRIGGER trg_warranty_signature_lock
  BEFORE UPDATE OR DELETE ON warranty_signatures
  FOR EACH ROW EXECUTE FUNCTION warranty_signature_lock();

-- 4. ARQUIVOS: bucket privado, só PDF e PNG, até 10 MB
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('warranty-receipts', 'warranty-receipts', false, 10485760, ARRAY['application/pdf', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leitura (visualizar e baixar): pasta = tenant_id, mesmas permissões das vendas.
-- Sem regra de INSERT/UPDATE/DELETE: o navegador não grava nem apaga nada aqui.
DROP POLICY IF EXISTS warranty_receipts_read ON storage.objects;
CREATE POLICY warranty_receipts_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'warranty-receipts'
    AND ((storage.foldername(name))[1] = get_auth_tenant_id()::text OR is_super_admin())
    AND tenant_record_allowed('sales', 'read')
  );

-- 5. TEMPO REAL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE warranty_signatures; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- CONFERÊNCIA
SELECT 'tabela' AS item, to_regclass('public.warranty_signatures')::TEXT AS valor
UNION ALL
SELECT 'bucket', id FROM storage.buckets WHERE id = 'warranty-receipts'
UNION ALL
SELECT 'tempo real', tablename::TEXT FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'warranty_signatures';
