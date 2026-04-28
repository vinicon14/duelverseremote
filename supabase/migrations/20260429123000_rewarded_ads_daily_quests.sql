-- Rewarded video ads and daily quest tuning.
-- Platform used on the client: Google Ad Manager Rewarded Ads via Google Publisher Tag.

CREATE OR REPLACE FUNCTION public.ensure_daily_xp_quests(p_user_id uuid, p_tcg_type text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_inserted integer;
BEGIN
  PERFORM public.ensure_tcg_profile(p_user_id, v_tcg);

  INSERT INTO public.xp_quests (user_id, tcg_type, quest_type, target, reward_xp, expires_at)
  VALUES
    (p_user_id, v_tcg, 'daily_login', 1, 5, date_trunc('day', now()) + interval '1 day'),
    (p_user_id, v_tcg, 'play_casual', 1, 10, date_trunc('day', now()) + interval '1 day'),
    (p_user_id, v_tcg, 'play_ranked', 1, 20, date_trunc('day', now()) + interval '1 day'),
    (p_user_id, v_tcg, 'watch_ad', 5, 0, date_trunc('day', now()) + interval '1 day')
  ON CONFLICT (user_id, tcg_type, quest_type, quest_date) DO UPDATE
    SET
      target = EXCLUDED.target,
      reward_xp = EXCLUDED.reward_xp,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    WHERE public.xp_quests.quest_type = 'watch_ad'
      AND public.xp_quests.claimed = false;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_xp_quest(
  p_user_id uuid,
  p_tcg_type text,
  p_quest_type text,
  p_increment integer DEFAULT 1,
  p_source_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_quest public.xp_quests%ROWTYPE;
  v_new_progress integer;
  v_award jsonb;
BEGIN
  PERFORM public.ensure_daily_xp_quests(p_user_id, v_tcg);

  SELECT *
  INTO v_quest
  FROM public.xp_quests
  WHERE user_id = p_user_id
    AND tcg_type = v_tcg
    AND quest_type = p_quest_type
    AND quest_date = CURRENT_DATE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quest not found');
  END IF;

  IF v_quest.claimed THEN
    RETURN jsonb_build_object(
      'success', true,
      'claimed', true,
      'xp_earned', 0,
      'progress', v_quest.progress,
      'target', v_quest.target
    );
  END IF;

  v_new_progress := least(v_quest.progress + greatest(p_increment, 1), v_quest.target);

  UPDATE public.xp_quests
  SET progress = v_new_progress,
      claimed = v_new_progress >= target,
      updated_at = now()
  WHERE id = v_quest.id
  RETURNING * INTO v_quest;

  IF v_quest.claimed AND v_quest.reward_xp > 0 THEN
    v_award := public.award_tcg_xp(
      p_user_id,
      v_tcg,
      v_quest.reward_xp,
      'quest:' || p_quest_type,
      'quest:' || v_quest.id::text,
      p_source_id,
      jsonb_build_object('quest_type', p_quest_type)
    );
  ELSE
    v_award := jsonb_build_object('success', true, 'xp_earned', 0);
  END IF;

  RETURN v_award || jsonb_build_object(
    'progress', v_quest.progress,
    'target', v_quest.target,
    'claimed', v_quest.claimed
  );
END;
$$;

UPDATE public.xp_quests
SET
  target = 5,
  reward_xp = 0,
  progress = least(progress, 5),
  claimed = progress >= 5,
  updated_at = now()
WHERE quest_type = 'watch_ad'
  AND quest_date >= CURRENT_DATE;

DROP FUNCTION IF EXISTS public.claim_rewarded_ad_xp(text, text, text);
CREATE OR REPLACE FUNCTION public.claim_rewarded_ad_xp(
  p_tcg_type text,
  p_ad_session_id text DEFAULT NULL,
  p_provider text DEFAULT 'google_ad_manager'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_profile_id uuid;
  v_today_count integer;
  v_daily_limit integer := 5;
  v_reward_xp integer := 100;
  v_session_key text;
  v_award jsonb;
  v_quest jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_profile_id := public.ensure_tcg_profile(v_user_id, v_tcg);

  SELECT id
  INTO v_profile_id
  FROM public.tcg_profiles
  WHERE user_id = v_user_id AND tcg_type = v_tcg
  FOR UPDATE;

  SELECT count(*)::integer
  INTO v_today_count
  FROM public.xp_events
  WHERE user_id = v_user_id
    AND tcg_type = v_tcg
    AND reason = 'rewarded_ad'
    AND created_at::date = CURRENT_DATE;

  IF v_today_count >= v_daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Limite diario de anuncios atingido',
      'daily_count', v_today_count,
      'daily_limit', v_daily_limit
    );
  END IF;

  v_session_key := coalesce(nullif(trim(p_ad_session_id), ''), gen_random_uuid()::text);

  v_award := public.award_tcg_xp(
    v_user_id,
    v_tcg,
    v_reward_xp,
    'rewarded_ad',
    'rewarded-ad:' || v_tcg || ':' || CURRENT_DATE::text || ':' || v_session_key,
    NULL,
    jsonb_build_object(
      'provider', coalesce(nullif(trim(p_provider), ''), 'google_ad_manager'),
      'ad_session_id', v_session_key
    )
  );

  IF coalesce((v_award ->> 'success')::boolean, false) THEN
    UPDATE public.tcg_profiles
    SET xp_ads_watched = coalesce(xp_ads_watched, 0) + 1,
        updated_at = now()
    WHERE user_id = v_user_id AND tcg_type = v_tcg;

    v_quest := public.advance_xp_quest(v_user_id, v_tcg, 'watch_ad', 1, NULL);
    v_today_count := v_today_count + 1;
  ELSE
    v_quest := jsonb_build_object('success', false, 'already_awarded', true);
  END IF;

  RETURN v_award || jsonb_build_object(
    'daily_count', v_today_count,
    'daily_limit', v_daily_limit,
    'quest', v_quest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_rewarded_ad_xp(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_rewarded_ad_xp(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.claim_rewarded_ad_xp(text, text, text) IS
  'Awards 100 XP for a completed Google Ad Manager rewarded video, max 5 rewards per user/TCG/day.';
