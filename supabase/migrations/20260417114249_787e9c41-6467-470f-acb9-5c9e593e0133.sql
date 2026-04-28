
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
  v_winners uuid[];
  v_next_round int;
  v_existing_next int;
  v_i int;
  v_matches_created int := 0;
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

  -- Collect winners from current round in deterministic order (by created_at)
  SELECT array_agg(winner_id ORDER BY created_at)
    INTO v_winners
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
    AND round = v_current_round
    AND winner_id IS NOT NULL;

  IF v_winners IS NULL OR array_length(v_winners, 1) IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Nenhum vencedor encontrado na rodada atual');
  END IF;

  IF array_length(v_winners, 1) < 2 THEN
    -- Only 1 winner remains => tournament can be finalized
    RETURN json_build_object('success', false, 'message', 'Apenas 1 vencedor restante — finalize o torneio');
  END IF;

  -- Pair winners sequentially
  v_i := 1;
  WHILE v_i <= array_length(v_winners, 1) LOOP
    IF v_i + 1 <= array_length(v_winners, 1) THEN
      INSERT INTO tournament_matches (tournament_id, round, player1_id, player2_id, status)
      VALUES (p_tournament_id, v_next_round, v_winners[v_i], v_winners[v_i+1], 'pending');
      v_matches_created := v_matches_created + 1;
    ELSE
      -- Bye: odd number of winners
      INSERT INTO tournament_matches (tournament_id, round, player1_id, player2_id, winner_id, status)
      VALUES (p_tournament_id, v_next_round, v_winners[v_i], NULL, v_winners[v_i], 'completed');
      v_matches_created := v_matches_created + 1;
    END IF;
    v_i := v_i + 2;
  END LOOP;

  UPDATE tournaments SET current_round = v_next_round WHERE id = p_tournament_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Próxima rodada gerada',
    'round', v_next_round,
    'matches_created', v_matches_created
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_round(uuid) TO authenticated;
