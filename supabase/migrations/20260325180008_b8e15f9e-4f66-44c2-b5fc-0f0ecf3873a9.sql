
-- Update matchmake function to support max_players parameter
CREATE OR REPLACE FUNCTION public.matchmake(p_match_type text, p_user_id uuid, p_tcg_type text DEFAULT 'yugioh'::text, p_max_players integer DEFAULT 2)
 RETURNS TABLE(duel_id uuid, player_role text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_waiting_entry RECORD;
  v_new_duel_id UUID;
  v_existing_duel RECORD;
  v_player_count integer;
BEGIN
  DELETE FROM matchmaking_queue WHERE expires_at < NOW();
  
  -- For 4-player games, first check if there's a duel waiting for more players
  IF p_max_players = 4 THEN
    -- Find a 4-player duel that still has open slots
    SELECT ld.id INTO v_existing_duel
    FROM live_duels ld
    WHERE ld.max_players = 4
      AND ld.status = 'waiting'
      AND ld.tcg_type = p_tcg_type
      AND ld.creator_id != p_user_id
      AND (ld.opponent_id IS NULL OR ld.player3_id IS NULL OR ld.player4_id IS NULL)
      AND ld.opponent_id IS DISTINCT FROM p_user_id
      AND ld.player3_id IS DISTINCT FROM p_user_id
      AND ld.player4_id IS DISTINCT FROM p_user_id
    ORDER BY ld.created_at ASC
    LIMIT 1;

    IF v_existing_duel.id IS NOT NULL THEN
      -- Join existing 4-player duel
      IF (SELECT opponent_id FROM live_duels WHERE id = v_existing_duel.id) IS NULL THEN
        UPDATE live_duels SET opponent_id = p_user_id WHERE id = v_existing_duel.id;
      ELSIF (SELECT player3_id FROM live_duels WHERE id = v_existing_duel.id) IS NULL THEN
        UPDATE live_duels SET player3_id = p_user_id WHERE id = v_existing_duel.id;
      ELSE
        UPDATE live_duels SET player4_id = p_user_id, status = 'in_progress' WHERE id = v_existing_duel.id;
      END IF;

      -- Create redirect
      INSERT INTO redirects (user_id, duel_id) VALUES (p_user_id, v_existing_duel.id);
      
      -- Remove from queue
      DELETE FROM matchmaking_queue WHERE user_id = p_user_id;
      
      RETURN QUERY SELECT v_existing_duel.id, 'matched'::TEXT;
      RETURN;
    END IF;
  END IF;
  
  -- Standard 2-player matchmaking
  SELECT * INTO v_waiting_entry
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
    -- Create duel
    INSERT INTO live_duels (creator_id, opponent_id, status, is_ranked, tcg_type, max_players,
      player1_lp, player2_lp, player3_lp, player4_lp)
    VALUES (
      v_waiting_entry.user_id,
      p_user_id,
      CASE WHEN p_max_players = 2 THEN 'waiting' ELSE 'waiting' END,
      p_match_type = 'ranked',
      p_tcg_type,
      p_max_players,
      CASE WHEN p_tcg_type = 'magic' THEN 40 ELSE 8000 END,
      CASE WHEN p_tcg_type = 'magic' THEN 40 ELSE 8000 END,
      CASE WHEN p_tcg_type = 'magic' THEN 40 ELSE 8000 END,
      CASE WHEN p_tcg_type = 'magic' THEN 40 ELSE 8000 END
    )
    RETURNING id INTO v_new_duel_id;
    
    INSERT INTO redirects (user_id, duel_id)
    VALUES 
      (v_waiting_entry.user_id, v_new_duel_id),
      (p_user_id, v_new_duel_id);
    
    DELETE FROM matchmaking_queue 
    WHERE user_id IN (v_waiting_entry.user_id, p_user_id);
    
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
$function$;
