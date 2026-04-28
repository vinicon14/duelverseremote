CREATE OR REPLACE FUNCTION public.generate_next_round(p_tournament_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid;
  v_current_round int;
  v_total_rounds int;
  v_status text;
  v_pending int;
  v_next_round int;
  v_existing_next int;
  v_matches_created int := 0;
  v_player record;
  v_players uuid[] := ARRAY[]::uuid[];
  v_paired uuid[] := ARRAY[]::uuid[];
  v_p1 uuid;
  v_p2 uuid;
  v_i int;
  v_j int;
  v_already_played boolean;
BEGIN
  SELECT created_by, current_round, total_rounds, status
    INTO v_created_by, v_current_round, v_total_rounds, v_status
  FROM tournaments WHERE id = p_tournament_id;

  IF v_created_by IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;

  IF v_created_by <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador ou admin pode gerar próxima rodada');
  END IF;

  IF v_status <> 'active' THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não está ativo');
  END IF;

  IF v_current_round IS NULL THEN
    v_current_round := 1;
  END IF;

  IF v_total_rounds IS NOT NULL AND v_current_round >= v_total_rounds THEN
    RETURN json_build_object('success', false, 'message', 'Esta já é a última rodada');
  END IF;

  -- Ensure all matches in current round are completed
  SELECT COUNT(*) INTO v_pending
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
    AND round = v_current_round
    AND status <> 'completed';

  IF v_pending > 0 THEN
    RETURN json_build_object('success', false, 'message', 'Existem partidas pendentes na rodada atual');
  END IF;

  v_next_round := v_current_round + 1;

  -- Avoid duplicate generation
  SELECT COUNT(*) INTO v_existing_next
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id AND round = v_next_round;

  IF v_existing_next > 0 THEN
    RETURN json_build_object('success', false, 'message', 'Próxima rodada já foi gerada');
  END IF;

  -- SWISS PAIRING: collect active participants ordered by wins DESC, losses ASC, score DESC
  -- Only include players who haven't been eliminated (status != 'eliminated')
  SELECT array_agg(user_id ORDER BY COALESCE(wins, 0) DESC, COALESCE(losses, 0) ASC, COALESCE(score, 0) DESC, random())
    INTO v_players
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id
    AND COALESCE(status, 'active') <> 'eliminated';

  IF v_players IS NULL OR array_length(v_players, 1) IS NULL OR array_length(v_players, 1) < 2 THEN
    RETURN json_build_object('success', false, 'message', 'Participantes insuficientes para gerar próxima rodada');
  END IF;

  -- Greedy Swiss pairing: avoid rematches when possible
  v_i := 1;
  WHILE v_i <= array_length(v_players, 1) LOOP
    v_p1 := v_players[v_i];
    
    -- Skip if already paired
    IF v_p1 = ANY(v_paired) THEN
      v_i := v_i + 1;
      CONTINUE;
    END IF;

    v_p2 := NULL;
    -- Search for next unpaired player who hasn't played v_p1 yet
    v_j := v_i + 1;
    WHILE v_j <= array_length(v_players, 1) LOOP
      IF NOT (v_players[v_j] = ANY(v_paired)) THEN
        SELECT EXISTS (
          SELECT 1 FROM tournament_matches
          WHERE tournament_id = p_tournament_id
            AND ((player1_id = v_p1 AND player2_id = v_players[v_j])
              OR (player1_id = v_players[v_j] AND player2_id = v_p1))
        ) INTO v_already_played;

        IF NOT v_already_played THEN
          v_p2 := v_players[v_j];
          EXIT;
        END IF;
      END IF;
      v_j := v_j + 1;
    END LOOP;

    -- If no fresh opponent found, allow rematch with next available
    IF v_p2 IS NULL THEN
      v_j := v_i + 1;
      WHILE v_j <= array_length(v_players, 1) LOOP
        IF NOT (v_players[v_j] = ANY(v_paired)) THEN
          v_p2 := v_players[v_j];
          EXIT;
        END IF;
        v_j := v_j + 1;
      END LOOP;
    END IF;

    IF v_p2 IS NOT NULL THEN
      INSERT INTO tournament_matches (tournament_id, round, player1_id, player2_id, status)
      VALUES (p_tournament_id, v_next_round, v_p1, v_p2, 'pending');
      v_matches_created := v_matches_created + 1;
      v_paired := v_paired || v_p1 || v_p2;
    ELSE
      -- Bye: v_p1 has no opponent
      INSERT INTO tournament_matches (tournament_id, round, player1_id, player2_id, winner_id, status)
      VALUES (p_tournament_id, v_next_round, v_p1, NULL, v_p1, 'completed');
      v_matches_created := v_matches_created + 1;
      v_paired := v_paired || v_p1;
      
      -- Award win for bye
      UPDATE tournament_participants
      SET wins = COALESCE(wins, 0) + 1, score = COALESCE(score, 0) + 3
      WHERE tournament_id = p_tournament_id AND user_id = v_p1;
    END IF;

    v_i := v_i + 1;
  END LOOP;

  UPDATE tournaments SET current_round = v_next_round WHERE id = p_tournament_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Próxima rodada gerada (Suíço)',
    'round', v_next_round,
    'matches_created', v_matches_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_round(uuid) TO authenticated;