-- ============================================================================
-- CONTROLPHONE — REMOVE "CONDIÇÃO FÍSICA" / GRADES (A+, A, B, C) DOS APARELHOS
-- O estado do aparelho passa a ser descrito apenas pelo campo livre "Observações"
-- (devices.physical_condition_notes). Pré-requisito: migration 09 (função sem condição).
-- ============================================================================

-- 1. Funções antigas de upgrade que recebiam a condição como parâmetro
DROP FUNCTION IF EXISTS process_trade_in_sale(
  UUID, UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR,
  device_condition, INT, TEXT, NUMERIC, payment_method
);
DROP FUNCTION IF EXISTS process_trade_in_sale(
  UUID, UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR,
  device_condition, INT, TEXT, NUMERIC, payment_method, VARCHAR
);

-- 2. Coluna e tipo (os dados de "Observações" permanecem intactos)
ALTER TABLE devices DROP COLUMN IF EXISTS condition;
DROP TYPE IF EXISTS device_condition;
