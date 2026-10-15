-- ============================================================================
-- CONTROLPHONE — APARELHO SEMINOVO OU LACRADO
--
--   1. devices.device_type: 'seminovo' ou 'lacrado'. Aparelhos já cadastrados
--      ficam sem tipo (NULL) até o administrador classificar: nada é presumido
--      e nenhum dado existente é alterado. As regras de acesso de devices
--      (migrations 02 e 16) continuam valendo para a nova coluna.
--
--   2. Modelo próprio da loja para o comprovante de lacrado
--      (tenant_documents.type = 'sale_receipt_sealed'), administrado pelo
--      Super Admin como os demais modelos.
--
--   3. Textos dos comprovantes que o administrador da loja edita (condições da
--      garantia dos seminovos e observações do comprovante de lacrado): um
--      documento do tipo 'documentTexts' em tenant_records.
--        - administrador e super admin: leem e gravam;
--        - vendedor: só lê (precisa dos textos para gerar o comprovante);
--        - técnico: sem acesso.
--      Os avisos obrigatórios do comprovante de lacrado (garantia do fabricante
--      e cupom não fiscal) são fixos no aplicativo e não ficam neste registro.
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 20.
-- ============================================================================

-- 1. TIPO DO APARELHO
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_type_check;
ALTER TABLE devices ADD CONSTRAINT devices_device_type_check
  CHECK (device_type IS NULL OR device_type IN ('seminovo', 'lacrado'));
CREATE INDEX IF NOT EXISTS idx_devices_tenant_type ON devices (tenant_id, device_type);

-- 2. MODELO DO COMPROVANTE DE LACRADO
ALTER TABLE tenant_documents DROP CONSTRAINT IF EXISTS tenant_documents_type_check;
ALTER TABLE tenant_documents ADD CONSTRAINT tenant_documents_type_check
  CHECK (type IN ('warranty_term', 'service_order', 'upgrade_contract', 'sale_receipt', 'sale_receipt_sealed'));

-- 3. TEXTOS DOS COMPROVANTES
ALTER TABLE tenant_records DROP CONSTRAINT IF EXISTS tenant_records_kind_check;
ALTER TABLE tenant_records ADD CONSTRAINT tenant_records_kind_check CHECK (kind IN (
  'sales', 'tradeIns', 'serviceOrders', 'internalRepairs', 'warranties', 'returnRequests',
  'customerCredits', 'expenses', 'goals', 'deviceMovements', 'auditLogs', 'documentTexts'
));

-- Mesmas regras da migration 17, mais o tipo documentTexts
CREATE OR REPLACE FUNCTION tenant_record_allowed(p_kind TEXT, p_action TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    CASE
      WHEN p_kind = 'auditLogs' THEN
        CASE p_action
          WHEN 'insert' THEN me.role IS NOT NULL
          WHEN 'read' THEN me.role IN ('admin', 'super_admin')
          ELSE FALSE
        END
      WHEN me.role IN ('admin', 'super_admin') THEN TRUE
      WHEN p_action = 'delete' THEN FALSE
      WHEN p_kind = 'documentTexts' THEN me.role = 'seller' AND p_action = 'read'
      WHEN me.role = 'seller' THEN
        CASE
          WHEN p_kind = 'expenses' THEN FALSE
          WHEN p_kind = 'goals' THEN p_action = 'read'
          ELSE TRUE
        END
      WHEN me.role = 'technician' THEN
        p_kind IN ('serviceOrders', 'internalRepairs', 'deviceMovements', 'warranties')
      ELSE FALSE
    END,
    FALSE)
  FROM (SELECT public.get_auth_role()::TEXT AS role) me;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Conferência: deve devolver 4 linhas —
--   coluna      | devices.device_type
--   regra       | devices_device_type_check
--   regra       | tenant_documents_type_check (com sale_receipt_sealed)
--   regra       | tenant_records_kind_check (com documentTexts)
SELECT 'coluna' AS tipo, 'devices.' || column_name AS nome FROM information_schema.columns
WHERE table_name = 'devices' AND column_name = 'device_type'
UNION ALL
SELECT 'regra', conname::TEXT FROM pg_constraint
WHERE conname IN ('devices_device_type_check', 'tenant_documents_type_check', 'tenant_records_kind_check')
  AND (conname = 'devices_device_type_check'
    OR pg_get_constraintdef(oid) LIKE '%sale_receipt_sealed%'
    OR pg_get_constraintdef(oid) LIKE '%documentTexts%')
ORDER BY 1, 2;
