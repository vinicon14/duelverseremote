-- 1) Add XP columns to tcg_profiles
ALTER TABLE public.tcg_profiles
  ADD COLUMN IF NOT EXISTS xp_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS xp_last_daily_claim timestamptz,
  ADD COLUMN IF NOT EXISTS xp_ads_watched integer NOT NULL DEFAULT 0;

-- 2) Helper: compute level from total xp (100 per level, starting at 1)
CREATE OR REPLACE FUNCTION public.compute_xp_level(_total integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(1, (COALESCE(_total,0) / 100) + 1);
$$;

-- 3) Award XP to the caller's active TCG profile
CREATE OR REPLACE FUNCTION public.award_xp(_tcg_type text, _amount integer, _reason text DEFAULT 'generic')
RETURNS TABLE(new_total integer, new_level integer, leveled_up boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old_level integer;
  v_new_total integer;
  v_new_level integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT xp_level INTO v_old_level
  FROM public.tcg_profiles
  WHERE user_id = v_user AND tcg_type = _tcg_type
  LIMIT 1;

  IF v_old_level IS NULL THEN
    RAISE EXCEPTION 'Profile not found for tcg_type %', _tcg_type;
  END IF;

  UPDATE public.tcg_profiles
  SET xp_total = COALESCE(xp_total,0) + _amount,
      xp_level = public.compute_xp_level(COALESCE(xp_total,0) + _amount),
      updated_at = now()
  WHERE user_id = v_user AND tcg_type = _tcg_type
  RETURNING xp_total, xp_level INTO v_new_total, v_new_level;

  RETURN QUERY SELECT v_new_total, v_new_level, (v_new_level > v_old_level);
END;
$$;

-- 4) Claim daily login XP (24h cooldown), default 5
CREATE OR REPLACE FUNCTION public.claim_daily_xp(_tcg_type text, _amount integer DEFAULT 5)
RETURNS TABLE(new_total integer, new_level integer, leveled_up boolean, claimed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_old_level integer;
  v_new_total integer;
  v_new_level integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT xp_last_daily_claim, xp_level
    INTO v_last, v_old_level
  FROM public.tcg_profiles
  WHERE user_id = v_user AND tcg_type = _tcg_type
  LIMIT 1;

  IF v_old_level IS NULL THEN
    RAISE EXCEPTION 'Profile not found for tcg_type %', _tcg_type;
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - interval '24 hours' THEN
    SELECT xp_total, xp_level INTO v_new_total, v_new_level
    FROM public.tcg_profiles WHERE user_id = v_user AND tcg_type = _tcg_type;
    RETURN QUERY SELECT v_new_total, v_new_level, false, false;
    RETURN;
  END IF;

  UPDATE public.tcg_profiles
  SET xp_total = COALESCE(xp_total,0) + _amount,
      xp_level = public.compute_xp_level(COALESCE(xp_total,0) + _amount),
      xp_last_daily_claim = now(),
      updated_at = now()
  WHERE user_id = v_user AND tcg_type = _tcg_type
  RETURNING xp_total, xp_level INTO v_new_total, v_new_level;

  RETURN QUERY SELECT v_new_total, v_new_level, (v_new_level > v_old_level), true;
END;
$$;

-- 5) Watch an ad: every 10 ads grants 100 XP bundle
CREATE OR REPLACE FUNCTION public.claim_ads_xp_bundle(_tcg_type text)
RETURNS TABLE(new_total integer, new_level integer, leveled_up boolean, ads_watched integer, bundle_awarded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old_level integer;
  v_new_ads integer;
  v_award integer := 0;
  v_new_total integer;
  v_new_level integer;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT xp_level INTO v_old_level
  FROM public.tcg_profiles
  WHERE user_id = v_user AND tcg_type = _tcg_type
  LIMIT 1;

  IF v_old_level IS NULL THEN
    RAISE EXCEPTION 'Profile not found for tcg_type %', _tcg_type;
  END IF;

  UPDATE public.tcg_profiles
  SET xp_ads_watched = COALESCE(xp_ads_watched,0) + 1,
      updated_at = now()
  WHERE user_id = v_user AND tcg_type = _tcg_type
  RETURNING xp_ads_watched INTO v_new_ads;

  IF v_new_ads > 0 AND v_new_ads % 10 = 0 THEN
    v_award := 100;
    UPDATE public.tcg_profiles
    SET xp_total = COALESCE(xp_total,0) + v_award,
        xp_level = public.compute_xp_level(COALESCE(xp_total,0) + v_award),
        updated_at = now()
    WHERE user_id = v_user AND tcg_type = _tcg_type
    RETURNING xp_total, xp_level INTO v_new_total, v_new_level;
  ELSE
    SELECT xp_total, xp_level INTO v_new_total, v_new_level
    FROM public.tcg_profiles WHERE user_id = v_user AND tcg_type = _tcg_type;
  END IF;

  RETURN QUERY SELECT v_new_total, v_new_level, (v_new_level > v_old_level), v_new_ads, (v_award > 0);
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.award_xp(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_xp(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ads_xp_bundle(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_xp_level(integer) TO authenticated;