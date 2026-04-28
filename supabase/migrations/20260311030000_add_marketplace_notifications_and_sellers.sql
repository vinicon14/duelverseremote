-- Add seller_id to marketplace_products to allow PRO users to sell
ALTER TABLE public.marketplace_products 
ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES auth.users(id);

-- Create index for seller products
CREATE INDEX IF NOT EXISTS idx_marketplace_products_seller_id ON public.marketplace_products(seller_id);

-- Add is_third_party_seller column
ALTER TABLE public.marketplace_products 
ADD COLUMN IF NOT EXISTS is_third_party_seller boolean NOT NULL DEFAULT false;

-- Function to create purchase notification
CREATE OR REPLACE FUNCTION public.create_purchase_notification(
  p_user_id uuid,
  p_product_name text,
  p_quantity integer,
  p_total_price integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    p_user_id,
    'purchase_completed',
    'Compra Realizada! 🎉',
    format('Você comprou %s item(s) de %s por %s DuelCoins', p_quantity, p_product_name, p_total_price),
    jsonb_build_object(
      'product_name', p_product_name,
      'quantity', p_quantity,
      'total_price', p_total_price,
      'type', 'purchase'
    )
  );
END;
$$;

-- Update purchase function to create notification
CREATE OR REPLACE FUNCTION public.purchase_marketplace_items(p_items jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_balance integer;
  v_total integer := 0;
  v_item record;
  v_product record;
  v_purchase_ids uuid[] := '{}';
  v_pid uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Get username
  SELECT username INTO v_username FROM profiles WHERE user_id = v_user_id;

  -- Calculate total and validate products
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products
    WHERE id = v_item.product_id AND is_active = true;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'message', 'Produto não encontrado: ' || v_item.product_id);
    END IF;

    -- Check stock
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

  -- Deduct balance
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_total WHERE user_id = v_user_id;

  -- Record transaction
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, v_total, 'marketplace_purchase', 'Compra no Marketplace');

  -- Create purchase records and update stock
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products WHERE id = v_item.product_id;

    INSERT INTO marketplace_purchases (user_id, product_id, quantity, total_price)
    VALUES (v_user_id, v_item.product_id, v_item.quantity, v_product.price_duelcoins * v_item.quantity)
    RETURNING id INTO v_pid;

    v_purchase_ids := array_append(v_purchase_ids, v_pid);

    -- Add to inventory
    PERFORM public.add_item_to_inventory(v_user_id, v_item.product_id, v_item.quantity);

    -- Update stock if applicable
    IF v_product.stock IS NOT NULL THEN
      UPDATE marketplace_products SET stock = stock - v_item.quantity WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  -- Create notification for the buyer
  PERFORM public.create_purchase_notification(
    v_user_id,
    (SELECT string_agg(name, ', ') FROM marketplace_products WHERE id IN (SELECT product_id FROM jsonb_to_recordset(p_items))),
    (SELECT sum(quantity) FROM jsonb_to_recordset(p_items) AS x(quantity integer)),
    v_total
  );

  -- If there's a third-party seller, notify them too
  FOR v_product IN SELECT mp.* FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    JOIN marketplace_products mp ON mp.id = x.product_id
  LOOP
    IF v_product.seller_id IS NOT NULL AND v_product.is_third_party_seller = true THEN
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (
        v_product.seller_id,
        'item_sold',
        'Item Vendido! 💰',
        format('Seu item "%s" foi vendido para %s', v_product.name, v_username),
        jsonb_build_object(
          'product_name', v_product.name,
          'buyer_username', v_username,
          'type', 'sale'
        )
      );
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'message', 'Compra realizada com sucesso!', 'total', v_total);
END;
$$;

-- Create function for PRO users to create products
CREATE OR REPLACE FUNCTION public.create_marketplace_product(
  p_name text,
  p_description text,
  p_price_duelcoins integer,
  p_category text DEFAULT 'digital_item',
  p_product_type text DEFAULT 'one_time',
  p_stock integer,
  p_image_url text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_is_pro boolean;
  v_product_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Check if user is PRO
  SELECT is_pro INTO v_is_pro FROM profiles WHERE user_id = v_user_id;
  
  IF v_is_pro IS NULL OR v_is_pro = false THEN
    RETURN json_build_object('success', false, 'message', 'Apenas usuários PRO podem criar produtos para venda');
  END IF;

  -- Create the product
  INSERT INTO marketplace_products (
    name,
    description,
    price_duelcoins,
    category,
    product_type,
    stock,
    image_url,
    seller_id,
    is_third_party_seller,
    is_active
  )
  VALUES (
    p_name,
    p_description,
    p_price_duelcoins,
    p_category,
    p_product_type,
    p_stock,
    p_image_url,
    v_user_id,
    true,
    true
  )
  RETURNING id INTO v_product_id;

  RETURN json_build_object('success', true, 'message', 'Produto criado com sucesso!', 'product_id', v_product_id);
END;
$$;

-- Update RLS policies for third-party sellers
DROP POLICY IF EXISTS "Third party sellers manage own products" ON public.marketplace_products;
CREATE POLICY "Third party sellers manage own products" ON public.marketplace_products
  FOR ALL TO authenticated
  USING (
    seller_id = auth.uid() 
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    seller_id = auth.uid() 
    OR public.is_admin(auth.uid())
  );
