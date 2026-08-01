CREATE OR REPLACE FUNCTION public.record_match_result(p_duel_id uuid, p_player1_id uuid, p_player2_id uuid, p_winner_id uuid, p_player1_score integer, p_player2_score integer, p_bet_amount integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_match_id uuid;
  v_duel_status game_status;
  v_duel_creator uuid;
  v_duel_opponent uuid;
  v_is_ranked boolean;
  v_points_change integer;
  v_loser_id uuid;
  v_tcg text;
BEGIN
  IF auth.uid() NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Unauthorized: You must be a participant in this duel';
  END IF;

  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Invalid winner: Must be one of the players or NULL for draw';
  END IF;

  SELECT status, creator_id, opponent_id, is_ranked,
         CASE lower(coalesce(tcg_type,'yugioh'))
           WHEN 'magic' THEN 'genesis'
           WHEN 'pokemon' THEN 'rush_duel'
           WHEN 'genesis' THEN 'genesis'
           WHEN 'rush_duel' THEN 'rush_duel'
           ELSE 'yugioh'
         END
  INTO v_duel_status, v_duel_creator, v_duel_opponent, v_is_ranked, v_tcg
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

  -- Evita registro duplicado quando os dois jogadores finalizam a partida
  SELECT id INTO v_match_id
  FROM public.match_history
  WHERE ((player1_id = p_player1_id AND player2_id = p_player2_id)
      OR (player1_id = p_player2_id AND player2_id = p_player1_id))
    AND played_at > now() - interval '5 minutes'
  LIMIT 1;

  IF v_match_id IS NOT NULL THEN
    RETURN v_match_id;
  END IF;

  INSERT INTO public.match_history (
    player1_id, player2_id, winner_id, player1_score, player2_score, bet_amount
  ) VALUES (
    p_player1_id, p_player2_id, p_winner_id, p_player1_score, p_player2_score, p_bet_amount
  )
  RETURNING id INTO v_match_id;

  IF p_winner_id IS NULL THEN
    RETURN v_match_id;
  END IF;

  v_loser_id := CASE WHEN p_winner_id = p_player1_id THEN p_player2_id ELSE p_player1_id END;

  IF v_is_ranked THEN
    IF p_bet_amount > 0 THEN
      v_points_change := p_bet_amount;
    ELSIF p_winner_id = p_player1_id THEN
      v_points_change := 10 + (p_player1_score / 100);
    ELSE
      v_points_change := 10 + (p_player2_score / 100);
    END IF;
  ELSE
    v_points_change := 0;
  END IF;

  UPDATE public.profiles
  SET wins = wins + 1, points = points + v_points_change
  WHERE user_id = p_winner_id;

  UPDATE public.profiles
  SET losses = losses + 1, points = GREATEST(points - (v_points_change / 2), 0)
  WHERE user_id = v_loser_id;

  -- Garante perfis de TCG e atualiza o ranking do jogo correspondente
  INSERT INTO public.tcg_profiles (user_id, tcg_type, username)
  SELECT p.user_id, v_tcg, p.username
  FROM public.profiles p
  WHERE p.user_id IN (p_winner_id, v_loser_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.tcg_profiles tp
      WHERE tp.user_id = p.user_id AND tp.tcg_type = v_tcg
    );

  UPDATE public.tcg_profiles
  SET wins = wins + 1,
      points = points + v_points_change,
      updated_at = now()
  WHERE user_id = p_winner_id AND tcg_type = v_tcg;

  UPDATE public.tcg_profiles
  SET losses = losses + 1,
      points = GREATEST(points - (v_points_change / 2), 0),
      updated_at = now()
  WHERE user_id = v_loser_id AND tcg_type = v_tcg;

  RETURN v_match_id;
END;
$function$;