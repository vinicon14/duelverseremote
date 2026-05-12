
ALTER TABLE public.duelcoins_orders 
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount_percent integer NOT NULL DEFAULT 0;

-- Validate coupon (read-only, callable by authenticated users)
CREATE OR REPLACE FUNCTION public.validate_coupon(p_code text)
RETURNS TABLE(valid boolean, discount_percent integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon discount_coupons%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY SELECT false, 0, 'Not authenticated'::text;
    RETURN;
  END IF;

  SELECT * INTO v_coupon
  FROM discount_coupons
  WHERE upper(code) = upper(trim(p_code))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Cupom não encontrado'::text;
    RETURN;
  END IF;

  IF v_coupon.is_active = false THEN
    RETURN QUERY SELECT false, 0, 'Cupom inativo'::text;
    RETURN;
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN QUERY SELECT false, 0, 'Cupom expirado'::text;
    RETURN;
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.times_used >= v_coupon.max_uses THEN
    RETURN QUERY SELECT false, 0, 'Cupom esgotado'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_coupon.discount_percent, 'OK'::text;
END;
$$;

-- Apply coupon atomically (server-side only via service role in edge functions)
CREATE OR REPLACE FUNCTION public.apply_coupon(p_code text)
RETURNS TABLE(success boolean, discount_percent integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon discount_coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_coupon
  FROM discount_coupons
  WHERE upper(code) = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'not_found'::text;
    RETURN;
  END IF;

  IF v_coupon.is_active = false THEN
    RETURN QUERY SELECT false, 0, 'inactive'::text;
    RETURN;
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN QUERY SELECT false, 0, 'expired'::text;
    RETURN;
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.times_used >= v_coupon.max_uses THEN
    RETURN QUERY SELECT false, 0, 'exhausted'::text;
    RETURN;
  END IF;

  UPDATE discount_coupons
    SET times_used = times_used + 1,
        updated_at = now()
    WHERE id = v_coupon.id;

  RETURN QUERY SELECT true, v_coupon.discount_percent, 'OK'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_coupon(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO authenticated;
