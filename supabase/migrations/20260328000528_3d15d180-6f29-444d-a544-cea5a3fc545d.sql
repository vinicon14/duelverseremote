-- Remove ambiguous legacy overloads of public.matchmake that break RPC resolution
DROP FUNCTION IF EXISTS public.matchmake(text, uuid);
DROP FUNCTION IF EXISTS public.matchmake(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.matchmake(text, uuid, text);
DROP FUNCTION IF EXISTS public.matchmake(text, uuid, text, integer);

-- Recreate a single canonical matchmaking function used by the client
CREATE OR REPLACE FUNCTION public.matchmake(
  p_match_type text,
  p_user_id uuid,
  p_tcg_type text DEFAULT 'yugioh'::text,
  p_max_players integer DEFAULT 2
)
RETURNS TABLE(duel_id uuid, player_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_waiting_entry RECORD;
  v_new_duel_id UUID;
  v_default_lp integer;
  v_player2_id uuid;
  v_player3_id uuid;
  v_player4_id uuid;
  v_count integer;
  v_existing_duel_id uuid;
  v_slot text;
BEGIN
  DELETE FROM public.matchmaking_queue WHERE expires_at < NOW();

  IF p_tcg_type = 'magic' THEN
    v_default_lp := 40;
  ELSIF p_tcg_type = 'pokemon' THEN
    v_default_lp := 6;
  ELSE
    v_default_lp := 8000;
  END IF;

  IF p_max_players = 4 THEN
    SELECT ld.id,
      CASE
        WHEN ld.opponent_id IS NULL THEN 'opponent'
        WHEN ld.player3_id IS NULL THEN 'player3'
        WHEN ld.player4_id IS NULL THEN 'player4'
      END AS open_slot
    INTO v_existing_duel_id, v_slot
    FROM public.live_duels ld
    WHERE ld.max_players = 4
      AND ld.status = 'waiting'
      AND ld.tcg_type = p_tcg_type
      AND ld.creator_id != p_user_id
      AND ld.opponent_id IS DISTINCT FROM p_user_id
      AND ld.player3_id IS DISTINCT FROM p_user_id
      AND ld.player4_id IS DISTINCT FROM p_user_id
      AND (ld.opponent_id IS NULL OR ld.player3_id IS NULL OR ld.player4_id IS NULL)
    ORDER BY ld.created_at ASC
    LIMIT 1;

    IF v_existing_duel_id IS NOT NULL THEN
      IF v_slot = 'opponent' THEN
        UPDATE public.live_duels SET opponent_id = p_user_id WHERE id = v_existing_duel_id;
      ELSIF v_slot = 'player3' THEN
        UPDATE public.live_duels SET player3_id = p_user_id WHERE id = v_existing_duel_id;
      ELSE
        UPDATE public.live_duels SET player4_id = p_user_id WHERE id = v_existing_duel_id;
      END IF;

      INSERT INTO public.redirects (user_id, duel_id)
      VALUES (p_user_id, v_existing_duel_id)
      ON CONFLICT DO NOTHING;

      DELETE FROM public.matchmaking_queue WHERE user_id = p_user_id;

      RETURN QUERY SELECT v_existing_duel_id, 'matched'::text;
      RETURN;
    END IF;

    SELECT count(*) INTO v_count
    FROM public.matchmaking_queue
    WHERE status = 'waiting'
      AND match_type = p_match_type
      AND tcg_type = p_tcg_type
      AND max_players = 4
      AND user_id != p_user_id;

    IF v_count >= 3 THEN
      SELECT user_id INTO v_player2_id
      FROM public.matchmaking_queue
      WHERE status = 'waiting'
        AND match_type = p_match_type
        AND tcg_type = p_tcg_type
        AND max_players = 4
        AND user_id != p_user_id
      ORDER BY joined_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      SELECT user_id INTO v_player3_id
      FROM public.matchmaking_queue
      WHERE status = 'waiting'
        AND match_type = p_match_type
        AND tcg_type = p_tcg_type
        AND max_players = 4
        AND user_id NOT IN (p_user_id, v_player2_id)
      ORDER BY joined_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      SELECT user_id INTO v_player4_id
      FROM public.matchmaking_queue
      WHERE status = 'waiting'
        AND match_type = p_match_type
        AND tcg_type = p_tcg_type
        AND max_players = 4
        AND user_id NOT IN (p_user_id, v_player2_id, v_player3_id)
      ORDER BY joined_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_player2_id IS NOT NULL AND v_player3_id IS NOT NULL AND v_player4_id IS NOT NULL THEN
        INSERT INTO public.live_duels (
          creator_id,
          opponent_id,
          player3_id,
          player4_id,
          is_ranked,
          tcg_type,
          max_players,
          player1_lp,
          player2_lp,
          player3_lp,
          player4_lp
        )
        VALUES (
          v_player2_id,
          v_player3_id,
          v_player4_id,
          p_user_id,
          p_match_type = 'ranked',
          p_tcg_type,
          4,
          v_default_lp,
          v_default_lp,
          v_default_lp,
          v_default_lp
        )
        RETURNING id INTO v_new_duel_id;

        INSERT INTO public.redirects (user_id, duel_id)
        VALUES
          (v_player2_id, v_new_duel_id),
          (v_player3_id, v_new_duel_id),
          (v_player4_id, v_new_duel_id),
          (p_user_id, v_new_duel_id)
        ON CONFLICT DO NOTHING;

        UPDATE public.matchmaking_queue
        SET status = 'matched', duel_id = v_new_duel_id
        WHERE user_id IN (v_player2_id, v_player3_id, v_player4_id);

        DELETE FROM public.matchmaking_queue WHERE user_id = p_user_id;

        RETURN QUERY SELECT v_new_duel_id, 'matched'::text;
        RETURN;
      END IF;
    END IF;

    INSERT INTO public.matchmaking_queue (user_id, match_type, status, expires_at, tcg_type, max_players)
    VALUES (p_user_id, p_match_type, 'waiting', NOW() + INTERVAL '3 minutes', p_tcg_type, 4)
    ON CONFLICT (user_id)
    DO UPDATE SET
      match_type = EXCLUDED.match_type,
      status = 'waiting',
      joined_at = NOW(),
      expires_at = NOW() + INTERVAL '3 minutes',
      tcg_type = EXCLUDED.tcg_type,
      max_players = EXCLUDED.max_players,
      duel_id = NULL;

    RETURN QUERY SELECT NULL::uuid, 'waiting'::text;
    RETURN;
  END IF;

  SELECT * INTO v_waiting_entry
  FROM public.matchmaking_queue
  WHERE status = 'waiting'
    AND match_type = p_match_type
    AND tcg_type = p_tcg_type
    AND max_players = p_max_players
    AND user_id != p_user_id
  ORDER BY joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    INSERT INTO public.live_duels (
      creator_id,
      opponent_id,
      is_ranked,
      tcg_type,
      max_players,
      player1_lp,
      player2_lp,
      player3_lp,
      player4_lp
    )
    VALUES (
      v_waiting_entry.user_id,
      p_user_id,
      p_match_type = 'ranked',
      p_tcg_type,
      p_max_players,
      v_default_lp,
      v_default_lp,
      v_default_lp,
      v_default_lp
    )
    RETURNING id INTO v_new_duel_id;

    INSERT INTO public.redirects (user_id, duel_id)
    VALUES
      (v_waiting_entry.user_id, v_new_duel_id),
      (p_user_id, v_new_duel_id)
    ON CONFLICT DO NOTHING;

    UPDATE public.matchmaking_queue
    SET status = 'matched', duel_id = v_new_duel_id
    WHERE user_id = v_waiting_entry.user_id;

    DELETE FROM public.matchmaking_queue WHERE user_id = p_user_id;

    RETURN QUERY SELECT v_new_duel_id, 'matched'::text;
  ELSE
    INSERT INTO public.matchmaking_queue (user_id, match_type, status, expires_at, tcg_type, max_players)
    VALUES (p_user_id, p_match_type, 'waiting', NOW() + INTERVAL '2 minutes', p_tcg_type, p_max_players)
    ON CONFLICT (user_id)
    DO UPDATE SET
      match_type = EXCLUDED.match_type,
      status = 'waiting',
      joined_at = NOW(),
      expires_at = NOW() + INTERVAL '2 minutes',
      tcg_type = EXCLUDED.tcg_type,
      max_players = EXCLUDED.max_players,
      duel_id = NULL;

    RETURN QUERY SELECT NULL::uuid, 'waiting'::text;
  END IF;
END;
$function$;