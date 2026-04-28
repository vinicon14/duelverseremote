-- Canonical TCG keys and separate XP system.
-- Canonical keys: yugioh, genesis, rush_duel.

CREATE OR REPLACE FUNCTION public.normalize_tcg_type(p_tcg_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_tcg_type, 'yugioh'))
    WHEN 'magic' THEN 'genesis'
    WHEN 'genesis' THEN 'genesis'
    WHEN 'pokemon' THEN 'rush_duel'
    WHEN 'rush_duel' THEN 'rush_duel'
    ELSE 'yugioh'
  END
$$;

ALTER TABLE public.tcg_profiles
  ADD COLUMN IF NOT EXISTS xp_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS xp_last_daily_claim timestamptz,
  ADD COLUMN IF NOT EXISTS xp_ads_watched integer NOT NULL DEFAULT 0;

UPDATE public.tcg_profiles AS target
SET
  wins = GREATEST(target.wins, legacy.wins),
  losses = GREATEST(target.losses, legacy.losses),
  points = GREATEST(target.points, legacy.points),
  level = GREATEST(target.level, legacy.level),
  xp_total = GREATEST(target.xp_total, legacy.xp_total),
  xp_level = GREATEST(target.xp_level, legacy.xp_level),
  xp_last_daily_claim = COALESCE(target.xp_last_daily_claim, legacy.xp_last_daily_claim),
  xp_ads_watched = GREATEST(target.xp_ads_watched, legacy.xp_ads_watched)
FROM public.tcg_profiles AS legacy
WHERE target.user_id = legacy.user_id
  AND target.tcg_type = 'genesis'
  AND legacy.tcg_type = 'magic';

DELETE FROM public.tcg_profiles AS legacy
USING public.tcg_profiles AS target
WHERE target.user_id = legacy.user_id
  AND target.tcg_type = 'genesis'
  AND legacy.tcg_type = 'magic';

UPDATE public.tcg_profiles AS target
SET
  wins = GREATEST(target.wins, legacy.wins),
  losses = GREATEST(target.losses, legacy.losses),
  points = GREATEST(target.points, legacy.points),
  level = GREATEST(target.level, legacy.level),
  xp_total = GREATEST(target.xp_total, legacy.xp_total),
  xp_level = GREATEST(target.xp_level, legacy.xp_level),
  xp_last_daily_claim = COALESCE(target.xp_last_daily_claim, legacy.xp_last_daily_claim),
  xp_ads_watched = GREATEST(target.xp_ads_watched, legacy.xp_ads_watched)
FROM public.tcg_profiles AS legacy
WHERE target.user_id = legacy.user_id
  AND target.tcg_type = 'rush_duel'
  AND legacy.tcg_type = 'pokemon';

DELETE FROM public.tcg_profiles AS legacy
USING public.tcg_profiles AS target
WHERE target.user_id = legacy.user_id
  AND target.tcg_type = 'rush_duel'
  AND legacy.tcg_type = 'pokemon';

UPDATE public.tcg_profiles
SET tcg_type = public.normalize_tcg_type(tcg_type)
WHERE tcg_type IN ('magic', 'pokemon');

UPDATE public.saved_decks
SET tcg_type = public.normalize_tcg_type(tcg_type)
WHERE tcg_type IN ('magic', 'pokemon');

UPDATE public.live_duels
SET tcg_type = public.normalize_tcg_type(tcg_type)
WHERE tcg_type IN ('magic', 'pokemon');

UPDATE public.matchmaking_queue
SET tcg_type = public.normalize_tcg_type(tcg_type)
WHERE tcg_type IN ('magic', 'pokemon');

UPDATE public.global_chat_messages
SET tcg_type = public.normalize_tcg_type(tcg_type)
WHERE tcg_type IN ('magic', 'pokemon');

UPDATE public.tournaments
SET tcg_type = public.normalize_tcg_type(tcg_type)
WHERE tcg_type IN ('magic', 'pokemon');

UPDATE public.genesis_card_costs
SET updated_at = updated_at;

COMMENT ON TABLE public.genesis_card_costs IS
  'Card point costs for the Genesis format. Genesis uses canonical tcg_type genesis.';

CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tcg_type text NOT NULL DEFAULT 'yugioh',
  amount integer NOT NULL CHECK (amount <> 0),
  reason text NOT NULL,
  source_id uuid,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tcg_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_tcg_created
  ON public.xp_events (user_id, tcg_type, created_at DESC);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own xp events" ON public.xp_events;
CREATE POLICY "Users can view own xp events"
  ON public.xp_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.xp_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tcg_type text NOT NULL DEFAULT 'yugioh',
  quest_type text NOT NULL,
  quest_date date NOT NULL DEFAULT CURRENT_DATE,
  progress integer NOT NULL DEFAULT 0,
  target integer NOT NULL,
  reward_xp integer NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (date_trunc('day', now()) + interval '1 day'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tcg_type, quest_type, quest_date)
);

CREATE INDEX IF NOT EXISTS idx_xp_quests_user_tcg_date
  ON public.xp_quests (user_id, tcg_type, quest_date DESC);

ALTER TABLE public.xp_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own xp quests" ON public.xp_quests;
CREATE POLICY "Users can view own xp quests"
  ON public.xp_quests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.ranked_xp_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tcg_type text NOT NULL DEFAULT 'yugioh',
  difficulty text NOT NULL,
  xp_bet integer NOT NULL CHECK (xp_bet > 0),
  xp_won integer NOT NULL DEFAULT 0,
  result text NOT NULL DEFAULT 'pending',
  duel_id uuid REFERENCES public.live_duels(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ranked_xp_bets_user_pending
  ON public.ranked_xp_bets (user_id, tcg_type, result, created_at DESC);

ALTER TABLE public.ranked_xp_bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ranked xp bets" ON public.ranked_xp_bets;
CREATE POLICY "Users can view own ranked xp bets"
  ON public.ranked_xp_bets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DO $$
BEGIN
  IF to_regclass('public.quests') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.quests FROM anon';
  END IF;
  IF to_regclass('public.ranked_bets') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ranked_bets ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.ranked_bets FROM anon';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.calculate_xp_level(p_xp_total integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT floor(greatest(coalesce(p_xp_total, 0), 0) / 100)::integer + 1
$$;

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

  INSERT INTO public.tcg_profiles (user_id, tcg_type, username, avatar_url)
  VALUES (p_user_id, v_tcg, coalesce(v_username, 'Duelista'), v_avatar_url)
  ON CONFLICT (user_id, tcg_type) DO UPDATE
    SET username = public.tcg_profiles.username
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_tcg_xp(
  p_user_id uuid,
  p_tcg_type text,
  p_amount integer,
  p_reason text,
  p_idempotency_key text,
  p_source_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_event_id uuid;
  v_xp_total integer;
  v_xp_level integer;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF p_amount = 0 THEN
    RAISE EXCEPTION 'XP amount must be non-zero';
  END IF;

  PERFORM public.ensure_tcg_profile(p_user_id, v_tcg);

  INSERT INTO public.xp_events (
    user_id, tcg_type, amount, reason, source_id, idempotency_key, metadata
  )
  VALUES (
    p_user_id, v_tcg, p_amount, p_reason, p_source_id, p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (user_id, tcg_type, idempotency_key) DO NOTHING
  RETURNING id INTO v_event_id;

  SELECT xp_total, xp_level
  INTO v_xp_total, v_xp_level
  FROM public.tcg_profiles
  WHERE user_id = p_user_id AND tcg_type = v_tcg;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'already_awarded', true,
      'xp_earned', 0,
      'xp_total', coalesce(v_xp_total, 0),
      'xp_level', coalesce(v_xp_level, 1)
    );
  END IF;

  UPDATE public.tcg_profiles
  SET
    xp_total = greatest(coalesce(xp_total, 0) + p_amount, 0),
    xp_level = public.calculate_xp_level(greatest(coalesce(xp_total, 0) + p_amount, 0)),
    updated_at = now()
  WHERE user_id = p_user_id AND tcg_type = v_tcg
  RETURNING xp_total, xp_level INTO v_xp_total, v_xp_level;

  RETURN jsonb_build_object(
    'success', true,
    'already_awarded', false,
    'xp_earned', p_amount,
    'xp_total', v_xp_total,
    'xp_level', v_xp_level
  );
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
    (p_user_id, v_tcg, 'play_ranked', 1, 20, date_trunc('day', now()) + interval '1 day'),
    (p_user_id, v_tcg, 'watch_ad', 1, 100, date_trunc('day', now()) + interval '1 day')
  ON CONFLICT (user_id, tcg_type, quest_type, quest_date) DO NOTHING;

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

  IF v_quest.claimed THEN
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

DROP FUNCTION IF EXISTS public.claim_daily_xp(uuid, text);
CREATE OR REPLACE FUNCTION public.claim_daily_xp(p_tcg_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tcg text := public.normalize_tcg_type(p_tcg_type);
  v_last_claim timestamptz;
  v_award jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.ensure_tcg_profile(v_user_id, v_tcg);

  SELECT xp_last_daily_claim
  INTO v_last_claim
  FROM public.tcg_profiles
  WHERE user_id = v_user_id AND tcg_type = v_tcg
  FOR UPDATE;

  IF v_last_claim IS NOT NULL AND v_last_claim::date = CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Recompensa diaria ja coletada',
      'already_claimed', true
    );
  END IF;

  v_award := public.award_tcg_xp(
    v_user_id,
    v_tcg,
    5,
    'daily_login',
    'daily-login:' || v_tcg || ':' || CURRENT_DATE::text,
    NULL,
    '{}'::jsonb
  );

  UPDATE public.tcg_profiles
  SET xp_last_daily_claim = now(),
      updated_at = now()
  WHERE user_id = v_user_id AND tcg_type = v_tcg;

  PERFORM public.advance_xp_quest(v_user_id, v_tcg, 'daily_login', 1, NULL);

  RETURN v_award || jsonb_build_object('message', 'XP diario coletado!');
END;
$$;

DROP FUNCTION IF EXISTS public.complete_quest(uuid, text, text);
CREATE OR REPLACE FUNCTION public.complete_quest(p_tcg_type text, p_quest_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN public.advance_xp_quest(v_user_id, p_tcg_type, p_quest_type, 1, NULL);
END;
$$;

DROP FUNCTION IF EXISTS public.place_ranked_bet(uuid, text, text, integer);
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
  v_min_bet integer;
  v_bet_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_min_bet := CASE p_difficulty
    WHEN 'easy' THEN 5
    WHEN 'medium' THEN 20
    WHEN 'hard' THEN 30
    WHEN 'extreme' THEN 50
    WHEN 'insane' THEN 1000
    ELSE 5
  END;

  IF p_xp_bet < v_min_bet THEN
    RETURN jsonb_build_object('success', false, 'message', 'XP insuficiente para esta dificuldade');
  END IF;

  PERFORM public.ensure_tcg_profile(v_user_id, v_tcg);

  SELECT *
  INTO v_profile
  FROM public.tcg_profiles
  WHERE user_id = v_user_id AND tcg_type = v_tcg
  FOR UPDATE;

  IF v_profile.xp_total < p_xp_bet THEN
    RETURN jsonb_build_object('success', false, 'message', 'XP insuficiente');
  END IF;

  INSERT INTO public.ranked_xp_bets (user_id, tcg_type, difficulty, xp_bet, duel_id)
  VALUES (v_user_id, v_tcg, p_difficulty, p_xp_bet, p_duel_id)
  RETURNING id INTO v_bet_id;

  PERFORM public.award_tcg_xp(
    v_user_id,
    v_tcg,
    -p_xp_bet,
    'ranked_bet_stake',
    'ranked-bet-stake:' || v_bet_id::text,
    p_duel_id,
    jsonb_build_object('difficulty', p_difficulty)
  );

  RETURN jsonb_build_object(
    'success', true,
    'bet_id', v_bet_id,
    'xp_bet', p_xp_bet,
    'difficulty', p_difficulty,
    'message', 'Aposta realizada!'
  );
END;
$$;

DROP FUNCTION IF EXISTS public.resolve_ranked_bet(uuid, text, text, boolean);
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

  v_xp_won := CASE WHEN p_won THEN v_bet.xp_bet * 2 ELSE 0 END;

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

DROP FUNCTION IF EXISTS public.generate_daily_quests();
CREATE OR REPLACE FUNCTION public.generate_daily_quests(p_tcg_type text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tcg text;
  v_inserted integer := 0;
  v_profile record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tcg_type IS NOT NULL THEN
    RETURN public.ensure_daily_xp_quests(v_user_id, p_tcg_type);
  END IF;

  FOR v_profile IN
    SELECT tcg_type FROM public.tcg_profiles WHERE user_id = v_user_id
  LOOP
    v_tcg := public.normalize_tcg_type(v_profile.tcg_type);
    v_inserted := v_inserted + public.ensure_daily_xp_quests(v_user_id, v_tcg);
  END LOOP;

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard(limit_count integer DEFAULT 50, p_tcg_type text DEFAULT 'yugioh'::text)
RETURNS TABLE(user_id uuid, username text, avatar_url text, wins integer, losses integer, points integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    tp.user_id,
    tp.username,
    COALESCE(tp.avatar_url, p.avatar_url) AS avatar_url,
    tp.wins,
    tp.losses,
    tp.points
  FROM public.tcg_profiles tp
  LEFT JOIN public.profiles p ON p.user_id = tp.user_id
  WHERE tp.tcg_type = public.normalize_tcg_type(p_tcg_type)
  ORDER BY tp.points DESC, tp.wins DESC
  LIMIT limit_count;
$$;

CREATE OR REPLACE FUNCTION public.record_match_result(
  p_duel_id uuid,
  p_player1_id uuid,
  p_player2_id uuid,
  p_winner_id uuid,
  p_player1_score integer,
  p_player2_score integer,
  p_bet_amount integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_match_id uuid;
  v_duel_status game_status;
  v_duel_creator uuid;
  v_duel_opponent uuid;
  v_is_ranked boolean;
  v_tcg_type text;
  v_points_change integer;
  v_loser_id uuid;
  v_completion_xp integer;
BEGIN
  IF auth.uid() NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Unauthorized: You must be a participant in this duel';
  END IF;

  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Invalid winner: Must be one of the players or NULL for draw';
  END IF;

  SELECT status, creator_id, opponent_id, is_ranked, public.normalize_tcg_type(tcg_type)
  INTO v_duel_status, v_duel_creator, v_duel_opponent, v_is_ranked, v_tcg_type
  FROM public.live_duels
  WHERE id = p_duel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;

  IF v_duel_status != 'in_progress' AND v_duel_status != 'finished' THEN
    RAISE EXCEPTION 'Duel must be in progress or finished to record results';
  END IF;

  IF NOT ((v_duel_creator = p_player1_id AND v_duel_opponent = p_player2_id) OR
          (v_duel_creator = p_player2_id AND v_duel_opponent = p_player1_id)) THEN
    RAISE EXCEPTION 'Player IDs do not match duel participants';
  END IF;

  INSERT INTO public.match_history (
    player1_id,
    player2_id,
    winner_id,
    player1_score,
    player2_score,
    bet_amount
  ) VALUES (
    p_player1_id,
    p_player2_id,
    p_winner_id,
    p_player1_score,
    p_player2_score,
    p_bet_amount
  )
  RETURNING id INTO v_match_id;

  PERFORM public.ensure_tcg_profile(p_player1_id, v_tcg_type);
  PERFORM public.ensure_tcg_profile(p_player2_id, v_tcg_type);

  v_completion_xp := CASE WHEN v_is_ranked THEN 20 ELSE 10 END;

  PERFORM public.award_tcg_xp(
    p_player1_id,
    v_tcg_type,
    v_completion_xp,
    CASE WHEN v_is_ranked THEN 'play_ranked' ELSE 'play_casual' END,
    'duel:' || p_duel_id::text || ':player:' || p_player1_id::text,
    p_duel_id,
    jsonb_build_object('match_id', v_match_id)
  );

  PERFORM public.award_tcg_xp(
    p_player2_id,
    v_tcg_type,
    v_completion_xp,
    CASE WHEN v_is_ranked THEN 'play_ranked' ELSE 'play_casual' END,
    'duel:' || p_duel_id::text || ':player:' || p_player2_id::text,
    p_duel_id,
    jsonb_build_object('match_id', v_match_id)
  );

  PERFORM public.advance_xp_quest(
    p_player1_id,
    v_tcg_type,
    CASE WHEN v_is_ranked THEN 'play_ranked' ELSE 'play_casual' END,
    1,
    p_duel_id
  );

  PERFORM public.advance_xp_quest(
    p_player2_id,
    v_tcg_type,
    CASE WHEN v_is_ranked THEN 'play_ranked' ELSE 'play_casual' END,
    1,
    p_duel_id
  );

  IF p_winner_id IS NOT NULL THEN
    v_loser_id := CASE WHEN p_winner_id = p_player1_id THEN p_player2_id ELSE p_player1_id END;

    IF v_is_ranked THEN
      IF p_bet_amount > 0 THEN
        v_points_change := p_bet_amount;
      ELSE
        IF p_winner_id = p_player1_id THEN
          v_points_change := 10 + (p_player1_score / 100);
        ELSE
          v_points_change := 10 + (p_player2_score / 100);
        END IF;
      END IF;

      UPDATE public.profiles
      SET wins = wins + 1,
          points = points + v_points_change
      WHERE user_id = p_winner_id;

      UPDATE public.profiles
      SET losses = losses + 1,
          points = greatest(points - (v_points_change / 2), 0)
      WHERE user_id = v_loser_id;

      UPDATE public.tcg_profiles
      SET wins = wins + 1,
          points = points + v_points_change,
          updated_at = now()
      WHERE user_id = p_winner_id AND tcg_type = v_tcg_type;

      UPDATE public.tcg_profiles
      SET losses = losses + 1,
          points = greatest(points - (v_points_change / 2), 0),
          updated_at = now()
      WHERE user_id = v_loser_id AND tcg_type = v_tcg_type;
    ELSE
      UPDATE public.profiles
      SET wins = wins + 1
      WHERE user_id = p_winner_id;

      UPDATE public.profiles
      SET losses = losses + 1
      WHERE user_id = v_loser_id;

      UPDATE public.tcg_profiles
      SET wins = wins + 1,
          updated_at = now()
      WHERE user_id = p_winner_id AND tcg_type = v_tcg_type;

      UPDATE public.tcg_profiles
      SET losses = losses + 1,
          updated_at = now()
      WHERE user_id = v_loser_id AND tcg_type = v_tcg_type;
    END IF;
  END IF;

  RETURN v_match_id;
END;
$$;

GRANT SELECT ON public.xp_events TO authenticated;
GRANT SELECT ON public.xp_quests TO authenticated;
GRANT SELECT ON public.ranked_xp_bets TO authenticated;

REVOKE ALL ON FUNCTION public.ensure_tcg_profile(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_tcg_xp(uuid, text, integer, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_daily_xp_quests(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.advance_xp_quest(uuid, text, text, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_daily_xp(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_quest(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_daily_quests(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_ranked_bet(text, text, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_ranked_bet(uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_daily_xp(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_quest(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_daily_quests(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_ranked_bet(text, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_ranked_bet(uuid, boolean) TO authenticated;
