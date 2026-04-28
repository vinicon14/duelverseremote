
-- Marketplace products table
CREATE TABLE public.marketplace_products (
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Marketplace purchases table
CREATE TABLE public.marketplace_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.marketplace_products(id),
  quantity integer NOT NULL DEFAULT 1,
  total_price integer NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;

-- Products policies: everyone can view active, admins manage all
CREATE POLICY "Anyone can view active products" ON public.marketplace_products
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins manage products" ON public.marketplace_products
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Purchases policies
CREATE POLICY "Users view own purchases" ON public.marketplace_purchases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins view all purchases" ON public.marketplace_purchases
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Purchase function (atomic: validates balance, deducts, records)
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

    -- Update stock if applicable
    IF v_product.stock IS NOT NULL THEN
      UPDATE marketplace_products SET stock = stock - v_item.quantity WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'message', 'Compra realizada com sucesso!', 'total', v_total);
END;
$$;
