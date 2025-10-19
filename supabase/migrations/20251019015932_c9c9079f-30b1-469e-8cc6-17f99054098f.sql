-- Atualizar a função record_match_result para aceitar empates (winner_id pode ser NULL)
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
AS $function$
DECLARE
  v_match_id uuid;
  v_duel_status game_status;
  v_duel_creator uuid;
  v_duel_opponent uuid;
  v_is_ranked boolean;
  v_points_change integer;
BEGIN
  -- Validate that the caller is one of the players
  IF auth.uid() NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Unauthorized: You must be a participant in this duel';
  END IF;

  -- Validate that winner is one of the players or NULL (empate)
  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Invalid winner: Must be one of the players or NULL for draw';
  END IF;

  -- Verify the duel exists and get its details
  SELECT status, creator_id, opponent_id, is_ranked
  INTO v_duel_status, v_duel_creator, v_duel_opponent, v_is_ranked
  FROM public.live_duels
  WHERE id = p_duel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;

  -- Verify duel is in correct state
  IF v_duel_status != 'in_progress' AND v_duel_status != 'finished' THEN
    RAISE EXCEPTION 'Duel must be in progress or finished to record results';
  END IF;

  -- Verify player IDs match duel participants
  IF NOT ((v_duel_creator = p_player1_id AND v_duel_opponent = p_player2_id) OR
          (v_duel_creator = p_player2_id AND v_duel_opponent = p_player1_id)) THEN
    RAISE EXCEPTION 'Player IDs do not match duel participants';
  END IF;

  -- Insert match history record (aceita winner_id NULL para empates)
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
    p_winner_id, -- Pode ser NULL
    p_player1_score,
    p_player2_score,
    p_bet_amount
  )
  RETURNING id INTO v_match_id;

  -- Só atualizar pontos se for partida ranqueada E houver um vencedor
  IF v_is_ranked AND p_winner_id IS NOT NULL THEN
    -- Calcular pontos: se bet_amount for 0, dar 10 pontos base + (1 ponto por 100 LP restante)
    IF p_bet_amount > 0 THEN
      v_points_change := p_bet_amount;
    ELSE
      -- Determinar o LP do vencedor
      IF p_winner_id = p_player1_id THEN
        v_points_change := 10 + (p_player1_score / 100);
      ELSE
        v_points_change := 10 + (p_player2_score / 100);
      END IF;
    END IF;

    -- Update winner stats
    UPDATE public.profiles
    SET 
      wins = wins + 1,
      points = points + v_points_change
    WHERE user_id = p_winner_id;

    -- Update loser stats (perde metade dos pontos que o vencedor ganhou)
    UPDATE public.profiles
    SET 
      losses = losses + 1,
      points = GREATEST(points - (v_points_change / 2), 0)
    WHERE user_id = CASE 
      WHEN p_winner_id = p_player1_id THEN p_player2_id 
      ELSE p_player1_id 
    END;
  ELSIF NOT v_is_ranked AND p_winner_id IS NOT NULL THEN
    -- Partida casual COM vencedor: apenas atualizar wins/losses sem pontos
    UPDATE public.profiles
    SET wins = wins + 1
    WHERE user_id = p_winner_id;

    UPDATE public.profiles
    SET losses = losses + 1
    WHERE user_id = CASE 
      WHEN p_winner_id = p_player1_id THEN p_player2_id 
      ELSE p_player1_id 
    END;
  END IF;
  
  -- Se for empate (p_winner_id IS NULL), não atualiza vitórias/derrotas mas registra no histórico

  RETURN v_match_id;
END;
$function$;

-- Alterar coluna winner_id para aceitar NULL (empates)
ALTER TABLE public.match_history ALTER COLUMN winner_id DROP NOT NULL;