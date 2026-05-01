-- Backfill: unify XP per user using the highest existing values
WITH unified AS (
  SELECT
    user_id,
    MAX(COALESCE(xp_total, 0)) AS xp_total,
    MAX(COALESCE(xp_level, 1)) AS xp_level,
    MAX(xp_last_daily_claim)   AS xp_last_daily_claim,
    MAX(COALESCE(xp_ads_watched, 0)) AS xp_ads_watched
  FROM public.tcg_profiles
  GROUP BY user_id
)
UPDATE public.tcg_profiles tp
SET xp_total = u.xp_total,
    xp_level = u.xp_level,
    xp_last_daily_claim = u.xp_last_daily_claim,
    xp_ads_watched = u.xp_ads_watched
FROM unified u
WHERE tp.user_id = u.user_id;

-- Drop existing functions to allow return-type / signature change
DROP FUNCTION IF EXISTS public.award_xp(text, integer, text);
DROP FUNCTION IF EXISTS public.claim_daily_xp(text, integer);
DROP FUNCTION IF EXISTS public.claim_daily_xp(text);
DROP FUNCTION IF EXISTS public.claim_daily_xp(uuid, text);
DROP FUNCTION IF EXISTS public.claim_ads_xp_bundle(text);

-- award_xp: unified across user's TCG profiles
CREATE OR REPLACE FUNCTION public.award_xp(_tcg_type text, _amount integer, _reason text DEFAULT 'generic')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old_level int;
  v_cur_total int;
  v_new_total int;
  v_new_level int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF _amount IS NULL OR _amount = 0 THEN
    RETURN jsonb_build_object('awarded', 0);
  END IF;

  SELECT MAX(COALESCE(xp_level, 1)), MAX(COALESCE(xp_total, 0))
  INTO v_old_level, v_cur_total
  FROM public.tcg_profiles
  WHERE user_id = v_user;

  IF v_old_level IS NULL THEN
    RETURN jsonb_build_object('awarded', 0, 'no_profile', true);
  END IF;

  v_new_total := GREATEST(v_cur_total + _amount, 0);
  v_new_level := public.compute_xp_level(v_new_total);

  UPDATE public.tcg_profiles
  SET xp_total = v_new_total,
      xp_level = v_new_level,
      updated_at = now()
  WHERE user_id = v_user;

  RETURN jsonb_build_object(
    'awarded', _amount,
    'reason', _reason,
    'xp_total', v_new_total,
    'xp_level', v_new_level,
    'leveled_up', v_new_level > v_old_level
  );
END;
$$;

-- claim_daily_xp: shared cooldown
CREATE OR REPLACE FUNCTION public.claim_daily_xp(_tcg_type text, _amount integer DEFAULT 5)
RETURNS TABLE (claimed boolean, leveled_up boolean, new_total int, new_level int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_last timestamptz;
  v_old_level int;
  v_cur_total int;
  v_new_total int;
  v_new_level int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT MAX(xp_last_daily_claim),
         MAX(COALESCE(xp_level, 1)),
         MAX(COALESCE(xp_total, 0))
  INTO v_last, v_old_level, v_cur_total
  FROM public.tcg_profiles
  WHERE user_id = v_user;

  IF v_old_level IS NULL THEN
    RETURN QUERY SELECT false, false, 0, 1;
    RETURN;
  END IF;

  IF v_last IS NOT NULL AND v_last > now() - interval '24 hours' THEN
    RETURN QUERY SELECT false, false, v_cur_total, v_old_level;
    RETURN;
  END IF;

  v_new_total := v_cur_total + _amount;
  v_new_level := public.compute_xp_level(v_new_total);

  UPDATE public.tcg_profiles
  SET xp_total = v_new_total,
      xp_level = v_new_level,
      xp_last_daily_claim = now(),
      updated_at = now()
  WHERE user_id = v_user;

  RETURN QUERY SELECT true, (v_new_level > v_old_level), v_new_total, v_new_level;
END;
$$;

-- claim_ads_xp_bundle: shared ads counter
CREATE OR REPLACE FUNCTION public.claim_ads_xp_bundle(_tcg_type text)
RETURNS TABLE (bundle_awarded boolean, ads_watched int, leveled_up boolean, new_total int, new_level int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_old_level int;
  v_cur_ads int;
  v_cur_total int;
  v_new_ads int;
  v_award int := 0;
  v_new_total int;
  v_new_level int;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT MAX(COALESCE(xp_ads_watched, 0)),
         MAX(COALESCE(xp_total, 0)),
         MAX(COALESCE(xp_level, 1))
  INTO v_cur_ads, v_cur_total, v_old_level
  FROM public.tcg_profiles
  WHERE user_id = v_user;

  IF v_old_level IS NULL THEN
    RETURN QUERY SELECT false, 0, false, 0, 1;
    RETURN;
  END IF;

  v_new_ads := v_cur_ads + 1;
  IF v_new_ads % 10 = 0 THEN
    v_award := 100;
  END IF;

  v_new_total := v_cur_total + v_award;
  v_new_level := public.compute_xp_level(v_new_total);

  UPDATE public.tcg_profiles
  SET xp_ads_watched = v_new_ads,
      xp_total = v_new_total,
      xp_level = v_new_level,
      updated_at = now()
  WHERE user_id = v_user;

  RETURN QUERY SELECT (v_award > 0), v_new_ads, (v_new_level > v_old_level), v_new_total, v_new_level;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_xp(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_xp(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ads_xp_bundle(text) TO authenticated;