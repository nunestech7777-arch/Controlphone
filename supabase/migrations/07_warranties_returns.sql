-- ============================================================================
-- CONTROLPHONE — GARANTIAS COMERCIAIS, TROCAS & DEVOLUÇÕES, CRÉDITO DO CLIENTE
-- Pré-requisitos: migrations 01, 02, 03 e 05 (device_movements, guard de status,
-- send_device_to_assistance). Reaproveita: warranties, sales, sale_items, devices.
-- A garantia comercial é concedida pela loja e NÃO substitui os direitos do CDC.
-- ============================================================================

-- 1. NOVOS VALORES DE ENUM (referenciados apenas em corpos de função / em tempo de execução)
ALTER TYPE device_status ADD VALUE IF NOT EXISTS 'awaiting_evaluation'; -- devolvido, bloqueado até avaliação
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'store_credit';

-- 2. PRAZO DE GARANTIA: fixo em 90 dias (garantia legal do CDC para bem durável); não é configurável

-- 3. ITENS DA VENDA: prazo registrado na venda e marcação de troca/devolução (devolução parcial)
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS warranty_days INT,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_request_id UUID,
  ADD COLUMN IF NOT EXISTS return_type VARCHAR(10);

-- 4. GARANTIAS: uma por aparelho vendido (a tabela já existia na migration 01)
ALTER TABLE warranties
  ADD COLUMN IF NOT EXISTS sale_item_id UUID REFERENCES sale_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS trade_in_id UUID REFERENCES trade_ins(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS imei VARCHAR(50),
  ADD COLUMN IF NOT EXISTS sale_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warranty_days INT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS replaces_warranty_id UUID REFERENCES warranties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replaced_by_warranty_id UUID REFERENCES warranties(id) ON DELETE SET NULL;

ALTER TABLE warranties ALTER COLUMN sale_id DROP NOT NULL; -- venda por upgrade não tem registro em sales

ALTER TABLE warranties DROP CONSTRAINT IF EXISTS warranties_status_check;
ALTER TABLE warranties ADD CONSTRAINT warranties_status_check CHECK (status IN ('active', 'cancelled', 'expired', 'claimed'));

-- Impede garantias duplicadas para o mesmo item vendido
CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_per_sale_item ON warranties (sale_item_id) WHERE sale_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_customer ON warranties (tenant_id, customer_id, end_date);
CREATE INDEX IF NOT EXISTS idx_warranties_imei ON warranties (tenant_id, imei);

CREATE TABLE IF NOT EXISTS warranty_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  warranty_id UUID NOT NULL REFERENCES warranties(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  notes TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garantia criada automaticamente quando o aparelho entra em uma venda
CREATE OR REPLACE FUNCTION create_warranty_for_sale_item()
RETURNS TRIGGER AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_imei VARCHAR(50);
  v_days INT;
  v_start DATE;
  v_id UUID;
BEGIN
  IF NEW.item_type <> 'device' OR NEW.device_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = NEW.sale_id;
  SELECT imei INTO v_imei FROM devices WHERE id = NEW.device_id;
  v_days := 90; -- prazo fixo
  v_start := (v_sale.created_at)::date;

  INSERT INTO warranties (
    tenant_id, sale_id, sale_item_id, customer_id, device_id, imei, sale_date,
    warranty_days, start_date, end_date, terms_text, status
  ) VALUES (
    NEW.tenant_id, NEW.sale_id, NEW.id, v_sale.customer_id, NEW.device_id, v_imei, v_sale.created_at,
    v_days, v_start, v_start + v_days,
    'Garantia comercial da loja contra defeitos de funcionamento. Não substitui nem reduz os direitos legais do consumidor (CDC).',
    'active'
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    UPDATE sale_items SET warranty_days = v_days WHERE id = NEW.id;
    INSERT INTO warranty_events (tenant_id, warranty_id, description, user_id)
    VALUES (NEW.tenant_id, v_id, 'Garantia comercial de ' || v_days || ' dias registrada na venda', v_sale.seller_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_warranty ON sale_items;
CREATE TRIGGER trg_create_warranty
  AFTER INSERT ON sale_items
  FOR EACH ROW EXECUTE FUNCTION create_warranty_for_sale_item();

-- Venda cancelada => garantias canceladas (o registro histórico permanece)
CREATE OR REPLACE FUNCTION cancel_warranties_on_sale_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    UPDATE warranties
    SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = 'Venda cancelada'
    WHERE sale_id = NEW.id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cancel_warranties ON sales;
CREATE TRIGGER trg_cancel_warranties
  AFTER UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION cancel_warranties_on_sale_cancel();

-- 5. ASSISTÊNCIA: vínculo informativo com a garantia e resultado da análise (nunca automático)
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS warranty_id UUID REFERENCES warranties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warranty_analysis VARCHAR(15) CHECK (warranty_analysis IN ('pending', 'covered', 'not_covered')),
  ADD COLUMN IF NOT EXISTS warranty_analysis_notes TEXT;

-- 6. TROCAS & DEVOLUÇÕES
CREATE TABLE IF NOT EXISTS return_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  request_number BIGSERIAL,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  sale_item_id UUID NOT NULL REFERENCES sale_items(id) ON DELETE RESTRICT,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
  imei VARCHAR(50) NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reason VARCHAR(120) NOT NULL,
  notes TEXT,
  resolution VARCHAR(10) NOT NULL CHECK (resolution IN ('exchange', 'refund', 'credit')),
  status VARCHAR(12) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_review', 'approved', 'rejected', 'completed', 'cancelled')),
  item_paid_amount NUMERIC(12, 2) NOT NULL,
  refund_amount NUMERIC(12, 2),
  refund_method payment_method,
  credit_id UUID,
  credit_amount NUMERIC(12, 2),
  new_device_id UUID REFERENCES devices(id) ON DELETE RESTRICT,
  new_device_price NUMERIC(12, 2),
  difference_amount NUMERIC(12, 2),
  difference_method payment_method,
  device_destination VARCHAR(20)
    CHECK (device_destination IN ('pending_evaluation', 'returned_to_stock', 'sent_to_assistance')),
  service_order_id UUID REFERENCES service_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Uma única solicitação em andamento por item e uma única conclusão por item (sem devolução repetida)
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_return_per_item
  ON return_requests (sale_item_id) WHERE status IN ('open', 'in_review', 'approved');
CREATE UNIQUE INDEX IF NOT EXISTS uq_completed_return_per_item
  ON return_requests (sale_item_id) WHERE status = 'completed';
CREATE INDEX IF NOT EXISTS idx_return_requests_tenant ON return_requests (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS return_request_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  return_request_id UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  notes TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ajustes rastreáveis de receita (a venda original nunca é apagada)
CREATE TABLE IF NOT EXISTS sale_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  return_request_id UUID NOT NULL REFERENCES return_requests(id) ON DELETE RESTRICT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('refund', 'credit', 'exchange_difference')),
  amount NUMERIC(12, 2) NOT NULL,
  retained_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method payment_method,
  description TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_adjustment_per_request UNIQUE (return_request_id) -- sem reembolso/crédito em duplicidade
);

-- 7. CRÉDITO DO CLIENTE
CREATE TABLE IF NOT EXISTS customer_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  origin_sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  return_request_id UUID NOT NULL UNIQUE REFERENCES return_requests(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  balance NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_balance_range CHECK (balance >= 0 AND balance <= amount) -- nunca negativo nem acima do autorizado
);

CREATE TABLE IF NOT EXISTS customer_credit_usages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  credit_id UUID NOT NULL REFERENCES customer_credits(id) ON DELETE RESTRICT,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. STATUS DO APARELHO: inclui o bloqueio "aguardando avaliação" (substitui a função da migration 05)
CREATE OR REPLACE FUNCTION guard_device_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_old TEXT := OLD.status::TEXT;
  v_new TEXT := NEW.status::TEXT;
BEGIN
  IF v_new IS DISTINCT FROM v_old THEN
    IF v_old = 'in_maintenance' AND v_new NOT IN ('available', 'decommissioned') THEN
      RAISE EXCEPTION 'Aparelho em manutenção não pode mudar para %', v_new;
    END IF;
    IF v_new = 'sold' AND v_old NOT IN ('available', 'reserved') THEN
      RAISE EXCEPTION 'Aparelho com status % não pode ser vendido', v_old;
    END IF;
    IF v_new = 'in_maintenance' AND v_old NOT IN ('available', 'awaiting_evaluation') THEN
      RAISE EXCEPTION 'Somente aparelhos disponíveis ou em avaliação podem ir para manutenção';
    END IF;
    -- Devolvido: só entra em avaliação a partir de "vendido" e só sai para estoque ou manutenção
    IF v_new = 'awaiting_evaluation' AND v_old <> 'sold' THEN
      RAISE EXCEPTION 'Somente aparelhos vendidos podem ser recebidos em devolução';
    END IF;
    IF v_old = 'awaiting_evaluation' AND v_new NOT IN ('available', 'in_maintenance', 'decommissioned') THEN
      RAISE EXCEPTION 'Aparelho aguardando avaliação não pode mudar para %', v_new;
    END IF;
  END IF;

  IF NEW.imei IS DISTINCT FROM OLD.imei AND v_old IN ('in_maintenance', 'sold', 'awaiting_evaluation') THEN
    RAISE EXCEPTION 'O IMEI não pode ser alterado com o aparelho em status %', v_old;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 9. FUNÇÕES TRANSACIONAIS

-- Receita da venda = itens ativos + valores retidos em devoluções parciais
CREATE OR REPLACE FUNCTION recalc_sale_totals(p_sale_id UUID)
RETURNS VOID AS $$
DECLARE
  v_subtotal NUMERIC; v_discount NUMERIC; v_cost NUMERIC; v_retained NUMERIC; v_gifts NUMERIC;
BEGIN
  SELECT COALESCE(SUM(unit_price * quantity), 0), COALESCE(SUM(discount * quantity), 0), COALESCE(SUM(unit_cost * quantity), 0)
    INTO v_subtotal, v_discount, v_cost
  FROM sale_items WHERE sale_id = p_sale_id AND returned_at IS NULL;

  SELECT COALESCE(SUM(retained_amount), 0) INTO v_retained FROM sale_adjustments WHERE sale_id = p_sale_id;
  SELECT COALESCE(SUM(unit_cost * quantity), 0) INTO v_gifts FROM sale_gifts WHERE sale_id = p_sale_id;

  UPDATE sales SET
    subtotal = v_subtotal,
    discount_amount = v_discount,
    total_amount = v_subtotal - v_discount + v_retained,
    total_cost = v_cost + v_gifts,
    gross_profit = v_subtotal - v_discount + v_retained - v_cost - v_gifts
  WHERE id = p_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aprovar / recusar / colocar em análise / cancelar
CREATE OR REPLACE FUNCTION update_return_status(
  p_tenant_id UUID, p_request_id UUID, p_user_id UUID, p_new_status TEXT,
  p_notes TEXT DEFAULT NULL, p_resolution TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_req return_requests%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT * INTO v_req FROM return_requests WHERE id = p_request_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  SELECT role::TEXT INTO v_role FROM profiles WHERE id = p_user_id;

  IF p_new_status = 'in_review' AND v_req.status <> 'open' THEN RAISE EXCEPTION 'Mudança de status não permitida.'; END IF;
  IF p_new_status IN ('approved', 'rejected') AND v_req.status NOT IN ('open', 'in_review') THEN RAISE EXCEPTION 'Mudança de status não permitida.'; END IF;
  IF p_new_status = 'cancelled' AND v_req.status NOT IN ('open', 'in_review', 'approved') THEN RAISE EXCEPTION 'Mudança de status não permitida.'; END IF;
  IF p_new_status NOT IN ('in_review', 'approved', 'rejected', 'cancelled') THEN RAISE EXCEPTION 'Status inválido.'; END IF;

  IF p_new_status <> 'cancelled' AND v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Somente administradores podem analisar, aprovar ou recusar solicitações.';
  END IF;
  IF p_new_status = 'cancelled' AND v_role NOT IN ('admin', 'super_admin') AND v_req.requested_by <> p_user_id THEN
    RAISE EXCEPTION 'Você só pode cancelar solicitações que registrou.';
  END IF;
  IF p_new_status IN ('rejected', 'cancelled') AND (p_notes IS NULL OR btrim(p_notes) = '') THEN
    RAISE EXCEPTION 'Informe o motivo da decisão.';
  END IF;

  UPDATE return_requests SET
    status = p_new_status,
    resolution = CASE WHEN p_new_status = 'approved' AND p_resolution IN ('exchange', 'refund', 'credit') THEN p_resolution ELSE resolution END
  WHERE id = v_req.id;

  INSERT INTO return_request_events (tenant_id, return_request_id, description, notes, user_id)
  VALUES (p_tenant_id, v_req.id, 'Status: ' || p_new_status, p_notes, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Concluir troca / reembolso / crédito (atômico; valida tudo antes de alterar)
CREATE OR REPLACE FUNCTION complete_return(
  p_tenant_id UUID,
  p_request_id UUID,
  p_user_id UUID,
  p_refund_amount NUMERIC DEFAULT NULL,
  p_refund_method payment_method DEFAULT NULL,
  p_credit_amount NUMERIC DEFAULT NULL,
  p_new_device_id UUID DEFAULT NULL,
  p_difference_method payment_method DEFAULT NULL,
  p_new_warranty_days INT DEFAULT NULL, -- NULL = mantém a vigência original; qualquer valor = nova garantia de 90 dias
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_req return_requests%ROWTYPE;
  v_item sale_items%ROWTYPE;
  v_sale sales%ROWTYPE;
  v_dev devices%ROWTYPE;
  v_new devices%ROWTYPE;
  v_old_w warranties%ROWTYPE;
  v_role TEXT;
  v_paid NUMERIC;
  v_amount NUMERIC;
  v_diff NUMERIC := 0;
  v_credit_id UUID;
  v_new_item_id UUID;
  v_new_w_id UUID;
  v_days INT;
  v_start DATE;
BEGIN
  SELECT role::TEXT INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Somente administradores podem concluir trocas e devoluções.';
  END IF;

  SELECT * INTO v_req FROM return_requests WHERE id = p_request_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF v_req.status <> 'approved' THEN RAISE EXCEPTION 'A solicitação precisa estar aprovada para ser concluída.'; END IF;

  SELECT * INTO v_sale FROM sales WHERE id = v_req.sale_id FOR UPDATE;
  SELECT * INTO v_item FROM sale_items WHERE id = v_req.sale_item_id FOR UPDATE;
  SELECT * INTO v_dev FROM devices WHERE id = v_req.device_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_sale.status <> 'completed' THEN RAISE EXCEPTION 'A venda original está cancelada.'; END IF;
  IF v_item.returned_at IS NOT NULL THEN RAISE EXCEPTION 'Este item já foi trocado ou devolvido.'; END IF;
  IF v_dev.status::TEXT <> 'sold' THEN RAISE EXCEPTION 'O aparelho original não consta como vendido.'; END IF;

  v_paid := v_item.total_price;
  SELECT * INTO v_old_w FROM warranties WHERE sale_item_id = v_item.id;

  IF v_req.resolution = 'refund' THEN
    v_amount := COALESCE(p_refund_amount, v_paid);
    IF v_amount <= 0 OR v_amount > v_paid THEN RAISE EXCEPTION 'Reembolso deve ser maior que zero e no máximo o valor pago.'; END IF;
    IF p_refund_method IS NULL THEN RAISE EXCEPTION 'Informe a forma de reembolso.'; END IF;
  ELSIF v_req.resolution = 'credit' THEN
    v_amount := COALESCE(p_credit_amount, v_paid);
    IF v_amount <= 0 OR v_amount > v_paid THEN RAISE EXCEPTION 'Crédito deve ser maior que zero e no máximo o valor pago.'; END IF;
  ELSE
    SELECT * INTO v_new FROM devices WHERE id = p_new_device_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Selecione o aparelho substituto.'; END IF;
    IF v_new.status::TEXT <> 'available' THEN RAISE EXCEPTION 'O aparelho substituto não está disponível.'; END IF;
    v_diff := v_new.suggested_price - v_paid;
    IF v_diff <> 0 AND p_difference_method IS NULL THEN RAISE EXCEPTION 'Informe a forma de acerto da diferença.'; END IF;
  END IF;

  -- Item sai da venda (devolução parcial: só este item)
  UPDATE sale_items SET returned_at = NOW(), return_request_id = v_req.id, return_type = v_req.resolution WHERE id = v_item.id;

  -- Aparelho volta a pertencer à loja, bloqueado até avaliação (mesmo registro, mesmo IMEI)
  UPDATE devices SET status = 'awaiting_evaluation'::device_status, sold_at = NULL, updated_at = NOW() WHERE id = v_dev.id;
  INSERT INTO device_movements (tenant_id, device_id, imei, movement_type, description, from_status, to_status, notes, user_id)
  VALUES (p_tenant_id, v_dev.id, v_dev.imei, 'returned_by_customer',
          'Devolvido pelo cliente. Propriedade retornou à loja; aguardando avaliação', 'sold', 'awaiting_evaluation', v_req.reason, p_user_id);

  IF v_req.resolution = 'refund' THEN
    INSERT INTO sale_adjustments (tenant_id, sale_id, return_request_id, type, amount, retained_amount, payment_method, description, created_by)
    VALUES (p_tenant_id, v_sale.id, v_req.id, 'refund', v_amount, v_paid - v_amount, p_refund_method, 'Reembolso de devolução', p_user_id);
    UPDATE return_requests SET refund_amount = v_amount, refund_method = p_refund_method WHERE id = v_req.id;

  ELSIF v_req.resolution = 'credit' THEN
    INSERT INTO customer_credits (tenant_id, customer_id, origin_sale_id, return_request_id, amount, balance)
    VALUES (p_tenant_id, v_req.customer_id, v_sale.id, v_req.id, v_amount, v_amount)
    RETURNING id INTO v_credit_id;
    INSERT INTO sale_adjustments (tenant_id, sale_id, return_request_id, type, amount, retained_amount, payment_method, description, created_by)
    VALUES (p_tenant_id, v_sale.id, v_req.id, 'credit', v_amount, v_paid - v_amount, 'store_credit'::payment_method, 'Crédito para compra futura', p_user_id);
    UPDATE return_requests SET credit_id = v_credit_id, credit_amount = v_amount WHERE id = v_req.id;

  ELSE
    v_days := 90; -- prazo fixo
    v_start := CASE WHEN p_new_warranty_days IS NULL THEN COALESCE(v_old_w.start_date, v_sale.created_at::date) ELSE CURRENT_DATE END;

    -- Novo aparelho entra na MESMA venda (sai o item antigo, entra o novo: sem receita duplicada)
    INSERT INTO sale_items (tenant_id, sale_id, item_type, device_id, quantity, unit_cost, unit_price, discount, total_price, warranty_days)
    VALUES (p_tenant_id, v_sale.id, 'device', v_new.id, 1,
            v_new.acquisition_cost + v_new.accumulated_repair_cost, v_new.suggested_price, 0, v_new.suggested_price, v_days)
    RETURNING id INTO v_new_item_id;

    UPDATE devices SET status = 'sold', sold_at = NOW(), updated_at = NOW() WHERE id = v_new.id;

    -- A trigger criou a garantia do novo item; ajusta-a para a regra escolhida e vincula à original
    UPDATE warranties SET
      warranty_days = v_days,
      start_date = v_start,
      end_date = CASE WHEN p_new_warranty_days IS NULL THEN COALESCE(v_old_w.end_date, v_start + v_days) ELSE v_start + v_days END,
      replaces_warranty_id = v_old_w.id
    WHERE sale_item_id = v_new_item_id
    RETURNING id INTO v_new_w_id;

    INSERT INTO warranty_events (tenant_id, warranty_id, description, user_id)
    VALUES (p_tenant_id, v_new_w_id,
            CASE WHEN p_new_warranty_days IS NULL
              THEN 'Garantia do aparelho substituto mantendo o prazo original (IMEI original ' || v_dev.imei || ')'
              ELSE 'Garantia do aparelho substituto com NOVO prazo comercial de ' || v_days || ' dias (IMEI original ' || v_dev.imei || ')' END,
            p_user_id);

    INSERT INTO sale_adjustments (tenant_id, sale_id, return_request_id, type, amount, retained_amount, payment_method, description, created_by)
    VALUES (p_tenant_id, v_sale.id, v_req.id, 'exchange_difference', -v_diff, 0, p_difference_method, 'Diferença de valores na troca', p_user_id);

    UPDATE return_requests SET
      new_device_id = v_new.id, new_device_price = v_new.suggested_price,
      difference_amount = v_diff, difference_method = p_difference_method
    WHERE id = v_req.id;
  END IF;

  -- Garantia original: preservada no histórico, encerrada administrativamente
  IF v_old_w.id IS NOT NULL THEN
    UPDATE warranties SET
      status = 'cancelled', cancelled_at = NOW(),
      cancel_reason = CASE v_req.resolution
        WHEN 'exchange' THEN 'Aparelho substituído em troca'
        WHEN 'refund' THEN 'Aparelho devolvido com reembolso'
        ELSE 'Aparelho devolvido com crédito' END,
      replaced_by_warranty_id = v_new_w_id
    WHERE id = v_old_w.id;
    INSERT INTO warranty_events (tenant_id, warranty_id, description, user_id)
    VALUES (p_tenant_id, v_old_w.id, 'Garantia cancelada por troca/devolução', p_user_id);
  END IF;

  PERFORM recalc_sale_totals(v_sale.id);

  UPDATE return_requests SET status = 'completed', completed_at = NOW(), device_destination = 'pending_evaluation' WHERE id = v_req.id;
  INSERT INTO return_request_events (tenant_id, return_request_id, description, notes, user_id)
  VALUES (p_tenant_id, v_req.id, 'Solicitação concluída', p_notes, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Avaliação do aparelho devolvido: estoque ou Assistência Interna (mesmo aparelho, mesmo IMEI)
CREATE OR REPLACE FUNCTION resolve_returned_device(
  p_tenant_id UUID, p_request_id UUID, p_user_id UUID,
  p_destination TEXT, p_defect TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_req return_requests%ROWTYPE;
  v_dev devices%ROWTYPE;
  v_role TEXT;
  v_os_id UUID;
BEGIN
  SELECT role::TEXT INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Somente administradores podem definir o destino do aparelho.';
  END IF;

  SELECT * INTO v_req FROM return_requests WHERE id = p_request_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_req.status <> 'completed' OR v_req.device_destination <> 'pending_evaluation' THEN
    RAISE EXCEPTION 'Este aparelho não está aguardando avaliação.';
  END IF;

  SELECT * INTO v_dev FROM devices WHERE id = v_req.device_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_dev.status::TEXT <> 'awaiting_evaluation' THEN RAISE EXCEPTION 'O aparelho não está aguardando avaliação.'; END IF;

  UPDATE devices SET status = 'available', updated_at = NOW() WHERE id = v_dev.id;

  IF p_destination = 'assistance' THEN
    IF p_defect IS NULL OR btrim(p_defect) = '' THEN RAISE EXCEPTION 'Informe o defeito para abrir a assistência interna.'; END IF;
    v_os_id := send_device_to_assistance(p_tenant_id, v_dev.id, p_user_id, p_defect, p_notes);
    UPDATE return_requests SET device_destination = 'sent_to_assistance', service_order_id = v_os_id WHERE id = v_req.id;
  ELSIF p_destination = 'stock' THEN
    INSERT INTO device_movements (tenant_id, device_id, imei, movement_type, description, from_status, to_status, notes, user_id)
    VALUES (p_tenant_id, v_dev.id, v_dev.imei, 'return_released_to_stock',
            'Avaliado e liberado para o estoque disponível', 'awaiting_evaluation', 'available', p_notes, p_user_id);
    UPDATE return_requests SET device_destination = 'returned_to_stock' WHERE id = v_req.id;
  ELSE
    RAISE EXCEPTION 'Destino inválido.';
  END IF;

  INSERT INTO return_request_events (tenant_id, return_request_id, description, notes, user_id)
  VALUES (p_tenant_id, v_req.id, 'Aparelho avaliado: ' || p_destination, p_notes, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Uso do crédito em uma venda futura (do mais antigo para o mais novo; nunca negativo)
CREATE OR REPLACE FUNCTION consume_customer_credit(
  p_tenant_id UUID, p_customer_id UUID, p_amount NUMERIC, p_sale_id UUID
)
RETURNS VOID AS $$
DECLARE
  v_credit customer_credits%ROWTYPE;
  v_remaining NUMERIC := p_amount;
  v_used NUMERIC;
BEGIN
  IF p_amount <= 0 THEN RETURN; END IF;

  FOR v_credit IN
    SELECT * FROM customer_credits
    WHERE tenant_id = p_tenant_id AND customer_id = p_customer_id AND balance > 0
    ORDER BY created_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_used := LEAST(v_remaining, v_credit.balance);
    UPDATE customer_credits SET balance = balance - v_used WHERE id = v_credit.id;
    INSERT INTO customer_credit_usages (tenant_id, credit_id, sale_id, amount) VALUES (p_tenant_id, v_credit.id, p_sale_id, v_used);
    v_remaining := v_remaining - v_used;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'O crédito informado é maior que o saldo disponível do cliente.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RLS
ALTER TABLE warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_credit_usages ENABLE ROW LEVEL SECURITY;

-- Garantias: toda a equipe da loja consulta; só o Admin altera (personalização de prazo)
DROP POLICY IF EXISTS tenant_view_warranties ON warranties;
CREATE POLICY tenant_view_warranties ON warranties
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS admin_manage_warranties ON warranties;
CREATE POLICY admin_manage_warranties ON warranties
  FOR ALL TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin())
  WITH CHECK ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

DROP POLICY IF EXISTS tenant_view_warranty_events ON warranty_events;
CREATE POLICY tenant_view_warranty_events ON warranty_events
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

-- Solicitações: a equipe consulta e registra (sempre como "aberta"); decisões só pelas funções acima
DROP POLICY IF EXISTS tenant_view_return_requests ON return_requests;
CREATE POLICY tenant_view_return_requests ON return_requests
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS tenant_open_return_requests ON return_requests;
CREATE POLICY tenant_open_return_requests ON return_requests
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_auth_tenant_id() AND requested_by = auth.uid() AND status = 'open');

DROP POLICY IF EXISTS tenant_view_return_events ON return_request_events;
CREATE POLICY tenant_view_return_events ON return_request_events
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

-- Ajustes de receita: somente Admin (informação financeira)
DROP POLICY IF EXISTS admin_view_sale_adjustments ON sale_adjustments;
CREATE POLICY admin_view_sale_adjustments ON sale_adjustments
  FOR SELECT TO authenticated
  USING ((tenant_id = get_auth_tenant_id() AND get_auth_role() = 'admin') OR is_super_admin());

-- Créditos: a equipe consulta o saldo para usar no PDV; alterações só pelas funções
DROP POLICY IF EXISTS tenant_view_customer_credits ON customer_credits;
CREATE POLICY tenant_view_customer_credits ON customer_credits
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

DROP POLICY IF EXISTS tenant_view_credit_usages ON customer_credit_usages;
CREATE POLICY tenant_view_credit_usages ON customer_credit_usages
  FOR SELECT TO authenticated
  USING (tenant_id = get_auth_tenant_id() OR is_super_admin());

-- 11. TEMPO REAL
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE warranties; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE return_requests; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE customer_credits; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE sale_items; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
