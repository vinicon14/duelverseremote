
CREATE OR REPLACE FUNCTION public.award_xp(_tcg_type text, _amount integer, _reason text DEFAULT 'generic'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(xp_level, 1), COALESCE(xp_total, 0)
  INTO v_old_level, v_cur_total
  FROM public.tcg_profiles
  WHERE user_id = v_user AND tcg_type = _tcg_type
  LIMIT 1;

  IF v_old_level IS NULL THEN
    RETURN jsonb_build_object('awarded', 0, 'no_profile', true);
  END IF;

  v_new_total := GREATEST(v_cur_total + _amount, 0);
  v_new_level := public.compute_xp_level(v_new_total);

  UPDATE public.tcg_profiles
  SET xp_total = v_new_total,
      xp_level = v_new_level,
      updated_at = now()
  WHERE user_id = v_user AND tcg_type = _tcg_type;

  RETURN jsonb_build_object(
    'awarded', _amount,
    'reason', _reason,
    'xp_total', v_new_total,
    'xp_level', v_new_level,
    'leveled_up', v_new_level > v_old_level
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_daily_xp(_tcg_type text, _amount integer DEFAULT 5)
 RETURNS TABLE(claimed boolean, leveled_up boolean, new_total integer, new_level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT xp_last_daily_claim, COALESCE(xp_level, 1), COALESCE(xp_total, 0)
  INTO v_last, v_old_level, v_cur_total
  FROM public.tcg_profiles
  WHERE user_id = v_user AND tcg_type = _tcg_type
  LIMIT 1;

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
  WHERE user_id = v_user AND tcg_type = _tcg_type;

  RETURN QUERY SELECT true, (v_new_level > v_old_level), v_new_total, v_new_level;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_ads_xp_bundle(_tcg_type text)
 RETURNS TABLE(bundle_awarded boolean, ads_watched integer, leveled_up boolean, new_total integer, new_level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT COALESCE(xp_ads_watched, 0),
         COALESCE(xp_total, 0),
         COALESCE(xp_level, 1)
  INTO v_cur_ads, v_cur_total, v_old_level
  FROM public.tcg_profiles
  WHERE user_id = v_user AND tcg_type = _tcg_type
  LIMIT 1;

  IF v_old_level IS NULL THEN
    RETURN QUERY SELECT false, 0, false, 0, 1;
    RETURN;
  END IF;

  v_new_ads := v_cur_ads + 1;
  IF v_new_ads % 5 = 0 THEN
    v_award := 100;
  END IF;

  v_new_total := v_cur_total + v_award;
  v_new_level := public.compute_xp_level(v_new_total);

  UPDATE public.tcg_profiles
  SET xp_ads_watched = v_new_ads,
      xp_total = v_new_total,
      xp_level = v_new_level,
      updated_at = now()
  WHERE user_id = v_user AND tcg_type = _tcg_type;

  RETURN QUERY SELECT (v_award > 0), v_new_ads, (v_new_level > v_old_level), v_new_total, v_new_level;
END;
$function$;
