
-- Coupons table
CREATE TABLE IF NOT EXISTS public.discount_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  discount_percent integer NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
  expires_at timestamptz,
  max_uses integer,
  times_used integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Normalize codes to uppercase for case-insensitive matching
CREATE OR REPLACE FUNCTION public.normalize_coupon_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := upper(trim(NEW.code));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_coupon_code ON public.discount_coupons;
CREATE TRIGGER trg_normalize_coupon_code
  BEFORE INSERT OR UPDATE ON public.discount_coupons
  FOR EACH ROW EXECUTE FUNCTION public.normalize_coupon_code();

ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;

-- Admins manage everything; regular users cannot read directly
CREATE POLICY "Admins manage coupons"
  ON public.discount_coupons
  FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Validation function (SECURITY DEFINER). Returns json with validity + percent.
CREATE OR REPLACE FUNCTION public.validate_marketplace_coupon(p_code text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon discount_coupons;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('valid', false, 'message', 'Não autenticado');
  END IF;

  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN json_build_object('valid', false, 'message', 'Código vazio');
  END IF;

  SELECT * INTO v_coupon FROM discount_coupons
  WHERE code = upper(trim(p_code));

  IF NOT FOUND THEN
    RETURN json_build_object('valid', false, 'message', 'Cupom não encontrado');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN json_build_object('valid', false, 'message', 'Cupom desativado');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'message', 'Cupom expirado');
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.times_used >= v_coupon.max_uses THEN
    RETURN json_build_object('valid', false, 'message', 'Cupom esgotado');
  END IF;

  RETURN json_build_object(
    'valid', true,
    'code', v_coupon.code,
    'discount_percent', v_coupon.discount_percent,
    'message', 'Cupom válido'
  );
END;
$$;

-- Replace marketplace purchase function with coupon-aware version (default NULL keeps old callers working)
CREATE OR REPLACE FUNCTION public.purchase_marketplace_items(
  p_items jsonb,
  p_coupon_code text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_balance integer;
  v_subtotal integer := 0;
  v_total integer := 0;
  v_discount integer := 0;
  v_discount_percent integer := 0;
  v_item record;
  v_product record;
  v_purchase_ids uuid[] := '{}';
  v_pid uuid;
  v_seller_amount integer;
  v_coupon discount_coupons;
  v_coupon_code text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Calculate subtotal and validate products
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products
    WHERE id = v_item.product_id AND is_active = true;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'message', 'Produto não encontrado: ' || v_item.product_id);
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RETURN json_build_object('success', false, 'message', 'Quantidade inválida');
    END IF;

    IF v_product.stock IS NOT NULL AND v_product.stock < v_item.quantity THEN
      RETURN json_build_object('success', false, 'message', 'Estoque insuficiente para: ' || v_product.name);
    END IF;

    v_subtotal := v_subtotal + (v_product.price_duelcoins * v_item.quantity);
  END LOOP;

  v_total := v_subtotal;

  -- Validate and lock coupon row if provided
  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    v_coupon_code := upper(trim(p_coupon_code));

    SELECT * INTO v_coupon FROM discount_coupons
    WHERE code = v_coupon_code
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'message', 'Cupom não encontrado');
    END IF;

    IF NOT v_coupon.is_active THEN
      RETURN json_build_object('success', false, 'message', 'Cupom desativado');
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
      RETURN json_build_object('success', false, 'message', 'Cupom expirado');
    END IF;

    IF v_coupon.max_uses IS NOT NULL AND v_coupon.times_used >= v_coupon.max_uses THEN
      RETURN json_build_object('success', false, 'message', 'Cupom esgotado');
    END IF;

    v_discount_percent := v_coupon.discount_percent;
    v_discount := floor(v_subtotal::numeric * v_discount_percent / 100)::integer;
    IF v_discount > v_subtotal THEN
      v_discount := v_subtotal;
    END IF;
    v_total := v_subtotal - v_discount;

    -- Increment usage atomically
    UPDATE discount_coupons SET times_used = times_used + 1, updated_at = now()
    WHERE id = v_coupon.id;
  END IF;

  -- Check balance
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < v_total THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente. Total: ' || v_total || ' DuelCoins');
  END IF;

  -- Deduct balance from buyer
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_total WHERE user_id = v_user_id;

  -- Record buyer transaction (with discount info if any)
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (
    v_user_id,
    v_total,
    'marketplace_purchase',
    CASE
      WHEN v_discount > 0 THEN
        'Compra no Marketplace (cupom ' || v_coupon_code || ' -' || v_discount_percent || '% / -' || v_discount || ' DC)'
      ELSE
        'Compra no Marketplace'
    END
  );

  -- Create purchase records, update stock, and transfer to sellers
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products WHERE id = v_item.product_id;

    -- Seller receives proportional discounted amount (rounded down)
    IF v_subtotal > 0 THEN
      v_seller_amount := floor(((v_product.price_duelcoins * v_item.quantity)::numeric * v_total) / v_subtotal)::integer;
    ELSE
      v_seller_amount := 0;
    END IF;

    INSERT INTO marketplace_purchases (user_id, product_id, quantity, total_price)
    VALUES (v_user_id, v_item.product_id, v_item.quantity, v_seller_amount)
    RETURNING id INTO v_pid;

    v_purchase_ids := array_append(v_purchase_ids, v_pid);

    IF v_product.stock IS NOT NULL THEN
      UPDATE marketplace_products SET stock = stock - v_item.quantity WHERE id = v_item.product_id;
    END IF;

    IF v_product.is_third_party_seller = true AND v_product.seller_id IS NOT NULL AND v_seller_amount > 0 THEN
      UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_seller_amount
      WHERE user_id = v_product.seller_id;

      INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
      VALUES (v_user_id, v_product.seller_id, v_seller_amount, 'marketplace_purchase',
              'Venda no Marketplace: ' || v_product.name);
    END IF;

    INSERT INTO user_inventory (user_id, product_id, quantity)
    VALUES (v_user_id, v_item.product_id, v_item.quantity)
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'message', 'Compra realizada com sucesso!',
    'subtotal', v_subtotal,
    'discount', v_discount,
    'discount_percent', v_discount_percent,
    'total', v_total,
    'coupon_applied', v_coupon_code
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_marketplace_coupon(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_marketplace_items(jsonb, text) TO authenticated;
