-- User Inventory Table - Armazena os itens que os usuários possuem
CREATE TABLE public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.marketplace_products(id),
  quantity integer NOT NULL DEFAULT 1,
  is_used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id, is_used) -- Agrupa itens não usados do mesmo tipo
);

-- Enable RLS
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users view own inventory" ON public.user_inventory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own inventory" ON public.user_inventory
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own inventory" ON public.user_inventory
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own inventory" ON public.user_inventory
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all inventory" ON public.user_inventory
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Function to add item to inventory (called after purchase)
CREATE OR REPLACE FUNCTION public.add_item_to_inventory(p_user_id uuid, p_product_id uuid, p_quantity integer DEFAULT 1)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inventory_id uuid;
  v_existing record;
BEGIN
  -- Check if user already has this item (unused)
  SELECT * INTO v_existing FROM user_inventory
  WHERE user_id = p_user_id AND product_id = p_product_id AND is_used = false;

  IF FOUND THEN
    -- Update quantity
    UPDATE user_inventory SET quantity = quantity + p_quantity
    WHERE id = v_existing.id
    RETURNING id INTO v_inventory_id;
  ELSE
    -- Insert new item
    INSERT INTO user_inventory (user_id, product_id, quantity)
    VALUES (p_user_id, p_product_id, p_quantity)
    RETURNING id INTO v_inventory_id;
  END IF;

  RETURN json_build_object('success', true, 'inventory_id', v_inventory_id);
END;
$$;

-- Function to transfer item to another user
CREATE OR REPLACE FUNCTION public.transfer_inventory_item(p_inventory_id uuid, p_recipient_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sender_id uuid;
  v_item record;
  v_new_inventory_id uuid;
BEGIN
  v_sender_id := auth.uid();
  
  IF v_sender_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF v_sender_id = p_recipient_id THEN
    RETURN json_build_object('success', false, 'message', 'Você não pode transferir itens para si mesmo');
  END IF;

  -- Get the item
  SELECT * INTO v_item FROM user_inventory
  WHERE id = p_inventory_id AND user_id = v_sender_id AND is_used = false;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado ou já usado');
  END IF;

  -- Check if recipient already has this item
  UPDATE user_inventory SET quantity = quantity + v_item.quantity
  WHERE user_id = p_recipient_id AND product_id = v_item.product_id AND is_used = false
  RETURNING id INTO v_new_inventory_id;

  IF NOT FOUND THEN
    -- Create new item for recipient
    INSERT INTO user_inventory (user_id, product_id, quantity)
    VALUES (p_recipient_id, v_item.product_id, v_item.quantity)
    RETURNING id INTO v_new_inventory_id;
  END IF;

  -- Remove item from sender (delete since quantity was transferred)
  DELETE FROM user_inventory WHERE id = p_inventory_id;

  RETURN json_build_object('success', true, 'message', 'Item transferido com sucesso!');
END;
$$;

-- Function to use an item
CREATE OR REPLACE FUNCTION public.use_inventory_item(p_inventory_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_item record;
  v_product record;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Get the item with product info
  SELECT i.*, p.name as product_name, p.metadata INTO v_item
  FROM user_inventory i
  JOIN marketplace_products p ON i.product_id = p.id
  WHERE i.id = p_inventory_id AND i.user_id = v_user_id AND i.is_used = false;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado ou já usado');
  END IF;

  -- If quantity > 1, decrease by 1 instead of marking as used
  IF v_item.quantity > 1 THEN
    UPDATE user_inventory SET quantity = quantity - 1
    WHERE id = p_inventory_id;
    
    RETURN json_build_object(
      'success', true, 
      'message', 'Item usado: ' || v_item.product_name,
      'remaining', v_item.quantity - 1
    );
  ELSE
    -- Mark as used
    UPDATE user_inventory SET is_used = true, used_at = now()
    WHERE id = p_inventory_id;

    RETURN json_build_object(
      'success', true, 
      'message', 'Item usado: ' || v_item.product_name,
      'item_type', v_item.product_id
    );
  END IF;
END;
$$;

-- Update purchase function to also add items to inventory
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

  RETURN json_build_object('success', true, 'message', 'Compra realizada com sucesso!', 'total', v_total);
END;
$$;

-- Create index for better performance
CREATE INDEX idx_user_inventory_user_id ON public.user_inventory(user_id);
CREATE INDEX idx_user_inventory_user_not_used ON public.user_inventory(user_id, is_used) WHERE is_used = false;
