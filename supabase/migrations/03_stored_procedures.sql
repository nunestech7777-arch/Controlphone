-- ============================================================================
-- CONTROLPHONE — FUNÇÕES TRANSACIONAIS SEGURAS (STORED PROCEDURES / RPC)
-- ============================================================================

-- 1. FINALIZAR VENDA COM BAIXA ATÔMICA E CONSISTÊNCIA
CREATE OR REPLACE FUNCTION finalize_sale(
  p_tenant_id UUID,
  p_seller_id UUID,
  p_customer_id UUID,
  p_sales_origin VARCHAR(100),
  p_subtotal NUMERIC,
  p_discount NUMERIC,
  p_total_amount NUMERIC,
  p_total_cost NUMERIC,
  p_gross_profit NUMERIC,
  p_items JSONB, -- Array de [{ item_type, device_id, accessory_id, quantity, unit_cost, unit_price, discount, total_price }]
  p_payments JSONB, -- Array de [{ payment_method, amount, installments }]
  p_gifts JSONB -- Array de [{ gift_id, quantity, unit_cost }]
)
RETURNS UUID AS $$
DECLARE
  v_sale_id UUID;
  v_item RECORD;
  v_payment RECORD;
  v_gift RECORD;
  v_device_status device_status;
BEGIN
  -- Criar registro principal da venda
  INSERT INTO sales (
    tenant_id, seller_id, customer_id, sales_origin,
    subtotal, discount_amount, total_amount, total_cost, gross_profit, status
  ) VALUES (
    p_tenant_id, p_seller_id, p_customer_id, p_sales_origin,
    p_subtotal, p_discount, p_total_amount, p_total_cost, p_gross_profit, 'completed'
  ) RETURNING id INTO v_sale_id;

  -- Processar itens
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    item_type VARCHAR, device_id UUID, accessory_id UUID,
    quantity INT, unit_cost NUMERIC, unit_price NUMERIC, discount NUMERIC, total_price NUMERIC
  ) LOOP
    INSERT INTO sale_items (
      tenant_id, sale_id, item_type, device_id, accessory_id,
      quantity, unit_cost, unit_price, discount, total_price
    ) VALUES (
      p_tenant_id, v_sale_id, v_item.item_type, v_item.device_id, v_item.accessory_id,
      v_item.quantity, v_item.unit_cost, v_item.unit_price, v_item.discount, v_item.total_price
    );

    IF v_item.item_type = 'device' THEN
      -- Verificar se o aparelho ainda está disponível
      SELECT status INTO v_device_status FROM devices WHERE id = v_item.device_id AND tenant_id = p_tenant_id FOR UPDATE;
      IF v_device_status != 'available' THEN
        RAISE EXCEPTION 'Aparelho % não está disponível para venda!', v_item.device_id;
      END IF;

      -- Baixar estoque do aparelho
      UPDATE devices
      SET status = 'sold', sold_at = NOW(), updated_at = NOW()
      WHERE id = v_item.device_id AND tenant_id = p_tenant_id;
    ELSIF v_item.item_type = 'accessory' THEN
      -- Baixar quantidade do acessório
      UPDATE accessories
      SET quantity = quantity - v_item.quantity, updated_at = NOW()
      WHERE id = v_item.accessory_id AND tenant_id = p_tenant_id;
    END IF;
  END LOOP;

  -- Processar pagamentos
  FOR v_payment IN SELECT * FROM jsonb_to_recordset(p_payments) AS (
    payment_method payment_method, amount NUMERIC, installments INT
  ) LOOP
    INSERT INTO sale_payments (
      tenant_id, sale_id, payment_method, amount, installments
    ) VALUES (
      p_tenant_id, v_sale_id, v_payment.payment_method, v_payment.amount, COALESCE(v_payment.installments, 1)
    );
  END LOOP;

  -- Processar brindes (cobrado R$ 0,00, dá baixa no estoque)
  IF p_gifts IS NOT NULL THEN
    FOR v_gift IN SELECT * FROM jsonb_to_recordset(p_gifts) AS (
      gift_id UUID, quantity INT, unit_cost NUMERIC
    ) LOOP
      INSERT INTO sale_gifts (
        tenant_id, sale_id, gift_id, quantity, unit_cost
      ) VALUES (
        p_tenant_id, v_sale_id, v_gift.gift_id, v_gift.quantity, v_gift.unit_cost
      );

      UPDATE gifts
      SET quantity = quantity - v_gift.quantity
      WHERE id = v_gift.gift_id AND tenant_id = p_tenant_id;
    END LOOP;
  END IF;

  RETURN v_sale_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. PROCESSAR UPGRADE (TRADE-IN)
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
  p_received_condition device_condition,
  p_received_battery_health INT,
  p_received_notes TEXT,
  p_appraisal_value NUMERIC,
  p_payment_method payment_method
)
RETURNS UUID AS $$
DECLARE
  v_trade_in_id UUID;
  v_received_device_id UUID;
  v_diff NUMERIC;
BEGIN
  v_diff := p_sold_device_price - p_appraisal_value;

  -- Marcar o aparelho vendido como vendido
  UPDATE devices
  SET status = 'sold', sold_at = NOW(), updated_at = NOW()
  WHERE id = p_sold_device_id AND tenant_id = p_tenant_id;

  -- Dar entrada automática do aparelho recebido no estoque
  INSERT INTO devices (
    tenant_id, imei, brand, model, storage_capacity, color,
    condition, battery_health, physical_condition_notes,
    origin, acquisition_cost, accumulated_repair_cost,
    suggested_price, status, entry_date
  ) VALUES (
    p_tenant_id, p_received_imei, p_received_brand, p_received_model, p_received_storage, p_received_color,
    p_received_condition, p_received_battery_health, p_received_notes,
    'trade_in', p_appraisal_value, 0.00,
    p_appraisal_value * 1.30, -- Sugestão inicial de margem
    'available', NOW()
  ) RETURNING id INTO v_received_device_id;

  -- Registrar o upgrade
  INSERT INTO trade_ins (
    tenant_id, customer_id, seller_id, sold_device_id,
    received_device_id, appraisal_value, sold_device_price,
    difference_amount, payment_method, status
  ) VALUES (
    p_tenant_id, p_customer_id, p_seller_id, p_sold_device_id,
    v_received_device_id, p_appraisal_value, p_sold_device_price,
    v_diff, p_payment_method, 'completed'
  ) RETURNING id INTO v_trade_in_id;

  -- Atualizar referência no aparelho recebido
  UPDATE devices SET origin_trade_in_id = v_trade_in_id WHERE id = v_received_device_id;

  RETURN v_trade_in_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. CONCLUIR MANUTENÇÃO INTERNA E ATUALIZAR CUSTO ACUMULADO
CREATE OR REPLACE FUNCTION complete_internal_repair(
  p_tenant_id UUID,
  p_repair_id UUID,
  p_repair_cost NUMERIC
)
RETURNS VOID AS $$
DECLARE
  v_device_id UUID;
BEGIN
  SELECT device_id INTO v_device_id FROM internal_repairs WHERE id = p_repair_id AND tenant_id = p_tenant_id;

  IF v_device_id IS NULL THEN
    RAISE EXCEPTION 'Manutenção não encontrada!';
  END IF;

  -- Atualizar manutenção
  UPDATE internal_repairs
  SET repair_cost = p_repair_cost, status = 'completed', completed_at = NOW()
  WHERE id = p_repair_id AND tenant_id = p_tenant_id;

  -- Incorporar custo ao aparelho e liberar status
  UPDATE devices
  SET accumulated_repair_cost = accumulated_repair_cost + p_repair_cost,
      status = 'available',
      updated_at = NOW()
  WHERE id = v_device_id AND tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
