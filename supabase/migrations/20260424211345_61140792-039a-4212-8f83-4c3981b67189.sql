CREATE OR REPLACE FUNCTION public.matchmake(p_user_id uuid, p_match_type text, p_tcg_type text DEFAULT 'yugioh'::text, p_max_players integer DEFAULT 2, p_language_code text DEFAULT 'en'::text)
 RETURNS TABLE(duel_id uuid, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_duel uuid;
  v_opponent record;
  v_new_duel uuid;
  v_default_lp integer;
  v_default_bet integer;
BEGIN
  -- Defaults per TCG
  IF p_tcg_type = 'magic' THEN
    v_default_lp := 40;
    v_default_bet := 0;
  ELSIF p_tcg_type = 'pokemon' THEN
    v_default_lp := 6;
    v_default_bet := 0;
  ELSE
    v_default_lp := 8000;
    v_default_bet := 0;
  END IF;

  -- If user already has an active duel matched, return it
  SELECT mq.duel_id INTO v_existing_duel
  FROM public.matchmaking_queue mq
  WHERE mq.user_id = p_user_id
    AND mq.status = 'matched'
    AND mq.duel_id IS NOT NULL
  ORDER BY mq.joined_at DESC
  LIMIT 1;

  IF v_existing_duel IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_duel, 'matched'::text;
    RETURN;
  END IF;

  -- Try to find a waiting opponent with same language + tcg + mode
  SELECT mq.* INTO v_opponent
  FROM public.matchmaking_queue mq
  WHERE mq.status = 'waiting'
    AND mq.user_id <> p_user_id
    AND mq.tcg_type = p_tcg_type
    AND mq.language_code = p_language_code
    AND mq.match_type = p_match_type
    AND mq.max_players = p_max_players
    AND mq.expires_at > now()
  ORDER BY mq.joined_at ASC
  LIMIT 1;

  IF v_opponent.user_id IS NOT NULL THEN
    -- Create the duel
    INSERT INTO public.live_duels (
      creator_id, opponent_id, status, tcg_type,
      player1_lp, player2_lp, bet_amount, max_players
    )
    VALUES (
      v_opponent.user_id, p_user_id, 'in_progress', p_tcg_type,
      v_default_lp, v_default_lp, v_default_bet, p_max_players
    )
    RETURNING id INTO v_new_duel;

    -- Mark both as matched (qualify column to avoid ambiguity with OUT param)
    UPDATE public.matchmaking_queue AS mq
    SET status = 'matched', duel_id = v_new_duel
    WHERE mq.user_id IN (p_user_id, v_opponent.user_id)
      AND mq.status = 'waiting';

    -- Insert players rows for both
    INSERT INTO public.players (duel_id, user_id) VALUES
      (v_new_duel, v_opponent.user_id),
      (v_new_duel, p_user_id)
    ON CONFLICT DO NOTHING;

    RETURN QUERY SELECT v_new_duel, 'matched'::text;
    RETURN;
  END IF;

  -- No opponent: enqueue this user
  INSERT INTO public.matchmaking_queue (
    user_id, match_type, tcg_type, max_players, language_code,
    status, expires_at
  )
  VALUES (
    p_user_id, p_match_type, p_tcg_type, p_max_players, p_language_code,
    'waiting', now() + interval '5 minutes'
  )
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT NULL::uuid, 'waiting'::text;
END;
$function$;