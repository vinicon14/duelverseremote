
CREATE OR REPLACE FUNCTION public.matchmake(p_user_id uuid, p_match_type text, p_tcg_type text DEFAULT 'yugioh', p_max_players integer DEFAULT 2)
RETURNS TABLE(duel_id uuid, player_role text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_waiting_entries RECORD;
  v_new_duel_id UUID;
  v_default_lp integer;
  v_player2_id uuid;
  v_player3_id uuid;
  v_player4_id uuid;
  v_count integer;
BEGIN
  DELETE FROM matchmaking_queue WHERE expires_at < NOW();
  
  IF p_tcg_type = 'magic' THEN
    v_default_lp := 40;
  ELSIF p_tcg_type = 'pokemon' THEN
    v_default_lp := 6;
  ELSE
    v_default_lp := 8000;
  END IF;
  
  -- For 4-player games, need 3 others waiting
  IF p_max_players = 4 THEN
    -- First check if there's an existing 4p duel with open slots
    DECLARE
      v_existing_duel_id uuid;
      v_slot text;
    BEGIN
      SELECT ld.id,
        CASE 
          WHEN ld.opponent_id IS NULL THEN 'opponent'
          WHEN ld.player3_id IS NULL THEN 'player3'
          WHEN ld.player4_id IS NULL THEN 'player4'
        END AS open_slot
      INTO v_existing_duel_id, v_slot
      FROM live_duels ld
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
          UPDATE live_duels SET opponent_id = p_user_id WHERE id = v_existing_duel_id;
        ELSIF v_slot = 'player3' THEN
          UPDATE live_duels SET player3_id = p_user_id WHERE id = v_existing_duel_id;
        ELSE
          UPDATE live_duels SET player4_id = p_user_id WHERE id = v_existing_duel_id;
        END IF;

        INSERT INTO redirects (user_id, duel_id) VALUES (p_user_id, v_existing_duel_id);
        DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
        
        RETURN QUERY SELECT v_existing_duel_id, 'matched'::TEXT;
        RETURN;
      END IF;
    END;

    -- Count how many are waiting in queue for 4p
    SELECT count(*) INTO v_count
    FROM matchmaking_queue
    WHERE status = 'waiting'
      AND match_type = p_match_type
      AND tcg_type = p_tcg_type
      AND max_players = 4
      AND user_id != p_user_id;

    IF v_count >= 3 THEN
      -- We have enough players! Get 3 others
      SELECT user_id INTO v_player2_id
      FROM matchmaking_queue
      WHERE status = 'waiting' AND match_type = p_match_type AND tcg_type = p_tcg_type
        AND max_players = 4 AND user_id != p_user_id
      ORDER BY joined_at ASC LIMIT 1
      FOR UPDATE SKIP LOCKED;

      SELECT user_id INTO v_player3_id
      FROM matchmaking_queue
      WHERE status = 'waiting' AND match_type = p_match_type AND tcg_type = p_tcg_type
        AND max_players = 4 AND user_id NOT IN (p_user_id, v_player2_id)
      ORDER BY joined_at ASC LIMIT 1
      FOR UPDATE SKIP LOCKED;

      SELECT user_id INTO v_player4_id
      FROM matchmaking_queue
      WHERE status = 'waiting' AND match_type = p_match_type AND tcg_type = p_tcg_type
        AND max_players = 4 AND user_id NOT IN (p_user_id, v_player2_id, v_player3_id)
      ORDER BY joined_at ASC LIMIT 1
      FOR UPDATE SKIP LOCKED;

      IF v_player2_id IS NOT NULL AND v_player3_id IS NOT NULL AND v_player4_id IS NOT NULL THEN
        -- Create duel with all 4 players at once
        INSERT INTO live_duels (creator_id, opponent_id, player3_id, player4_id, is_ranked, tcg_type, max_players,
          player1_lp, player2_lp, player3_lp, player4_lp)
        VALUES (
          v_player2_id, v_player3_id, v_player4_id, p_user_id,
          p_match_type = 'ranked', p_tcg_type, 4,
          v_default_lp, v_default_lp, v_default_lp, v_default_lp
        )
        RETURNING id INTO v_new_duel_id;

        -- Create redirects for all 4
        INSERT INTO redirects (user_id, duel_id) VALUES
          (v_player2_id, v_new_duel_id),
          (v_player3_id, v_new_duel_id),
          (v_player4_id, v_new_duel_id),
          (p_user_id, v_new_duel_id);

        -- Update queue entries as matched
        UPDATE matchmaking_queue SET status = 'matched', duel_id = v_new_duel_id
        WHERE user_id IN (v_player2_id, v_player3_id, v_player4_id);

        -- Remove current user from queue
        DELETE FROM matchmaking_queue WHERE user_id = p_user_id;

        RETURN QUERY SELECT v_new_duel_id, 'matched'::TEXT;
        RETURN;
      END IF;
    END IF;

    -- Not enough players yet, add to queue
    INSERT INTO matchmaking_queue (user_id, match_type, status, expires_at, tcg_type, max_players)
    VALUES (p_user_id, p_match_type, 'waiting', NOW() + INTERVAL '3 minutes', p_tcg_type, 4)
    ON CONFLICT (user_id)
    DO UPDATE SET
      match_type = EXCLUDED.match_type,
      status = 'waiting',
      joined_at = NOW(),
      expires_at = NOW() + INTERVAL '3 minutes',
      tcg_type = EXCLUDED.tcg_type,
      max_players = EXCLUDED.max_players;

    RETURN QUERY SELECT NULL::UUID, 'waiting'::TEXT;
    RETURN;
  END IF;

  -- Standard 2-player matchmaking
  SELECT * INTO v_waiting_entries
  FROM matchmaking_queue
  WHERE status = 'waiting'
    AND match_type = p_match_type
    AND tcg_type = p_tcg_type
    AND max_players = p_max_players
    AND user_id != p_user_id
  ORDER BY joined_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF FOUND THEN
    INSERT INTO live_duels (creator_id, opponent_id, is_ranked, tcg_type, max_players,
      player1_lp, player2_lp, player3_lp, player4_lp)
    VALUES (
      v_waiting_entries.user_id,
      p_user_id,
      p_match_type = 'ranked',
      p_tcg_type,
      p_max_players,
      v_default_lp, v_default_lp, v_default_lp, v_default_lp
    )
    RETURNING id INTO v_new_duel_id;
    
    INSERT INTO redirects (user_id, duel_id)
    VALUES 
      (v_waiting_entries.user_id, v_new_duel_id),
      (p_user_id, v_new_duel_id);
    
    UPDATE matchmaking_queue SET status = 'matched', duel_id = v_new_duel_id
    WHERE user_id = v_waiting_entries.user_id;

    DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
    
    RETURN QUERY SELECT v_new_duel_id, 'matched'::TEXT;
  ELSE
    INSERT INTO matchmaking_queue (user_id, match_type, status, expires_at, tcg_type, max_players)
    VALUES (p_user_id, p_match_type, 'waiting', NOW() + INTERVAL '2 minutes', p_tcg_type, p_max_players)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      match_type = EXCLUDED.match_type,
      status = 'waiting',
      joined_at = NOW(),
      expires_at = NOW() + INTERVAL '2 minutes',
      tcg_type = EXCLUDED.tcg_type,
      max_players = EXCLUDED.max_players;
    
    RETURN QUERY SELECT NULL::UUID, 'waiting'::TEXT;
  END IF;
END;
$$;
