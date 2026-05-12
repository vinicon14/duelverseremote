
-- Make apply_coupon validation-only (no increment), restrict to service_role
CREATE OR REPLACE FUNCTION public.apply_coupon(p_code text)
RETURNS TABLE(success boolean, discount_percent integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coupon discount_coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_coupon
  FROM discount_coupons
  WHERE upper(code) = upper(trim(p_code))
  LIMIT 1;

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

  RETURN QUERY SELECT true, v_coupon.discount_percent, 'OK'::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_coupon(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_coupon(text) TO service_role;

-- New: atomic consume function, called from webhook on confirmed payment
CREATE OR REPLACE FUNCTION public.consume_coupon(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coupon discount_coupons%ROWTYPE;
BEGIN
  SELECT * INTO v_coupon
  FROM discount_coupons
  WHERE upper(code) = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND OR v_coupon.is_active = false THEN
    RETURN false;
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN false;
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.times_used >= v_coupon.max_uses THEN
    RETURN false;
  END IF;

  UPDATE discount_coupons
    SET times_used = times_used + 1,
        updated_at = now()
    WHERE id = v_coupon.id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_coupon(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_coupon(text) TO service_role;
