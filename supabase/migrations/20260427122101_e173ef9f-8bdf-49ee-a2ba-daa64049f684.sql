CREATE OR REPLACE FUNCTION public.matchmake(
  p_user_id uuid,
  p_match_type text,
  p_tcg_type text DEFAULT 'yugioh'::text,
  p_max_players integer DEFAULT 2,
  p_language_code text DEFAULT 'en'::text
)
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
  v_is_ranked boolean;
  v_open_room record;
BEGIN
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

  v_is_ranked := (p_match_type = 'ranked');

  SELECT mq.duel_id INTO v_existing_duel
  FROM public.matchmaking_queue mq
  WHERE mq.user_id = p_user_id
    AND mq.status = 'matched'
    AND mq.duel_id IS NOT NULL
  ORDER BY mq.joined_at DESC
  LIMIT 1;

  IF v_existing_duel IS NOT NULL THEN
    duel_id := v_existing_duel;
    status := 'matched';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT ld.* INTO v_open_room
  FROM public.live_duels ld
  WHERE ld.tcg_type = p_tcg_type
    AND ld.is_ranked = v_is_ranked
    AND ld.is_private = false
    AND ld.status IN ('waiting'::game_status, 'in_progress'::game_status)
    AND ld.creator_id <> p_user_id
    AND COALESCE(ld.opponent_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_user_id
    AND COALESCE(ld.player3_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_user_id
    AND COALESCE(ld.player4_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_user_id
    AND (
      ld.opponent_id IS NULL
      OR (COALESCE(ld.max_players, 2) >= 3 AND ld.player3_id IS NULL)
      OR (COALESCE(ld.max_players, 2) >= 4 AND ld.player4_id IS NULL)
    )
    AND COALESCE(ld.max_players, 2) >= p_max_players
  ORDER BY ld.created_at ASC
  LIMIT 1;

  IF v_open_room.id IS NOT NULL THEN
    IF v_open_room.opponent_id IS NULL THEN
      UPDATE public.live_duels AS ld
        SET opponent_id = p_user_id,
            started_at = COALESCE(ld.started_at, now()),
            status = CASE WHEN COALESCE(ld.max_players, 2) = 2 THEN 'in_progress'::game_status ELSE ld.status END
        WHERE ld.id = v_open_room.id;
    ELSIF COALESCE(v_open_room.max_players, 2) >= 3 AND v_open_room.player3_id IS NULL THEN
      UPDATE public.live_duels AS ld
        SET player3_id = p_user_id
        WHERE ld.id = v_open_room.id;
    ELSIF COALESCE(v_open_room.max_players, 2) >= 4 AND v_open_room.player4_id IS NULL THEN
      UPDATE public.live_duels AS ld
        SET player4_id = p_user_id,
            started_at = COALESCE(ld.started_at, now()),
            status = 'in_progress'::game_status
        WHERE ld.id = v_open_room.id;
    END IF;

    INSERT INTO public.players (duel_id, user_id)
      VALUES (v_open_room.id, p_user_id)
      ON CONFLICT DO NOTHING;

    UPDATE public.matchmaking_queue AS mq
    SET status = 'matched', duel_id = v_open_room.id
    WHERE mq.user_id = p_user_id
      AND mq.status = 'waiting';

    duel_id := v_open_room.id;
    status := 'matched';
    RETURN NEXT;
    RETURN;
  END IF;

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
    INSERT INTO public.live_duels (
      creator_id, opponent_id, status, tcg_type,
      player1_lp, player2_lp, bet_amount, max_players, is_ranked
    )
    VALUES (
      v_opponent.user_id, p_user_id, 'in_progress'::game_status, p_tcg_type,
      v_default_lp, v_default_lp, v_default_bet, p_max_players, v_is_ranked
    )
    RETURNING id INTO v_new_duel;

    UPDATE public.matchmaking_queue AS mq
    SET status = 'matched', duel_id = v_new_duel
    WHERE mq.user_id IN (p_user_id, v_opponent.user_id)
      AND mq.status = 'waiting';

    INSERT INTO public.players (duel_id, user_id) VALUES
      (v_new_duel, v_opponent.user_id),
      (v_new_duel, p_user_id)
    ON CONFLICT DO NOTHING;

    duel_id := v_new_duel;
    status := 'matched';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.matchmaking_queue (
    user_id, match_type, tcg_type, max_players, language_code,
    status, expires_at
  )
  VALUES (
    p_user_id, p_match_type, p_tcg_type, p_max_players, p_language_code,
    'waiting', now() + interval '5 minutes'
  )
  ON CONFLICT DO NOTHING;

  duel_id := NULL;
  status := 'waiting';
  RETURN NEXT;
END;
$function$;