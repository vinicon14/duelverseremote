
CREATE OR REPLACE FUNCTION public.purchase_marketplace_items(p_items jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_balance integer;
  v_total integer := 0;
  v_item record;
  v_product record;
  v_purchase_ids uuid[] := '{}';
  v_pid uuid;
  v_seller_amount integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Calculate total and validate products
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products
    WHERE id = v_item.product_id AND is_active = true;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'message', 'Produto não encontrado: ' || v_item.product_id);
    END IF;

    IF v_product.stock IS NOT NULL AND v_product.stock < v_item.quantity THEN
      RETURN json_build_object('success', false, 'message', 'Estoque insuficiente para: ' || v_product.name);
    END IF;

    v_total := v_total + (v_product.price_duelcoins * v_item.quantity);
  END LOOP;

  -- Check balance
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_total THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente. Total: ' || v_total || ' DuelCoins');
  END IF;

  -- Deduct balance from buyer
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_total WHERE user_id = v_user_id;

  -- Record buyer transaction
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, v_total, 'marketplace_purchase', 'Compra no Marketplace');

  -- Create purchase records, update stock, and transfer to sellers
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products WHERE id = v_item.product_id;

    v_seller_amount := v_product.price_duelcoins * v_item.quantity;

    INSERT INTO marketplace_purchases (user_id, product_id, quantity, total_price)
    VALUES (v_user_id, v_item.product_id, v_item.quantity, v_seller_amount)
    RETURNING id INTO v_pid;

    v_purchase_ids := array_append(v_purchase_ids, v_pid);

    -- Update stock if applicable
    IF v_product.stock IS NOT NULL THEN
      UPDATE marketplace_products SET stock = stock - v_item.quantity WHERE id = v_item.product_id;
    END IF;

    -- Transfer DuelCoins to seller if third-party product
    IF v_product.is_third_party_seller = true AND v_product.seller_id IS NOT NULL THEN
      UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_seller_amount
      WHERE user_id = v_product.seller_id;

      INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
      VALUES (v_user_id, v_product.seller_id, v_seller_amount, 'marketplace_purchase', 
              'Venda no Marketplace: ' || v_product.name);
    END IF;

    -- Add item to buyer inventory
    INSERT INTO user_inventory (user_id, product_id, quantity)
    VALUES (v_user_id, v_item.product_id, v_item.quantity)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN json_build_object('success', true, 'message', 'Compra realizada com sucesso!', 'total', v_total);
END;
$$;
