-- ============================================================================
-- CONTROLPHONE — ORDEM DE SERVIÇO (DOCUMENTO): CHECKLIST, DIAGNÓSTICO E ORÇAMENTO
-- Campos usados para gerar a Ordem de Serviço e o Orçamento em PDF.
-- Pré-requisito: migration 05 (estrutura de assistência interna/externa).
-- ============================================================================

ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS imei2 VARCHAR(50),
  ADD COLUMN IF NOT EXISTS intake_checklist JSONB,          -- { "power_on": "ok" | "fail" | "untested", ... }
  ADD COLUMN IF NOT EXISTS problem_found TEXT,
  ADD COLUMN IF NOT EXISTS service_needed TEXT,
  ADD COLUMN IF NOT EXISTS technical_notes TEXT,
  ADD COLUMN IF NOT EXISTS quote_service_description TEXT,
  ADD COLUMN IF NOT EXISTS quote_service_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS quote_parts_description TEXT,
  ADD COLUMN IF NOT EXISTS quote_parts_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS quote_deadline TEXT;

ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_quote_amounts_check;
ALTER TABLE service_orders ADD CONSTRAINT service_orders_quote_amounts_check
  CHECK (COALESCE(quote_service_amount, 0) >= 0 AND COALESCE(quote_parts_amount, 0) >= 0);
