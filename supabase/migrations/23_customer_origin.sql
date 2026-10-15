-- ============================================================================
-- CONTROLPHONE — ORIGEM DO CLIENTE (ORGÂNICO x ANÚNCIO PAGO)
--
-- customers.origin: como o cliente conheceu a loja, com as mesmas opções da
-- origem da venda. Sem "Ads" = chegou sem anúncio; com "Ads" = anúncio pago.
-- Clientes já cadastrados ficam sem origem (NULL): nada é presumido.
--
-- A origem da venda continua no documento da venda (tenant_records), como
-- antes. Vendas antigas mantêm a origem escolhida na época ("TikTok",
-- "Já era cliente"...): nada é convertido. As regras de acesso de customers
-- (migration 15) continuam valendo para a nova coluna.
--
-- Pode ser rodada mais de uma vez. Pré-requisitos: migrations 01 a 22.
-- ============================================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_origin_check;
ALTER TABLE customers ADD CONSTRAINT customers_origin_check CHECK (origin IS NULL OR origin IN (
  'Instagram', 'Instagram Ads', 'Facebook', 'Facebook Ads', 'WhatsApp', 'WhatsApp Ads',
  'Google', 'Google Ads', 'Indicação', 'Loja física', 'Outros'
));

-- Conferência: deve devolver 2 linhas — "coluna | customers.origin" e "regra | customers_origin_check"
SELECT 'coluna' AS tipo, 'customers.' || column_name AS nome FROM information_schema.columns
WHERE table_name = 'customers' AND column_name = 'origin'
UNION ALL
SELECT 'regra', conname::TEXT FROM pg_constraint WHERE conname = 'customers_origin_check'
ORDER BY 1, 2;
