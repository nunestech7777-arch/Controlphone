-- ============================================================================
-- CONTROLPHONE — ESTOQUE x ASSISTÊNCIA: ORIGEM DO APARELHO DETERMINA O DESTINO
--   INTERNA : aparelho da loja  -> manutenção -> volta ao ESTOQUE
--   EXTERNA : aparelho do cliente -> manutenção -> volta ao CLIENTE
-- Pré-requisitos: migrations 01, 02, 03 (e 04 para fornecedores).
-- Reaproveita: service_orders, internal_repairs, devices, sale_items.
-- ============================================================================

-- 1. NOVO STATUS "MANUTENÇÃO CONCLUÍDA"
-- (somente referenciado em corpos de função; não é usado em DDL desta migration)
ALTER TYPE os_status ADD VALUE IF NOT EXISTS 'repair_completed';

-- 2. SERVICE_ORDERS: ORIGEM, VÍNCULO COM O APARELHO E DADOS DE CONCLUSÃO
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS origin VARCHAR(10) NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES devices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS device_storage VARCHAR(50),
  ADD COLUMN IF NOT EXISTS device_color VARCHAR(50),
  ADD COLUMN IF NOT EXISTS entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS service_performed TEXT,
  ADD COLUMN IF NOT EXISTS parts_used TEXT,
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(10),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ; -- preenchido quando a OS deixa de estar ativa

-- Assistência interna não possui cliente (o proprietário é a loja)
ALTER TABLE service_orders ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_origin_check;
ALTER TABLE service_orders ADD CONSTRAINT service_orders_origin_check CHECK (
  (origin = 'external' AND customer_id IS NOT NULL AND device_id IS NULL)
  OR
  (origin = 'internal' AND device_id IS NOT NULL AND customer_id IS NULL)
);

ALTER TABLE service_orders DROP CONSTRAINT IF EXISTS service_orders_payment_status_check;
ALTER TABLE service_orders ADD CONSTRAINT service_orders_payment_status_check
  CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid'));

-- Impede duas assistências internas ATIVAS para o mesmo aparelho
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_internal_assistance_per_device
  ON service_orders (device_id)
  WHERE origin = 'internal' AND closed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_origin
  ON service_orders (tenant_id, origin, created_at DESC);

-- 3. INTERNAL_REPAIRS: LIGAÇÃO COM A OS (CADA MANUTENÇÃO É REGISTRADA INDIVIDUALMENTE)
ALTER TABLE internal_repairs
  ADD COLUMN IF NOT EXISTS service_order_id UUID REFERENCES service_orders(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_repair_per_order
  ON internal_repairs (service_order_id) WHERE service_order_id IS NOT NULL;

-- 4. HISTÓRICO / RASTREABILIDADE DE MOVIMENTAÇÕES
CREATE TABLE IF NOT EXISTS device_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  device_id UUID REFERENCES devices(id) ON DELETE RESTRICT,           -- nulo em assistência externa
  service_order_id UUID REFERENCES service_orders(id) ON DELETE RESTRICT,
  imei VARCHAR(50),
  movement_type VARCHAR(40) NOT NULL,
  description TEXT NOT NULL,
  from_status VARCHAR(40),
  to_status VARCHAR(40),
  cost NUMERIC(12, 2),
  notes TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_device_movements_device ON device_movements (tenant_id, device_id, created_at);
CREATE INDEX IF NOT EXISTS idx_device_movements_order ON device_movements (tenant_id, service_order_id, created_at);

-- 5. REGRA DE TRANSIÇÃO DE STATUS DO APARELHO (vale para qualquer caminho de escrita)
CREATE OR REPLACE FUNCTION guard_device_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Aparelho em manutenção só volta ao estoque (ou é baixado); nunca é vendido direto
    IF OLD.status = 'in_maintenance' AND NEW.status NOT IN ('available', 'decommissioned') THEN
      RAISE EXCEPTION 'Aparelho em manutenção não pode mudar para %', NEW.status;
    END IF;
    -- Somente aparelho disponível (ou reservado) pode ser vendido
    IF NEW.status = 'sold' AND OLD.status NOT IN ('available', 'reserved') THEN
      RAISE EXCEPTION 'Aparelho com status % não pode ser vendido', OLD.status;
    END IF;
    -- Somente aparelho disponível pode ir para manutenção
    IF NEW.status = 'in_maintenance' AND OLD.status <> 'available' THEN
      RAISE EXCEPTION 'Somente aparelhos disponíveis podem ser enviados para manutenção';
    END IF;
  END IF;

  -- IMEI é imutável enquanto o aparelho está em manutenção ou foi vendido
  IF NEW.imei IS DISTINCT FROM OLD.imei AND OLD.status IN ('in_maintenance', 'sold') THEN
    RAISE EXCEPTION 'O IMEI não pode ser alterado com o aparelho em status %', OLD.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_device_status ON devices;
CREATE TRIGGER trg_guard_device_status
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION guard_device_status_transition();

-- 6. FUNÇÕES TRANSACIONAIS (cada uma é atômica: falhou = nada alterado)

-- 6.1 Aparelho do estoque -> Assistência Interna
CREATE OR REPLACE FUNCTION send_device_to_assistance(
  p_tenant_id UUID,
  p_device_id UUID,
  p_user_id UUID,
  p_defect TEXT,
  p_notes TEXT DEFAULT NULL,
  p_diagnosis TEXT DEFAULT NULL,
  p_entered_at TIMESTAMPTZ DEFAULT NOW(),
  p_start_maintenance BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_device devices%ROWTYPE;
  v_os_id UUID;
BEGIN
  IF p_defect IS NULL OR btrim(p_defect) = '' THEN
    RAISE EXCEPTION 'Informe o defeito apresentado.';
  END IF;

  SELECT * INTO v_device FROM devices
  WHERE id = p_device_id AND tenant_id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aparelho não encontrado.';
  END IF;
  IF v_device.status <> 'available' THEN
    RAISE EXCEPTION 'Somente aparelhos disponíveis no estoque podem ser enviados para a assistência.';
  END IF;

  INSERT INTO service_orders (
    tenant_id, origin, device_id, customer_id, intake_seller_id,
    device_brand, device_model, device_storage, device_color, imei,
    reported_defect, physical_condition, technician_diagnosis,
    status, entered_at
  ) VALUES (
    p_tenant_id, 'internal', v_device.id, NULL, p_user_id,
    v_device.brand, v_device.model, v_device.storage_capacity, v_device.color, v_device.imei,
    btrim(p_defect), p_notes, p_diagnosis,
    CASE WHEN p_start_maintenance THEN 'in_maintenance'::os_status ELSE 'waiting_diagnosis'::os_status END,
    COALESCE(p_entered_at, NOW())
  ) RETURNING id INTO v_os_id;

  INSERT INTO internal_repairs (tenant_id, device_id, technician_id, issue_description, service_order_id)
  VALUES (p_tenant_id, v_device.id, p_user_id, btrim(p_defect), v_os_id);

  UPDATE devices SET status = 'in_maintenance', updated_at = NOW() WHERE id = v_device.id;

  INSERT INTO device_movements (
    tenant_id, device_id, service_order_id, imei, movement_type, description,
    from_status, to_status, notes, user_id
  ) VALUES (
    p_tenant_id, v_device.id, v_os_id, v_device.imei, 'sent_to_assistance',
    'Enviado para assistência interna', 'available', 'in_maintenance', btrim(p_defect), p_user_id
  );

  RETURN v_os_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.2 Aparelho de cliente -> Assistência Externa (não cria aparelho no estoque)
CREATE OR REPLACE FUNCTION create_external_assistance(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_user_id UUID,
  p_brand VARCHAR,
  p_model VARCHAR,
  p_storage VARCHAR,
  p_color VARCHAR,
  p_imei VARCHAR,
  p_defect TEXT,
  p_diagnosis TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_entered_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS UUID AS $$
DECLARE
  v_os_id UUID;
  v_stock devices%ROWTYPE;
BEGIN
  IF p_defect IS NULL OR btrim(p_defect) = '' OR p_model IS NULL OR btrim(p_model) = '' THEN
    RAISE EXCEPTION 'Informe o modelo e o defeito apresentado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM customers WHERE id = p_customer_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Cliente não encontrado.';
  END IF;

  IF p_imei IS NOT NULL AND btrim(p_imei) <> '' THEN
    SELECT * INTO v_stock FROM devices WHERE tenant_id = p_tenant_id AND imei = btrim(p_imei);
    IF FOUND AND v_stock.status <> 'sold' THEN
      RAISE EXCEPTION 'Este IMEI pertence a um aparelho do estoque da loja. Use a Assistência Interna.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM service_orders
      WHERE tenant_id = p_tenant_id AND origin = 'external' AND imei = btrim(p_imei) AND closed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Já existe uma assistência externa ativa para este IMEI.';
    END IF;
  END IF;

  INSERT INTO service_orders (
    tenant_id, origin, device_id, customer_id, intake_seller_id,
    device_brand, device_model, device_storage, device_color, imei,
    reported_defect, technician_diagnosis, physical_condition,
    status, entered_at
  ) VALUES (
    p_tenant_id, 'external', NULL, p_customer_id, p_user_id,
    COALESCE(NULLIF(btrim(p_brand), ''), 'Apple'), btrim(p_model), p_storage, p_color, NULLIF(btrim(p_imei), ''),
    btrim(p_defect), p_diagnosis, p_notes,
    'waiting_diagnosis', COALESCE(p_entered_at, NOW())
  ) RETURNING id INTO v_os_id;

  INSERT INTO device_movements (
    tenant_id, service_order_id, imei, movement_type, description, to_status, notes, user_id
  ) VALUES (
    p_tenant_id, v_os_id, NULLIF(btrim(p_imei), ''), 'external_received',
    'Aparelho recebido do cliente', 'waiting_diagnosis', btrim(p_defect), p_user_id
  );

  RETURN v_os_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.3 Em manutenção / aguardando peça
CREATE OR REPLACE FUNCTION update_assistance_status(
  p_tenant_id UUID,
  p_os_id UUID,
  p_user_id UUID,
  p_new_status TEXT
)
RETURNS VOID AS $$
DECLARE
  v_os service_orders%ROWTYPE;
  v_from TEXT;
BEGIN
  IF p_new_status NOT IN ('in_maintenance', 'waiting_parts') THEN
    RAISE EXCEPTION 'Status inválido.';
  END IF;

  SELECT * INTO v_os FROM service_orders WHERE id = p_os_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de serviço não encontrada.'; END IF;
  IF v_os.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Esta ordem de serviço já foi encerrada.'; END IF;

  v_from := v_os.status::TEXT;

  IF p_new_status = 'in_maintenance' AND v_from NOT IN ('waiting_diagnosis', 'in_diagnosis', 'waiting_parts') THEN
    RAISE EXCEPTION 'Mudança de status não permitida a partir de %', v_from;
  END IF;
  IF p_new_status = 'waiting_parts' AND v_from <> 'in_maintenance' THEN
    RAISE EXCEPTION 'Mudança de status não permitida a partir de %', v_from;
  END IF;

  UPDATE service_orders SET status = p_new_status::os_status, updated_at = NOW() WHERE id = v_os.id;

  INSERT INTO device_movements (
    tenant_id, device_id, service_order_id, imei, movement_type, description, from_status, to_status, user_id
  ) VALUES (
    p_tenant_id, v_os.device_id, v_os.id, v_os.imei,
    CASE WHEN p_new_status = 'waiting_parts' THEN 'assistance_waiting_parts' ELSE 'assistance_started' END,
    CASE WHEN p_new_status = 'waiting_parts' THEN 'Aguardando peça' ELSE 'Manutenção iniciada/retomada' END,
    v_from, p_new_status, p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.4 CONCLUIR E DEVOLVER AO ESTOQUE (somente assistência INTERNA)
CREATE OR REPLACE FUNCTION complete_internal_assistance(
  p_tenant_id UUID,
  p_os_id UUID,
  p_user_id UUID,
  p_service_done TEXT,
  p_parts_used TEXT,
  p_parts_cost NUMERIC,
  p_service_cost NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_os service_orders%ROWTYPE;
  v_device devices%ROWTYPE;
  v_total NUMERIC;
BEGIN
  IF p_service_done IS NULL OR btrim(p_service_done) = '' THEN
    RAISE EXCEPTION 'Registre o serviço realizado.';
  END IF;
  IF COALESCE(p_parts_cost, 0) < 0 OR COALESCE(p_service_cost, 0) < 0 THEN
    RAISE EXCEPTION 'Os custos não podem ser negativos.';
  END IF;

  SELECT * INTO v_os FROM service_orders WHERE id = p_os_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de serviço não encontrada.'; END IF;
  IF v_os.origin <> 'internal' OR v_os.device_id IS NULL THEN
    RAISE EXCEPTION 'Somente assistências internas podem devolver o aparelho ao estoque.';
  END IF;
  IF v_os.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Esta assistência já foi concluída.'; END IF;
  IF v_os.status::TEXT = 'waiting_parts' THEN
    RAISE EXCEPTION 'O aparelho ainda está aguardando peça e não pode voltar ao estoque.';
  END IF;
  IF v_os.status::TEXT <> 'in_maintenance' THEN
    RAISE EXCEPTION 'Inicie a manutenção antes de concluir a assistência.';
  END IF;

  SELECT * INTO v_device FROM devices WHERE id = v_os.device_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_device.status <> 'in_maintenance' THEN
    RAISE EXCEPTION 'O aparelho não está em manutenção.';
  END IF;

  v_total := COALESCE(p_parts_cost, 0) + COALESCE(p_service_cost, 0);

  UPDATE service_orders SET
    status = 'repair_completed'::os_status,
    technician_parts_cost = COALESCE(p_parts_cost, 0),
    technician_service_cost = COALESCE(p_service_cost, 0),
    service_performed = btrim(p_service_done),
    parts_used = NULLIF(btrim(COALESCE(p_parts_used, '')), ''),
    completed_at = NOW(),
    closed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_os.id;

  UPDATE internal_repairs SET
    status = 'completed', diagnosis = btrim(p_service_done),
    parts_used = NULLIF(btrim(COALESCE(p_parts_used, '')), ''),
    repair_cost = v_total, completed_at = NOW()
  WHERE service_order_id = v_os.id AND status = 'in_progress';

  -- Custo original preservado; manutenção somada ao custo acumulado; data de entrada intacta
  UPDATE devices SET
    accumulated_repair_cost = accumulated_repair_cost + v_total,
    status = 'available',
    updated_at = NOW()
  WHERE id = v_device.id;

  INSERT INTO device_movements (
    tenant_id, device_id, service_order_id, imei, movement_type, description,
    from_status, to_status, cost, notes, user_id
  ) VALUES
    (p_tenant_id, v_device.id, v_os.id, v_device.imei, 'assistance_completed',
     'Manutenção concluída', 'in_maintenance', 'repair_completed', v_total, p_notes, p_user_id),
    (p_tenant_id, v_device.id, v_os.id, v_device.imei, 'returned_to_stock',
     'Aparelho retornou ao estoque disponível', 'in_maintenance', 'available',
     v_device.accumulated_repair_cost + v_total, NULL, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.5 CONCLUIR MANUTENÇÃO EXTERNA (nunca vai para o estoque)
CREATE OR REPLACE FUNCTION complete_external_assistance(
  p_tenant_id UUID,
  p_os_id UUID,
  p_user_id UUID,
  p_service_done TEXT,
  p_parts_used TEXT,
  p_parts_cost NUMERIC,
  p_service_cost NUMERIC,
  p_charged_amount NUMERIC,
  p_payment_status TEXT,
  p_payment_method payment_method DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_os service_orders%ROWTYPE;
BEGIN
  IF p_service_done IS NULL OR btrim(p_service_done) = '' THEN
    RAISE EXCEPTION 'Registre o serviço realizado.';
  END IF;
  IF COALESCE(p_parts_cost, 0) < 0 OR COALESCE(p_service_cost, 0) < 0 OR COALESCE(p_charged_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Os valores não podem ser negativos.';
  END IF;
  IF p_payment_status NOT IN ('pending', 'paid') THEN
    RAISE EXCEPTION 'Situação de pagamento inválida.';
  END IF;
  IF p_payment_status = 'paid' AND p_payment_method IS NULL THEN
    RAISE EXCEPTION 'Informe a forma de pagamento.';
  END IF;

  SELECT * INTO v_os FROM service_orders WHERE id = p_os_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de serviço não encontrada.'; END IF;
  IF v_os.origin <> 'external' THEN RAISE EXCEPTION 'Esta ação é exclusiva de assistências externas.'; END IF;
  IF v_os.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Esta assistência já foi encerrada.'; END IF;
  IF v_os.status::TEXT <> 'in_maintenance' THEN
    RAISE EXCEPTION 'A manutenção precisa estar em andamento para ser concluída.';
  END IF;

  UPDATE service_orders SET
    status = 'ready_for_pickup'::os_status,
    technician_parts_cost = COALESCE(p_parts_cost, 0),
    technician_service_cost = COALESCE(p_service_cost, 0),
    client_quote_amount = p_charged_amount,
    service_performed = btrim(p_service_done),
    parts_used = NULLIF(btrim(COALESCE(p_parts_used, '')), ''),
    payment_status = p_payment_status,
    payment_method = CASE WHEN p_payment_status = 'paid' THEN p_payment_method ELSE NULL END,
    paid_amount = CASE WHEN p_payment_status = 'paid' THEN p_charged_amount ELSE NULL END,
    completed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_os.id;

  INSERT INTO device_movements (
    tenant_id, service_order_id, imei, movement_type, description, from_status, to_status, cost, user_id
  ) VALUES (
    p_tenant_id, v_os.id, v_os.imei, 'external_completed',
    'Manutenção concluída. Aguardando retirada', 'in_maintenance', 'ready_for_pickup', p_charged_amount, p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.6 ENTREGAR AO CLIENTE (encerra a OS externa; recebimento lançado uma única vez)
CREATE OR REPLACE FUNCTION deliver_external_assistance(
  p_tenant_id UUID,
  p_os_id UUID,
  p_user_id UUID,
  p_payment_method payment_method DEFAULT NULL,
  p_paid_amount NUMERIC DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_os service_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_os FROM service_orders WHERE id = p_os_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de serviço não encontrada.'; END IF;
  IF v_os.origin <> 'external' THEN
    RAISE EXCEPTION 'Aparelhos internos não são entregues a clientes.';
  END IF;
  IF v_os.closed_at IS NOT NULL OR v_os.status::TEXT <> 'ready_for_pickup' THEN
    RAISE EXCEPTION 'Esta ordem não está aguardando retirada ou já foi entregue.';
  END IF;
  IF COALESCE(v_os.payment_status, 'pending') <> 'paid' THEN
    IF p_payment_method IS NULL OR p_paid_amount IS NULL OR p_paid_amount < 0 THEN
      RAISE EXCEPTION 'Informe o valor recebido e a forma de pagamento.';
    END IF;
  END IF;

  UPDATE service_orders SET
    status = 'delivered'::os_status,
    payment_status = 'paid',
    payment_method = CASE WHEN v_os.payment_status = 'paid' THEN v_os.payment_method ELSE p_payment_method END,
    paid_amount = CASE WHEN v_os.payment_status = 'paid' THEN v_os.paid_amount ELSE p_paid_amount END,
    received_by_seller_id = COALESCE(v_os.received_by_seller_id, p_user_id),
    delivered_by_seller_id = p_user_id,
    delivered_at = NOW(),
    closed_at = NOW(),
    updated_at = NOW()
  WHERE id = v_os.id;

  INSERT INTO device_movements (
    tenant_id, service_order_id, imei, movement_type, description, from_status, to_status, cost, user_id
  ) VALUES (
    p_tenant_id, v_os.id, v_os.imei, 'external_delivered',
    'Aparelho entregue ao proprietário', 'ready_for_pickup', 'delivered',
    COALESCE(v_os.paid_amount, p_paid_amount), p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.7 CANCELAR ASSISTÊNCIA (interna: aparelho volta ao estoque sem custo)
CREATE OR REPLACE FUNCTION cancel_assistance(
  p_tenant_id UUID,
  p_os_id UUID,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_os service_orders%ROWTYPE;
  v_from TEXT;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;

  SELECT * INTO v_os FROM service_orders WHERE id = p_os_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de serviço não encontrada.'; END IF;
  IF v_os.closed_at IS NOT NULL OR v_os.status::TEXT IN ('ready_for_pickup', 'delivered', 'cancelled', 'repair_completed') THEN
    RAISE EXCEPTION 'Esta ordem de serviço não pode mais ser cancelada.';
  END IF;

  v_from := v_os.status::TEXT;

  IF v_os.origin = 'internal' THEN
    UPDATE devices SET status = 'available', updated_at = NOW()
    WHERE id = v_os.device_id AND tenant_id = p_tenant_id AND status = 'in_maintenance';

    UPDATE internal_repairs SET
      status = 'completed', repair_cost = 0, completed_at = NOW(),
      diagnosis = 'Assistência cancelada: ' || btrim(p_reason)
    WHERE service_order_id = v_os.id AND status = 'in_progress';
  END IF;

  UPDATE service_orders SET status = 'cancelled'::os_status, closed_at = NOW(), updated_at = NOW()
  WHERE id = v_os.id;

  INSERT INTO device_movements (
    tenant_id, device_id, service_order_id, imei, movement_type, description, from_status, to_status, notes, user_id
  ) VALUES (
    p_tenant_id, v_os.device_id, v_os.id, v_os.imei, 'assistance_cancelled',
    CASE WHEN v_os.origin = 'internal'
      THEN 'Assistência cancelada: aparelho devolvido ao estoque'
      ELSE 'Assistência cancelada' END,
    v_from, 'cancelled', btrim(p_reason), p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6.8 A função legada da migration 03 não pode mais concluir reparo ligado a uma OS
-- (evita contabilizar o mesmo custo duas vezes e pular o fluxo de devolução)
CREATE OR REPLACE FUNCTION complete_internal_repair(
  p_tenant_id UUID,
  p_repair_id UUID,
  p_repair_cost NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_repair internal_repairs%ROWTYPE;
BEGIN
  SELECT * INTO v_repair FROM internal_repairs
  WHERE id = p_repair_id AND tenant_id = p_tenant_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Manutenção não encontrada!'; END IF;
  IF v_repair.status <> 'in_progress' THEN RAISE EXCEPTION 'Esta manutenção já foi concluída.'; END IF;
  IF v_repair.service_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Use complete_internal_assistance para concluir manutenções vinculadas a uma OS.';
  END IF;

  UPDATE internal_repairs
  SET repair_cost = p_repair_cost, status = 'completed', completed_at = NOW()
  WHERE id = p_repair_id;

  UPDATE devices
  SET accumulated_repair_cost = accumulated_repair_cost + p_repair_cost,
      status = 'available',
      updated_at = NOW()
  WHERE id = v_repair.device_id AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. REGISTRAR VENDA/CANCELAMENTO NO HISTÓRICO DO APARELHO
CREATE OR REPLACE FUNCTION log_device_sale_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sold' THEN
      INSERT INTO device_movements (tenant_id, device_id, imei, movement_type, description, from_status, to_status)
      VALUES (NEW.tenant_id, NEW.id, NEW.imei, 'sold', 'Aparelho vendido', OLD.status::TEXT, 'sold');
    ELSIF OLD.status = 'sold' AND NEW.status = 'available' THEN
      INSERT INTO device_movements (tenant_id, device_id, imei, movement_type, description, from_status, to_status)
      VALUES (NEW.tenant_id, NEW.id, NEW.imei, 'sale_cancelled', 'Venda cancelada: aparelho devolvido ao estoque', 'sold', 'available');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_device_sale ON devices;
CREATE TRIGGER trg_log_device_sale
  AFTER UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION log_device_sale_movement();

-- 8. RLS
ALTER TABLE device_movements ENABLE ROW LEVEL SECURITY;

-- Histórico expõe custos: somente Admin e Técnico da loja (e Super Admin). Escrita só via funções acima.
DROP POLICY IF EXISTS staff_view_device_movements ON device_movements;
CREATE POLICY staff_view_device_movements ON device_movements
  FOR SELECT TO authenticated
  USING (
    (tenant_id = get_auth_tenant_id() AND get_auth_role() IN ('admin', 'technician'))
    OR is_super_admin()
  );

-- Assistência interna carrega custos de aquisição/reparo: vendedor só enxerga OS externas
DROP POLICY IF EXISTS tenant_isolation_service_orders ON service_orders;
CREATE POLICY tenant_isolation_service_orders ON service_orders
  FOR ALL TO authenticated
  USING (
    (tenant_id = get_auth_tenant_id() AND (origin = 'external' OR get_auth_role() IN ('admin', 'technician')))
    OR is_super_admin()
  )
  WITH CHECK (
    (tenant_id = get_auth_tenant_id() AND (origin = 'external' OR get_auth_role() IN ('admin', 'technician')))
    OR is_super_admin()
  );

-- 9. TEMPO REAL: estoque, assistência e histórico atualizam sem recarregar a página
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE devices; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE service_orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE device_movements; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
