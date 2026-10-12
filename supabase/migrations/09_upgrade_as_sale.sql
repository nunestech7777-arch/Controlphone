-- ============================================================================
-- CONTROLPHONE — UPGRADE COMO MODALIDADE DE VENDA
-- Um upgrade passa a gerar uma venda normal (mesma numeração, comprovante, garantia,
-- histórico, auditoria e cancelamento). O aparelho recebido entra como parte do pagamento.
-- Pré-requisitos: migrations 01, 03, 05 e 07.
-- ============================================================================

ALTER TABLE sales ADD COLUMN IF NOT EXISTS trade_in_id UUID REFERENCES trade_ins(id) ON DELETE RESTRICT;
ALTER TABLE trade_ins ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES sales(id) ON DELETE RESTRICT;

-- Um upgrade corresponde a uma única venda (e vice-versa)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sale_per_trade_in ON sales (trade_in_id) WHERE trade_in_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_trade_in_per_sale ON trade_ins (sale_id) WHERE sale_id IS NOT NULL;

-- Upgrades antigos (sem venda) viram vendas normais, na ordem em que aconteceram.
-- A garantia é emitida pelo trigger de sale_items (migration 07).
DO $$
DECLARE
  t RECORD;
  v_sale_id UUID;
  v_cost NUMERIC;
  v_credit NUMERIC;
  v_diff NUMERIC;
BEGIN
  FOR t IN SELECT * FROM trade_ins WHERE sale_id IS NULL ORDER BY created_at LOOP
    SELECT acquisition_cost + accumulated_repair_cost INTO v_cost FROM devices WHERE id = t.sold_device_id;
    v_credit := LEAST(t.appraisal_value, t.sold_device_price);
    v_diff := t.sold_device_price - v_credit;

    INSERT INTO sales (tenant_id, seller_id, customer_id, sales_origin, subtotal, discount_amount,
                       total_amount, total_cost, gross_profit, status, trade_in_id, created_at)
    VALUES (t.tenant_id, t.seller_id, t.customer_id, 'Não informada', t.sold_device_price, 0,
            t.sold_device_price, COALESCE(v_cost, 0), t.sold_device_price - COALESCE(v_cost, 0),
            CASE WHEN t.status = 'cancelled' THEN 'cancelled' ELSE 'completed' END, t.id, t.created_at)
    RETURNING id INTO v_sale_id;

    INSERT INTO sale_items (tenant_id, sale_id, item_type, device_id, quantity, unit_cost, unit_price, discount, total_price)
    VALUES (t.tenant_id, v_sale_id, 'device', t.sold_device_id, 1, COALESCE(v_cost, 0), t.sold_device_price, 0, t.sold_device_price);

    IF v_credit > 0 THEN
      INSERT INTO sale_payments (tenant_id, sale_id, payment_method, amount, installments)
      VALUES (t.tenant_id, v_sale_id, 'trade_in_credit', v_credit, 1);
    END IF;
    IF v_diff > 0 THEN
      INSERT INTO sale_payments (tenant_id, sale_id, payment_method, amount, installments)
      VALUES (t.tenant_id, v_sale_id, t.payment_method, v_diff, 1);
    END IF;

    UPDATE trade_ins SET sale_id = v_sale_id WHERE id = t.id;
  END LOOP;
END $$;

-- UPGRADE: cria a venda normal, baixa o aparelho vendido e dá entrada no recebido (atômico)
CREATE OR REPLACE FUNCTION process_trade_in_sale(
  p_tenant_id UUID,
  p_customer_id UUID,
  p_seller_id UUID,
  p_sold_device_id UUID,
  p_sold_device_price NUMERIC,
  p_received_imei VARCHAR,
  p_received_brand VARCHAR,
  p_received_model VARCHAR,
  p_received_storage VARCHAR,
  p_received_color VARCHAR,
  p_received_battery_health INT,
  p_received_notes TEXT,
  p_appraisal_value NUMERIC,
  p_payment_method payment_method,
  p_sales_origin VARCHAR DEFAULT 'Não informada'
)
RETURNS UUID AS $$
DECLARE
  v_sold devices%ROWTYPE;
  v_trade_in_id UUID;
  v_received_id UUID;
  v_sale_id UUID;
  v_cost NUMERIC;
  v_credit NUMERIC;
  v_diff NUMERIC;
BEGIN
  IF p_sold_device_price <= 0 OR p_appraisal_value < 0 THEN
    RAISE EXCEPTION 'Informe valores válidos para o aparelho vendido e para a avaliação.';
  END IF;

  SELECT * INTO v_sold FROM devices WHERE id = p_sold_device_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND OR v_sold.status::TEXT <> 'available' THEN
    RAISE EXCEPTION 'O aparelho do upgrade não está disponível para venda.';
  END IF;
  IF EXISTS (SELECT 1 FROM devices WHERE tenant_id = p_tenant_id AND imei = p_received_imei) THEN
    RAISE EXCEPTION 'Já existe um aparelho cadastrado com o IMEI do aparelho recebido.';
  END IF;

  v_cost := v_sold.acquisition_cost + v_sold.accumulated_repair_cost;
  v_credit := LEAST(p_appraisal_value, p_sold_device_price);
  v_diff := p_sold_device_price - v_credit;

  -- Aparelho recebido entra no estoque com custo = avaliação
  INSERT INTO devices (
    tenant_id, imei, brand, model, storage_capacity, color, battery_health,
    physical_condition_notes, origin, acquisition_cost, accumulated_repair_cost,
    suggested_price, status, entry_date
  ) VALUES (
    p_tenant_id, p_received_imei, p_received_brand, p_received_model, p_received_storage, p_received_color,
    p_received_battery_health, p_received_notes, 'trade_in', p_appraisal_value, 0,
    ROUND(p_appraisal_value * 1.35, 2), 'available', NOW()
  ) RETURNING id INTO v_received_id;

  INSERT INTO trade_ins (
    tenant_id, customer_id, seller_id, sold_device_id, received_device_id, appraisal_value,
    sold_device_price, difference_amount, payment_method, status
  ) VALUES (
    p_tenant_id, p_customer_id, p_seller_id, p_sold_device_id, v_received_id, p_appraisal_value,
    p_sold_device_price, p_sold_device_price - p_appraisal_value, p_payment_method, 'completed'
  ) RETURNING id INTO v_trade_in_id;

  UPDATE devices SET origin_trade_in_id = v_trade_in_id WHERE id = v_received_id;

  -- Venda normal (mesma sequência de numeração das demais)
  INSERT INTO sales (
    tenant_id, seller_id, customer_id, sales_origin, subtotal, discount_amount,
    total_amount, total_cost, gross_profit, status, trade_in_id
  ) VALUES (
    p_tenant_id, p_seller_id, p_customer_id, p_sales_origin, p_sold_device_price, 0,
    p_sold_device_price, v_cost, p_sold_device_price - v_cost, 'completed', v_trade_in_id
  ) RETURNING id INTO v_sale_id;

  UPDATE trade_ins SET sale_id = v_sale_id WHERE id = v_trade_in_id;

  -- Item vendido (a garantia é emitida pelo trigger de sale_items) e baixa do estoque
  INSERT INTO sale_items (tenant_id, sale_id, item_type, device_id, quantity, unit_cost, unit_price, discount, total_price)
  VALUES (p_tenant_id, v_sale_id, 'device', p_sold_device_id, 1, v_cost, p_sold_device_price, 0, p_sold_device_price);

  UPDATE devices SET status = 'sold', sold_at = NOW(), updated_at = NOW() WHERE id = p_sold_device_id;

  -- Pagamentos: aparelho recebido (avaliação) + diferença
  IF v_credit > 0 THEN
    INSERT INTO sale_payments (tenant_id, sale_id, payment_method, amount, installments)
    VALUES (p_tenant_id, v_sale_id, 'trade_in_credit', v_credit, 1);
  END IF;
  IF v_diff > 0 THEN
    INSERT INTO sale_payments (tenant_id, sale_id, payment_method, amount, installments)
    VALUES (p_tenant_id, v_sale_id, p_payment_method, v_diff, 1);
  END IF;

  INSERT INTO device_movements (tenant_id, device_id, imei, movement_type, description, from_status, to_status, cost, user_id)
  VALUES
    (p_tenant_id, v_received_id, p_received_imei, 'stock_entry', 'Aparelho recebido em upgrade e cadastrado no estoque', NULL, 'available', p_appraisal_value, p_seller_id);

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- CANCELAR VENDA (comum ou upgrade) de forma atômica, desfazendo toda a operação
CREATE OR REPLACE FUNCTION cancel_sale(
  p_tenant_id UUID,
  p_sale_id UUID,
  p_user_id UUID,
  p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
  v_sale sales%ROWTYPE;
  v_role TEXT;
  v_trade trade_ins%ROWTYPE;
  v_received devices%ROWTYPE;
  v_item RECORD;
  v_gift RECORD;
  v_usage RECORD;
BEGIN
  SELECT role::TEXT INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Somente administradores podem cancelar vendas.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.'; END IF;
  IF v_sale.status = 'cancelled' THEN RAISE EXCEPTION 'Esta venda já foi cancelada.'; END IF;

  -- Upgrade: o aparelho recebido só pode ser invalidado enquanto estiver parado no estoque
  IF v_sale.trade_in_id IS NOT NULL THEN
    SELECT * INTO v_trade FROM trade_ins WHERE id = v_sale.trade_in_id FOR UPDATE;
    SELECT * INTO v_received FROM devices WHERE id = v_trade.received_device_id FOR UPDATE;
    IF v_received.status::TEXT <> 'available' THEN
      RAISE EXCEPTION 'Não é possível cancelar o upgrade: o aparelho recebido (IMEI %) não está mais disponível no estoque (%).',
        v_received.imei, v_received.status;
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM sale_items WHERE sale_id = p_sale_id AND returned_at IS NULL LOOP
    IF v_item.item_type = 'device' THEN
      UPDATE devices SET status = 'available', sold_at = NULL, updated_at = NOW()
      WHERE id = v_item.device_id AND tenant_id = p_tenant_id AND status::TEXT = 'sold';
      INSERT INTO device_movements (tenant_id, device_id, movement_type, description, from_status, to_status, notes, user_id)
      VALUES (p_tenant_id, v_item.device_id, 'sale_cancelled',
              'Venda cancelada: aparelho devolvido ao estoque', 'sold', 'available', p_reason, p_user_id);
    ELSIF v_item.item_type = 'accessory' THEN
      UPDATE accessories SET quantity = quantity + v_item.quantity, updated_at = NOW()
      WHERE id = v_item.accessory_id AND tenant_id = p_tenant_id;
    END IF;
  END LOOP;

  FOR v_gift IN SELECT * FROM sale_gifts WHERE sale_id = p_sale_id LOOP
    UPDATE gifts SET quantity = quantity + v_gift.quantity WHERE id = v_gift.gift_id AND tenant_id = p_tenant_id;
  END LOOP;

  -- Aparelho recebido: entrada invalidada (registro e IMEI preservados para rastreio)
  IF v_received.id IS NOT NULL THEN
    UPDATE devices SET status = 'decommissioned', updated_at = NOW() WHERE id = v_received.id;
    UPDATE trade_ins SET status = 'cancelled' WHERE id = v_trade.id;
    INSERT INTO device_movements (tenant_id, device_id, imei, movement_type, description, from_status, to_status, notes, user_id)
    VALUES (p_tenant_id, v_received.id, v_received.imei, 'sale_cancelled',
            'Entrada invalidada: upgrade cancelado', 'available', 'decommissioned', p_reason, p_user_id);
  END IF;

  -- Crédito do cliente usado nesta venda volta ao saldo
  FOR v_usage IN SELECT * FROM customer_credit_usages WHERE sale_id = p_sale_id LOOP
    UPDATE customer_credits SET balance = LEAST(amount, balance + v_usage.amount) WHERE id = v_usage.credit_id;
    DELETE FROM customer_credit_usages WHERE id = v_usage.id;
  END LOOP;

  UPDATE sales SET
    status = 'cancelled', cancellation_reason = btrim(p_reason),
    cancelled_by = p_user_id, cancelled_at = NOW()
  WHERE id = p_sale_id; -- o trigger da migration 07 cancela as garantias

  INSERT INTO audit_logs (tenant_id, user_id, user_role, action, module, record_id, details)
  VALUES (p_tenant_id, p_user_id, v_role, 'VENDA_CANCELADA', 'Vendas', p_sale_id::TEXT,
          jsonb_build_object('motivo', p_reason, 'numero', v_sale.sale_number,
                             'tipo', CASE WHEN v_sale.trade_in_id IS NULL THEN 'venda' ELSE 'upgrade' END,
                             'valor_estornado', v_sale.total_amount));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
