-- 1. Allow SECURITY DEFINER server functions (running as table owner) to bypass profile guards
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF is_admin(auth.uid()) OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance
     OR NEW.account_type    IS DISTINCT FROM OLD.account_type
     OR NEW.is_banned       IS DISTINCT FROM OLD.is_banned
     OR NEW.points          IS DISTINCT FROM OLD.points
     OR NEW.wins            IS DISTINCT FROM OLD.wins
     OR NEW.losses          IS DISTINCT FROM OLD.losses
     OR NEW.level           IS DISTINCT FROM OLD.level
     OR NEW.user_id         IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_profile_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_setting('role', true);
  v_is_admin boolean := false;
  v_is_self boolean := (auth.uid() = NEW.user_id);
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF v_role IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_is_admin := public.is_admin(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance THEN
    IF NOT v_is_self OR NEW.duelcoins_balance > OLD.duelcoins_balance THEN
      RAISE EXCEPTION 'Alteração de saldo só pode ser feita pelo servidor.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.is_banned   IS DISTINCT FROM OLD.is_banned
     OR NEW.level       IS DISTINCT FROM OLD.level
     OR NEW.points      IS DISTINCT FROM OLD.points
     OR NEW.wins        IS DISTINCT FROM OLD.wins
     OR NEW.losses      IS DISTINCT FROM OLD.losses
  THEN
    RAISE EXCEPTION 'Campo protegido: estatísticas, nível, status ou tipo de conta só podem ser alterados pelo servidor.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Shipping fields on marketplace purchases
ALTER TABLE public.marketplace_purchases
  ADD COLUMN IF NOT EXISTS shipping_phone text,
  ADD COLUMN IF NOT EXISTS shipping_zip text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_number text,
  ADD COLUMN IF NOT EXISTS shipping_complement text,
  ADD COLUMN IF NOT EXISTS shipping_district text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text;

-- 3. Single, unambiguous purchase function with shipping support
DROP FUNCTION IF EXISTS public.purchase_marketplace_items(jsonb);
DROP FUNCTION IF EXISTS public.purchase_marketplace_items(jsonb, text);

CREATE OR REPLACE FUNCTION public.purchase_marketplace_items(
  p_items jsonb,
  p_coupon_code text DEFAULT NULL,
  p_shipping jsonb DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_balance integer;
  v_subtotal integer := 0;
  v_total integer := 0;
  v_discount integer := 0;
  v_discount_percent integer := 0;
  v_item record;
  v_product record;
  v_pid uuid;
  v_seller_amount integer;
  v_coupon discount_coupons;
  v_coupon_code text;
  v_needs_shipping boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN json_build_object('success', false, 'message', 'Carrinho vazio');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products
    WHERE id = v_item.product_id AND is_active = true;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'message', 'Produto não encontrado ou inativo');
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RETURN json_build_object('success', false, 'message', 'Quantidade inválida');
    END IF;

    IF v_product.stock IS NOT NULL AND v_product.stock < v_item.quantity THEN
      RETURN json_build_object('success', false, 'message', 'Estoque insuficiente para: ' || v_product.name);
    END IF;

    IF v_product.product_type = 'physical' OR v_product.category = 'physical' THEN
      v_needs_shipping := true;
    END IF;

    v_subtotal := v_subtotal + (v_product.price_duelcoins * v_item.quantity);
  END LOOP;

  IF v_needs_shipping THEN
    IF p_shipping IS NULL
       OR coalesce(trim(p_shipping->>'phone'), '') = ''
       OR coalesce(trim(p_shipping->>'zip'), '') = ''
       OR coalesce(trim(p_shipping->>'address'), '') = ''
       OR coalesce(trim(p_shipping->>'number'), '') = ''
       OR coalesce(trim(p_shipping->>'city'), '') = ''
       OR coalesce(trim(p_shipping->>'state'), '') = ''
    THEN
      RETURN json_build_object('success', false, 'message', 'Dados de entrega obrigatórios para produtos físicos');
    END IF;
  END IF;

  v_total := v_subtotal;

  IF p_coupon_code IS NOT NULL AND length(trim(p_coupon_code)) > 0 THEN
    v_coupon_code := upper(trim(p_coupon_code));

    SELECT * INTO v_coupon FROM discount_coupons WHERE code = v_coupon_code FOR UPDATE;

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

    UPDATE discount_coupons SET times_used = times_used + 1, updated_at = now() WHERE id = v_coupon.id;
  END IF;

  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_total THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente. Total: ' || v_total || ' DuelCoins');
  END IF;

  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_total WHERE user_id = v_user_id;

  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (
    v_user_id, v_total, 'marketplace_purchase',
    CASE WHEN v_discount > 0
      THEN 'Compra no Marketplace (cupom ' || v_coupon_code || ' -' || v_discount_percent || '%)'
      ELSE 'Compra no Marketplace' END
  );

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  LOOP
    SELECT * INTO v_product FROM marketplace_products WHERE id = v_item.product_id;

    IF v_subtotal > 0 THEN
      v_seller_amount := floor(((v_product.price_duelcoins * v_item.quantity)::numeric * v_total) / v_subtotal)::integer;
    ELSE
      v_seller_amount := 0;
    END IF;

    INSERT INTO marketplace_purchases (
      user_id, product_id, quantity, total_price, status,
      shipping_phone, shipping_zip, shipping_address, shipping_number,
      shipping_complement, shipping_district, shipping_city, shipping_state
    )
    VALUES (
      v_user_id, v_item.product_id, v_item.quantity, v_seller_amount, 'pending',
      nullif(trim(coalesce(p_shipping->>'phone', '')), ''),
      nullif(trim(coalesce(p_shipping->>'zip', '')), ''),
      nullif(trim(coalesce(p_shipping->>'address', '')), ''),
      nullif(trim(coalesce(p_shipping->>'number', '')), ''),
      nullif(trim(coalesce(p_shipping->>'complement', '')), ''),
      nullif(trim(coalesce(p_shipping->>'district', '')), ''),
      nullif(trim(coalesce(p_shipping->>'city', '')), ''),
      nullif(trim(coalesce(p_shipping->>'state', '')), '')
    )
    RETURNING id INTO v_pid;

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
$function$;

GRANT EXECUTE ON FUNCTION public.purchase_marketplace_items(jsonb, text, jsonb) TO authenticated;

-- 4. Admin: reset ranked points (new season / banlist)
CREATE OR REPLACE FUNCTION public.admin_reset_ranked_points(
  p_tcg_type text DEFAULT NULL,
  p_reset_record boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tcg_count integer := 0;
  v_profile_count integer := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem resetar a ranqueada' USING ERRCODE = '42501';
  END IF;

  UPDATE tcg_profiles
  SET points = 0,
      wins = CASE WHEN p_reset_record THEN 0 ELSE wins END,
      losses = CASE WHEN p_reset_record THEN 0 ELSE losses END,
      updated_at = now()
  WHERE p_tcg_type IS NULL OR tcg_type = p_tcg_type;
  GET DIAGNOSTICS v_tcg_count = ROW_COUNT;

  IF p_tcg_type IS NULL THEN
    UPDATE profiles
    SET points = 0,
        wins = CASE WHEN p_reset_record THEN 0 ELSE wins END,
        losses = CASE WHEN p_reset_record THEN 0 ELSE losses END,
        updated_at = now();
    GET DIAGNOSTICS v_profile_count = ROW_COUNT;
  END IF;

  RETURN json_build_object(
    'success', true,
    'tcg_profiles_reset', v_tcg_count,
    'profiles_reset', v_profile_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_reset_ranked_points(text, boolean) TO authenticated;

-- 5. Admin: platform metrics
CREATE OR REPLACE FUNCTION public.admin_platform_metrics(p_days integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_result json;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'online_users', (SELECT count(*) FROM profiles WHERE is_online = true),
    'active_today', (SELECT count(*) FROM profiles WHERE last_seen > now() - interval '1 day'),
    'active_7d', (SELECT count(*) FROM profiles WHERE last_seen > now() - interval '7 days'),
    'new_users_today', (SELECT count(*) FROM profiles WHERE created_at > date_trunc('day', now())),
    'new_users_period', (SELECT count(*) FROM profiles WHERE created_at > now() - (v_days || ' days')::interval),
    'total_matches', (SELECT count(*) FROM match_history),
    'matches_period', (SELECT count(*) FROM match_history WHERE played_at > now() - (v_days || ' days')::interval),
    'ranked_matches', (SELECT count(*) FROM match_history mh JOIN live_duels d ON d.id = mh.duel_id WHERE d.is_ranked = true),
    'casual_matches', (SELECT count(*) FROM match_history mh LEFT JOIN live_duels d ON d.id = mh.duel_id WHERE coalesce(d.is_ranked, false) = false),
    'live_duels_now', (SELECT count(*) FROM live_duels WHERE status = 'in_progress'),
    'tournaments_total', (SELECT count(*) FROM tournaments),
    'marketplace_sales', (SELECT count(*) FROM marketplace_purchases),
    'marketplace_revenue_dc', (SELECT coalesce(sum(total_price), 0) FROM marketplace_purchases),
    'duelcoins_orders_paid', (SELECT count(*) FROM duelcoins_orders WHERE status = 'paid'),
    'revenue_brl', (SELECT coalesce(sum(amount_brl), 0) FROM duelcoins_orders WHERE status = 'paid'),
    'revenue_brl_period', (SELECT coalesce(sum(amount_brl), 0) FROM duelcoins_orders WHERE status = 'paid' AND paid_at > now() - (v_days || ' days')::interval),
    'active_subscriptions', (SELECT count(*) FROM user_subscriptions WHERE is_active = true AND expires_at > now()),
    'signups_series', (
      SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.day), '[]'::json) FROM (
        SELECT date_trunc('day', created_at)::date AS day, count(*) AS count
        FROM profiles
        WHERE created_at > now() - (v_days || ' days')::interval
        GROUP BY 1
      ) t
    ),
    'matches_series', (
      SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.day), '[]'::json) FROM (
        SELECT date_trunc('day', played_at)::date AS day, count(*) AS count
        FROM match_history
        WHERE played_at > now() - (v_days || ' days')::interval
        GROUP BY 1
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(integer) TO authenticated;

-- 6. Nickname change for 20 DuelCoins
CREATE OR REPLACE FUNCTION public.change_nickname(p_new_username text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_cost integer := 20;
  v_name text := trim(coalesce(p_new_username, ''));
  v_balance integer;
  v_current text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF length(v_name) < 3 OR length(v_name) > 20 THEN
    RETURN json_build_object('success', false, 'message', 'O apelido deve ter entre 3 e 20 caracteres');
  END IF;

  IF v_name !~ '^[A-Za-z0-9_.-]+$' THEN
    RETURN json_build_object('success', false, 'message', 'Use apenas letras, números, ponto, hífen ou underline');
  END IF;

  SELECT username, duelcoins_balance INTO v_current, v_balance
  FROM profiles WHERE user_id = v_user_id FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  IF lower(v_current) = lower(v_name) THEN
    RETURN json_build_object('success', false, 'message', 'Este já é o seu apelido atual');
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE lower(username) = lower(v_name) AND user_id <> v_user_id) THEN
    RETURN json_build_object('success', false, 'message', 'Este apelido já está em uso');
  END IF;

  IF coalesce(v_balance, 0) < v_cost THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente. Custo: 20 DuelCoins');
  END IF;

  UPDATE profiles
  SET duelcoins_balance = duelcoins_balance - v_cost,
      username = v_name,
      updated_at = now()
  WHERE user_id = v_user_id;

  UPDATE tcg_profiles SET username = v_name, updated_at = now() WHERE user_id = v_user_id;

  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, v_cost, 'nickname_change', 'Alteração de apelido para ' || v_name);

  RETURN json_build_object('success', true, 'message', 'Apelido alterado com sucesso!', 'username', v_name);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.change_nickname(text) TO authenticated;

-- 7. Allow receivers to mark private messages as read
GRANT UPDATE ON public.private_messages TO authenticated;

DROP POLICY IF EXISTS "Receivers can mark messages as read" ON public.private_messages;
CREATE POLICY "Receivers can mark messages as read"
ON public.private_messages
FOR UPDATE
TO authenticated
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);