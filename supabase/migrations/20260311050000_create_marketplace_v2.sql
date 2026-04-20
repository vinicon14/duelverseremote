-- Complete Marketplace setup with Inventory and Third-Party Sellers

-- 1. Create marketplace_products table (if not exists)
CREATE TABLE IF NOT EXISTS public.marketplace_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  price_duelcoins integer NOT NULL DEFAULT 0,
  image_url text,
  category text NOT NULL DEFAULT 'digital_item',
  product_type text NOT NULL DEFAULT 'one_time',
  is_active boolean NOT NULL DEFAULT true,
  stock integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  seller_id uuid REFERENCES auth.users(id),
  is_third_party_seller boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create marketplace_purchases table (if not exists)
CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.marketplace_products(id),
  quantity integer NOT NULL DEFAULT 1,
  total_price integer NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create user_inventory table
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.marketplace_products(id),
  quantity integer NOT NULL DEFAULT 1,
  is_used boolean NOT NULL DEFAULT false,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id, is_used)
);

-- Enable RLS
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_inventory ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies for marketplace_products
DROP POLICY IF EXISTS "Anyone can view active products" ON public.marketplace_products;
CREATE POLICY "Anyone can view active products" ON public.marketplace_products
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins manage products" ON public.marketplace_products;
CREATE POLICY "Admins manage products" ON public.marketplace_products
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Third party sellers manage own products" ON public.marketplace_products;
CREATE POLICY "Third party sellers manage own products" ON public.marketplace_products
  FOR ALL TO authenticated
  USING (seller_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (seller_id = auth.uid() OR public.is_admin(auth.uid()));

-- 5. Create Policies for marketplace_purchases
DROP POLICY IF EXISTS "Users view own purchases" ON public.marketplace_purchases;
CREATE POLICY "Users view own purchases" ON public.marketplace_purchases
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all purchases" ON public.marketplace_purchases;
CREATE POLICY "Admins view all purchases" ON public.marketplace_purchases
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 6. Create Policies for user_inventory
DROP POLICY IF EXISTS "Users view own inventory" ON public.user_inventory;
CREATE POLICY "Users view own inventory" ON public.user_inventory
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own inventory" ON public.user_inventory;
CREATE POLICY "Users insert own inventory" ON public.user_inventory
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own inventory" ON public.user_inventory;
CREATE POLICY "Users update own inventory" ON public.user_inventory
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own inventory" ON public.user_inventory;
CREATE POLICY "Users delete own inventory" ON public.user_inventory
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins view all inventory" ON public.user_inventory;
CREATE POLICY "Admins view all inventory" ON public.user_inventory
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- 7. Function to add item to inventory
CREATE OR REPLACE FUNCTION public.add_item_to_inventory(p_user_id uuid, p_product_id uuid, p_quantity integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_inventory_id uuid;
  v_existing record;
BEGIN
  SELECT * INTO v_existing FROM user_inventory
  WHERE user_id = p_user_id AND product_id = p_product_id AND is_used = false;

  IF FOUND THEN
    UPDATE user_inventory SET quantity = quantity + p_quantity
    WHERE id = v_existing.id
    RETURNING id INTO v_inventory_id;
  ELSE
    INSERT INTO user_inventory (user_id, product_id, quantity)
    VALUES (p_user_id, p_product_id, p_quantity)
    RETURNING id INTO v_inventory_id;
  END IF;

  RETURN json_build_object('success', true, 'inventory_id', v_inventory_id);
END;
$$;

-- 8. Function to transfer item
CREATE OR REPLACE FUNCTION public.transfer_inventory_item(p_inventory_id uuid, p_recipient_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public' AS $$
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

  SELECT * INTO v_item FROM user_inventory
  WHERE id = p_inventory_id AND user_id = v_sender_id AND is_used = false;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado ou já usado');
  END IF;

  UPDATE user_inventory SET quantity = quantity + v_item.quantity
  WHERE user_id = p_recipient_id AND product_id = v_item.product_id AND is_used = false
  RETURNING id INTO v_new_inventory_id;

  IF NOT FOUND THEN
    INSERT INTO user_inventory (user_id, product_id, quantity)
    VALUES (p_recipient_id, v_item.product_id, v_item.quantity)
    RETURNING id INTO v_new_inventory_id;
  END IF;

  DELETE FROM user_inventory WHERE id = p_inventory_id;
  RETURN json_build_object('success', true, 'message', 'Item transferido com sucesso!');
END;
$$;

-- 9. Function to use item
CREATE OR REPLACE FUNCTION public.use_inventory_item(p_inventory_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_user_id uuid;
  v_item record;
  v_product_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT i.*, p.name INTO v_item
  FROM user_inventory i
  JOIN marketplace_products p ON i.product_id = p.id
  WHERE i.id = p_inventory_id AND i.user_id = v_user_id AND i.is_used = false;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Item não encontrado ou já usado');
  END IF;

  v_product_name := v_item.name;

  IF v_item.quantity > 1 THEN
    UPDATE user_inventory SET quantity = quantity - 1 WHERE id = p_inventory_id;
    RETURN json_build_object('success', true, 'message', 'Item usado: ' || v_product_name, 'remaining', v_item.quantity - 1);
  ELSE
    UPDATE user_inventory SET is_used = true, used_at = now() WHERE id = p_inventory_id;
    RETURN json_build_object('success', true, 'message', 'Item usado: ' || v_product_name, 'item_type', v_item.product_id);
  END IF;
END;
$$;

-- 10. Function for PRO users to create products
CREATE OR REPLACE FUNCTION public.create_marketplace_product(
  p_name text,
  p_description text DEFAULT '',
  p_price_duelcoins integer DEFAULT 0,
  p_category text DEFAULT 'digital_item',
  p_product_type text DEFAULT 'one_time',
  p_stock integer DEFAULT NULL,
  p_image_url text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_user_id uuid;
  v_is_pro boolean;
  v_product_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT is_pro INTO v_is_pro FROM profiles WHERE user_id = v_user_id;
  IF v_is_pro IS NULL OR v_is_pro = false THEN
    RETURN json_build_object('success', false, 'message', 'Apenas usuários PRO podem criar produtos');
  END IF;

  INSERT INTO marketplace_products (name, description, price_duelcoins, category, product_type, stock, image_url, seller_id, is_third_party_seller, is_active)
  VALUES (p_name, p_description, p_price_duelcoins, p_category, p_product_type, p_stock, p_image_url, v_user_id, true, true)
  RETURNING id INTO v_product_id;

  RETURN json_build_object('success', true, 'message', 'Produto criado com sucesso!', 'product_id', v_product_id);
END;
$$;

-- 11. Function to purchase items with inventory
CREATE OR REPLACE FUNCTION public.purchase_marketplace_items(p_items jsonb)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_user_id uuid;
  v_balance integer;
  v_total integer := 0;
  v_item record;
  v_product record;
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
      RETURN json_build_object('success', false, 'message', 'Produto não encontrado');
    END IF;

    IF v_product.stock IS NOT NULL AND v_product.stock < v_item.quantity THEN
      RETURN json_build_object('success', false, 'message', 'Estoque insuficiente para: ' || v_product.name);
    END IF;

    v_total := v_total + (v_product.price_duelcoins * v_item.quantity);
  END LOOP;

  -- Check balance
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_total THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
  END IF;

  -- Deduct balance
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_total WHERE user_id = v_user_id;

  -- Record transaction
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, v_total, 'marketplace_purchase', 'Compra no Marketplace');

  -- Create purchase records and add to inventory
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products WHERE id = v_item.product_id;

    INSERT INTO marketplace_purchases (user_id, product_id, quantity, total_price)
    VALUES (v_user_id, v_item.product_id, v_item.quantity, v_product.price_duelcoins * v_item.quantity)
    RETURNING id INTO v_pid;

    -- Add to inventory
    PERFORM public.add_item_to_inventory(v_user_id, v_item.product_id, v_item.quantity);

    -- Update stock
    IF v_product.stock IS NOT NULL THEN
      UPDATE marketplace_products SET stock = stock - v_item.quantity WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'message', 'Compra realizada com sucesso!', 'total', v_total);
END;
$$;

-- 12. Create indexes
CREATE INDEX IF NOT EXISTS idx_user_inventory_user_id ON public.user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_products_seller ON public.marketplace_products(seller_id);
