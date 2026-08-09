-- 1) Reset de ranqueada com categorias de Yu-Gi-Oh!
CREATE OR REPLACE FUNCTION public.admin_reset_ranked_points(p_tcg_type text DEFAULT NULL, p_reset_record boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tcg_count integer := 0;
  v_profile_count integer := 0;
  v_target text;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem resetar a ranqueada' USING ERRCODE = '42501';
  END IF;

  v_target := CASE
    WHEN p_tcg_type IS NULL THEN NULL
    WHEN lower(p_tcg_type) IN ('advanced', 'yugioh') THEN 'yugioh'
    WHEN lower(p_tcg_type) = 'rush' THEN 'rush'
    WHEN lower(p_tcg_type) = 'genesis' THEN 'genesis'
    ELSE NULL
  END;

  IF p_tcg_type IS NOT NULL AND v_target IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Categoria inválida. Use advanced, rush ou genesis.');
  END IF;

  UPDATE tcg_profiles
  SET points = 0,
      wins = CASE WHEN p_reset_record THEN 0 ELSE wins END,
      losses = CASE WHEN p_reset_record THEN 0 ELSE losses END,
      updated_at = now()
  WHERE (v_target IS NULL AND tcg_type IN ('yugioh', 'rush', 'genesis'))
     OR tcg_type = v_target;
  GET DIAGNOSTICS v_tcg_count = ROW_COUNT;

  IF v_target IS NULL OR v_target = 'yugioh' THEN
    UPDATE profiles p
    SET points = 0,
        wins = CASE WHEN p_reset_record THEN 0 ELSE p.wins END,
        losses = CASE WHEN p_reset_record THEN 0 ELSE p.losses END,
        updated_at = now()
    WHERE EXISTS (
      SELECT 1 FROM tcg_profiles t
      WHERE t.user_id = p.user_id
        AND t.tcg_type IN ('yugioh', 'rush', 'genesis')
    );
    GET DIAGNOSTICS v_profile_count = ROW_COUNT;
  END IF;

  RETURN json_build_object(
    'success', true,
    'tcg_profiles_reset', v_tcg_count,
    'profiles_reset', v_profile_count
  );
END;
$$;

-- 2) Pedidos recebidos pelo vendedor PRO
CREATE OR REPLACE FUNCTION public.seller_marketplace_orders()
RETURNS TABLE (
  id uuid,
  product_id uuid,
  product_name text,
  product_image_url text,
  product_category text,
  is_physical boolean,
  buyer_id uuid,
  buyer_username text,
  quantity integer,
  total_price integer,
  status text,
  tracking_code text,
  created_at timestamptz,
  updated_at timestamptz,
  shipping_phone text,
  shipping_zip text,
  shipping_address text,
  shipping_number text,
  shipping_complement text,
  shipping_district text,
  shipping_city text,
  shipping_state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mp.id,
    mp.product_id,
    pr.name,
    pr.image_url,
    pr.category,
    (pr.category = 'physical' OR pr.product_type = 'physical'),
    mp.user_id,
    pf.username,
    mp.quantity,
    mp.total_price,
    mp.status,
    mp.tracking_code,
    mp.created_at,
    mp.updated_at,
    mp.shipping_phone,
    mp.shipping_zip,
    mp.shipping_address,
    mp.shipping_number,
    mp.shipping_complement,
    mp.shipping_district,
    mp.shipping_city,
    mp.shipping_state
  FROM marketplace_purchases mp
  JOIN marketplace_products pr ON pr.id = mp.product_id
  LEFT JOIN profiles pf ON pf.user_id = mp.user_id
  WHERE pr.seller_id = auth.uid()
    AND auth.uid() IS NOT NULL
  ORDER BY mp.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.seller_marketplace_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_marketplace_orders() TO authenticated;

-- 3) Atualização de status/rastreio pelo vendedor
CREATE OR REPLACE FUNCTION public.seller_update_order_status(
  p_purchase_id uuid,
  p_status text,
  p_tracking_code text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller uuid;
  v_buyer uuid;
  v_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_status NOT IN ('pending', 'processing', 'shipped', 'delivered', 'completed', 'cancelled') THEN
    RETURN json_build_object('success', false, 'message', 'Status inválido');
  END IF;

  SELECT pr.seller_id, mp.user_id, pr.name
    INTO v_seller, v_buyer, v_name
  FROM marketplace_purchases mp
  JOIN marketplace_products pr ON pr.id = mp.product_id
  WHERE mp.id = p_purchase_id;

  IF v_seller IS NULL OR v_seller <> auth.uid() THEN
    RETURN json_build_object('success', false, 'message', 'Pedido não encontrado para este vendedor');
  END IF;

  UPDATE marketplace_purchases
  SET status = p_status,
      tracking_code = COALESCE(NULLIF(trim(coalesce(p_tracking_code, '')), ''), tracking_code),
      updated_at = now()
  WHERE id = p_purchase_id;

  INSERT INTO notifications (user_id, type, title, message, read)
  VALUES (
    v_buyer,
    'marketplace_order',
    'Atualização do seu pedido',
    'O pedido de "' || coalesce(v_name, 'produto') || '" agora está: ' || p_status,
    false
  );

  RETURN json_build_object('success', true, 'message', 'Pedido atualizado');
END;
$$;

REVOKE ALL ON FUNCTION public.seller_update_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_update_order_status(uuid, text, text) TO authenticated;