-- EasyPlatform rewarded ads and XP mission rules.
-- Daily rewards:
--   login: 5 XP
--   casual duel: 10 XP
--   5 rewarded ads: 100 XP total
--   forum interaction: 10 XP

ALTER TABLE public.tcg_profiles
  ALTER COLUMN xp_total SET DEFAULT 50,
  ALTER COLUMN xp_level SET DEFAULT 1;

WITH profiles_without_initial_xp AS (
  SELECT tp.user_id, tp.tcg_type
  FROM public.tcg_profiles tp
  WHERE coalesce(tp.xp_total, 0) = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.xp_events xe
      WHERE xe.user_id = tp.user_id
        AND xe.tcg_type = tp.tcg_type
        AND xe.idempotency_key = 'welcome-initial:' || tp.tcg_type
    )
),
seeded_profiles AS (
  UPDATE public.tcg_profiles tp
  SET xp_total = 50,
      xp_level = 1,
      updated_at = now()
  FROM profiles_without_initial_xp seeded
  WHERE tp.user_id = seeded.user_id
    AND tp.tcg_type = seeded.tcg_type
  RETURNING tp.user_id, tp.tcg_type
)
INSERT INTO public.xp_events (
  user_id, tcg_type, amount, reason, idempotency_key, metadata
)
SELECT
  user_id,
  tcg_type,
  50,
  'welcome_initial_xp',
  'welcome-initial:' || tcg_type,
  jsonb_build_object('source', 'existing_profile_seed')
FROM seeded_profiles
ON CONFLICT (user_id, tcg_type, idempotency_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.rewarded_ad_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tcg_type text NOT NULL DEFAULT 'yugioh',
  provider text NOT NULL DEFAULT 'easyplatform',
  ad_session_id text NOT NULL,
  quest_date date NOT NULL DEFAULT CURRENT_DATE,
  xp_awarded boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tcg_type, ad_session_id)
);

CREATE INDEX IF NOT EXISTS idx_rewarded_ad_views_user_tcg_date
  ON public.rewarded_ad_views (user_id, tcg_type, quest_date DESC);

ALTER TABLE public.rewarded_ad_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own rewarded ad views" ON public.rewarded_ad_views;
CREATE POLICY "Users can view own rewarded ad views"
  ON public.rewarded_ad_views
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.ensure_tcg_profile(p_user_id uuid, p_tcg_type text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_profile_id uuid;
  v_username text;
  v_avatar_url text;
BEGIN
  SELECT id INTO v_profile_id
  FROM public.tcg_profiles
  WHERE user_id = p_user_id AND tcg_type = v_tcg;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  SELECT username, avatar_url
  INTO v_username, v_avatar_url
  FROM public.profiles
  WHERE user_id = p_user_id;

  INSERT INTO public.tcg_profiles (user_id, tcg_type, username, avatar_url, xp_total, xp_level)
  VALUES (p_user_id, v_tcg, coalesce(v_username, 'Duelista'), v_avatar_url, 50, 1)
  ON CONFLICT (user_id, tcg_type) DO UPDATE
    SET username = public.tcg_profiles.username
  RETURNING id INTO v_profile_id;

  INSERT INTO public.xp_events (
    user_id, tcg_type, amount, reason, idempotency_key, metadata
  )
  VALUES (
    p_user_id,
    v_tcg,
    50,
    'welcome_initial_xp',
    'welcome-initial:' || v_tcg,
    jsonb_build_object('source', 'account_creation')
  )
  ON CONFLICT (user_id, tcg_type, idempotency_key) DO NOTHING;

  RETURN v_profile_id;
END;
$$;

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
    (p_user_id, v_tcg, 'watch_ad', 5, 100, date_trunc('day', now()) + interval '1 day'),
    (p_user_id, v_tcg, 'forum_interaction', 1, 10, date_trunc('day', now()) + interval '1 day')
  ON CONFLICT (user_id, tcg_type, quest_type, quest_date) DO UPDATE
    SET
      target = EXCLUDED.target,
      reward_xp = EXCLUDED.reward_xp,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    WHERE public.xp_quests.claimed = false;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_xp(p_tcg_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_quest public.xp_quests%ROWTYPE;
  v_award jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.ensure_daily_xp_quests(v_user_id, v_tcg);

  SELECT *
  INTO v_quest
  FROM public.xp_quests
  WHERE user_id = v_user_id
    AND tcg_type = v_tcg
    AND quest_type = 'daily_login'
    AND quest_date = CURRENT_DATE
  FOR UPDATE;

  IF v_quest.claimed THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Recompensa diaria ja coletada',
      'already_claimed', true,
      'xp_earned', 0
    );
  END IF;

  v_award := public.advance_xp_quest(v_user_id, v_tcg, 'daily_login', 1, NULL);

  UPDATE public.tcg_profiles
  SET xp_last_daily_claim = now(),
      updated_at = now()
  WHERE user_id = v_user_id AND tcg_type = v_tcg;

  RETURN v_award || jsonb_build_object('message', 'XP diario coletado!');
END;
$$;

DROP FUNCTION IF EXISTS public.claim_rewarded_ad_xp(text, text, text);
CREATE OR REPLACE FUNCTION public.claim_rewarded_ad_xp(
  p_tcg_type text,
  p_ad_session_id text DEFAULT NULL,
  p_provider text DEFAULT 'easyplatform'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_daily_limit integer := 5;
  v_session_key text;
  v_today_count integer;
  v_view_id uuid;
  v_quest jsonb;
  v_xp_earned integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.ensure_daily_xp_quests(v_user_id, v_tcg);

  SELECT count(*)::integer
  INTO v_today_count
  FROM public.rewarded_ad_views
  WHERE user_id = v_user_id
    AND tcg_type = v_tcg
    AND quest_date = CURRENT_DATE;

  IF v_today_count >= v_daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Limite diario de anuncios atingido',
      'daily_count', v_today_count,
      'daily_limit', v_daily_limit,
      'xp_earned', 0
    );
  END IF;

  v_session_key := coalesce(nullif(trim(p_ad_session_id), ''), gen_random_uuid()::text);

  INSERT INTO public.rewarded_ad_views (
    user_id, tcg_type, provider, ad_session_id, metadata
  )
  VALUES (
    v_user_id,
    v_tcg,
    coalesce(nullif(trim(p_provider), ''), 'easyplatform'),
    v_session_key,
    jsonb_build_object('provider', coalesce(nullif(trim(p_provider), ''), 'easyplatform'))
  )
  ON CONFLICT (user_id, tcg_type, ad_session_id) DO NOTHING
  RETURNING id INTO v_view_id;

  IF v_view_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Anuncio ja registrado',
      'daily_count', v_today_count,
      'daily_limit', v_daily_limit,
      'xp_earned', 0
    );
  END IF;

  v_quest := public.advance_xp_quest(v_user_id, v_tcg, 'watch_ad', 1, v_view_id);
  v_today_count := v_today_count + 1;
  v_xp_earned := coalesce((v_quest ->> 'xp_earned')::integer, 0);

  IF v_xp_earned > 0 THEN
    UPDATE public.rewarded_ad_views
    SET xp_awarded = true
    WHERE id = v_view_id;
  END IF;

  UPDATE public.tcg_profiles
  SET xp_ads_watched = v_today_count,
      updated_at = now()
  WHERE user_id = v_user_id AND tcg_type = v_tcg;

  RETURN jsonb_build_object(
    'success', true,
    'message', CASE WHEN v_xp_earned > 0 THEN 'Bonus de anuncios liberado' ELSE 'Anuncio contabilizado' END,
    'daily_count', v_today_count,
    'daily_limit', v_daily_limit,
    'xp_earned', v_xp_earned,
    'quest', v_quest
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.place_ranked_bet(
  p_tcg_type text,
  p_difficulty text,
  p_xp_bet integer,
  p_duel_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_profile public.tcg_profiles%ROWTYPE;
  v_required_bet integer;
  v_bet_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_required_bet := CASE p_difficulty
    WHEN 'easy' THEN 5
    WHEN 'medium' THEN 20
    WHEN 'hard' THEN 30
    WHEN 'extreme' THEN 50
    WHEN 'insane' THEN 1000
    ELSE 5
  END;

  PERFORM public.ensure_tcg_profile(v_user_id, v_tcg);

  SELECT *
  INTO v_profile
  FROM public.tcg_profiles
  WHERE user_id = v_user_id AND tcg_type = v_tcg
  FOR UPDATE;

  IF v_profile.xp_total < v_required_bet THEN
    RETURN jsonb_build_object('success', false, 'message', 'XP insuficiente');
  END IF;

  INSERT INTO public.ranked_xp_bets (user_id, tcg_type, difficulty, xp_bet, duel_id)
  VALUES (v_user_id, v_tcg, p_difficulty, v_required_bet, p_duel_id)
  RETURNING id INTO v_bet_id;

  PERFORM public.award_tcg_xp(
    v_user_id,
    v_tcg,
    -v_required_bet,
    'ranked_bet_stake',
    'ranked-bet-stake:' || v_bet_id::text,
    p_duel_id,
    jsonb_build_object('difficulty', p_difficulty)
  );

  RETURN jsonb_build_object(
    'success', true,
    'bet_id', v_bet_id,
    'xp_bet', v_required_bet,
    'difficulty', p_difficulty,
    'message', 'Aposta realizada!'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_ranked_bet(p_bet_id uuid, p_won boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_bet public.ranked_xp_bets%ROWTYPE;
  v_xp_won integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_bet
  FROM public.ranked_xp_bets
  WHERE id = p_bet_id
    AND user_id = v_user_id
    AND result = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_xp_won := CASE WHEN p_won THEN v_bet.xp_bet ELSE 0 END;

  UPDATE public.ranked_xp_bets
  SET result = CASE WHEN p_won THEN 'win' ELSE 'loss' END,
      xp_won = v_xp_won,
      resolved_at = now()
  WHERE id = v_bet.id;

  IF p_won THEN
    PERFORM public.award_tcg_xp(
      v_user_id,
      v_bet.tcg_type,
      v_xp_won,
      'ranked_bet_win',
      'ranked-bet-win:' || v_bet.id::text,
      v_bet.duel_id,
      jsonb_build_object('difficulty', v_bet.difficulty)
    );
  END IF;

  RETURN v_xp_won;
END;
$$;

UPDATE public.xp_quests
SET target = 5,
    reward_xp = 100,
    progress = least(progress, 5),
    claimed = progress >= 5,
    updated_at = now()
WHERE quest_type = 'watch_ad'
  AND quest_date >= CURRENT_DATE;

INSERT INTO public.xp_quests (user_id, tcg_type, quest_type, target, reward_xp, expires_at)
SELECT user_id, tcg_type, 'forum_interaction', 1, 10, date_trunc('day', now()) + interval '1 day'
FROM public.tcg_profiles
ON CONFLICT (user_id, tcg_type, quest_type, quest_date) DO NOTHING;

GRANT SELECT ON public.rewarded_ad_views TO authenticated;
REVOKE ALL ON FUNCTION public.claim_rewarded_ad_xp(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_rewarded_ad_xp(text, text, text) TO authenticated;

COMMENT ON FUNCTION public.claim_rewarded_ad_xp(text, text, text) IS
  'Counts one completed rewarded ad view. Awards 100 XP only when the daily 5-ad mission is completed.';
