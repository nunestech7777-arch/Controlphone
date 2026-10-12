-- ============================================================================
-- CONTROLPHONE — FINANCEIRO: DADOS DO PAGAMENTO DA DESPESA
-- Pré-requisitos: migrations 01 e 02 (expenses e a policy admin_manage_expenses).
-- payment_method = forma prevista | paid_method = forma efetivamente utilizada.
-- ============================================================================

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS paid_method payment_method,
  ADD COLUMN IF NOT EXISTS receipt_name TEXT,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Despesa paga precisa de data e forma utilizada; pendente não pode carregar dados de pagamento
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_payment_consistency;
ALTER TABLE expenses ADD CONSTRAINT expenses_payment_consistency CHECK (
  (status = 'paid' AND payment_date IS NOT NULL)
  OR
  (status = 'pending' AND payment_date IS NULL AND paid_method IS NULL)
) NOT VALID; -- NOT VALID: não reprova linhas antigas; vale para novas gravações

CREATE INDEX IF NOT EXISTS idx_expenses_status_due ON expenses (tenant_id, status, due_date);
