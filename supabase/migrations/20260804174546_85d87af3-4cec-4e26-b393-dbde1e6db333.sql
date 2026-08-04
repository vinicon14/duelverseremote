ALTER TABLE public.match_history
  ADD COLUMN IF NOT EXISTS ranked_points_awarded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ranked_points_change integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcg_type text;

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
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
  v_duel_status public.game_status;
  v_duel_creator uuid;
  v_duel_opponent uuid;
  v_is_ranked boolean;
  v_points_change integer := 0;
  v_loser_id uuid;
  v_tcg text;
  v_already_awarded boolean := false;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Unauthorized: You must be a participant in this duel';
  END IF;

  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Invalid winner: Must be one of the players or NULL for draw';
  END IF;

  SELECT status, creator_id, opponent_id, is_ranked,
    CASE lower(coalesce(tcg_type, 'yugioh'))
      WHEN 'magic' THEN 'genesis'
      WHEN 'pokemon' THEN 'rush_duel'
      WHEN 'genesis' THEN 'genesis'
      WHEN 'rush_duel' THEN 'rush_duel'
      ELSE 'yugioh'
    END
  INTO v_duel_status, v_duel_creator, v_duel_opponent, v_is_ranked, v_tcg
  FROM public.live_duels
  WHERE id = p_duel_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Duel not found'; END IF;
  IF v_duel_status NOT IN ('waiting', 'in_progress', 'finished') THEN
    RAISE EXCEPTION 'Duel must be in progress or finished to record results';
  END IF;
  IF NOT ((v_duel_creator = p_player1_id AND v_duel_opponent = p_player2_id)
       OR (v_duel_creator = p_player2_id AND v_duel_opponent = p_player1_id)) THEN
    RAISE EXCEPTION 'Player IDs do not match duel participants';
  END IF;

  SELECT id, ranked_points_awarded
  INTO v_match_id, v_already_awarded
  FROM public.match_history
  WHERE duel_id = p_duel_id
  FOR UPDATE;

  IF v_match_id IS NULL THEN
    INSERT INTO public.match_history (
      duel_id, player1_id, player2_id, winner_id,
      player1_score, player2_score, bet_amount, tcg_type
    ) VALUES (
      p_duel_id, p_player1_id, p_player2_id, p_winner_id,
      p_player1_score, p_player2_score, greatest(coalesce(p_bet_amount, 0), 0), v_tcg
    )
    ON CONFLICT (duel_id) WHERE duel_id IS NOT NULL DO NOTHING
    RETURNING id, ranked_points_awarded INTO v_match_id, v_already_awarded;

    IF v_match_id IS NULL THEN
      SELECT id, ranked_points_awarded INTO v_match_id, v_already_awarded
      FROM public.match_history WHERE duel_id = p_duel_id FOR UPDATE;
    END IF;
  ELSE
    UPDATE public.match_history
    SET winner_id = coalesce(p_winner_id, winner_id),
        player1_score = p_player1_score,
        player2_score = p_player2_score,
        bet_amount = greatest(coalesce(p_bet_amount, bet_amount, 0), 0),
        tcg_type = coalesce(tcg_type, v_tcg)
    WHERE id = v_match_id;
  END IF;

  IF p_winner_id IS NULL OR v_already_awarded THEN RETURN v_match_id; END IF;

  v_loser_id := CASE WHEN p_winner_id = p_player1_id THEN p_player2_id ELSE p_player1_id END;

  IF v_is_ranked THEN
    IF coalesce(p_bet_amount, 0) > 0 THEN
      v_points_change := p_bet_amount;
    ELSIF p_winner_id = p_player1_id THEN
      v_points_change := 10 + (greatest(coalesce(p_player1_score, 0), 0) / 100);
    ELSE
      v_points_change := 10 + (greatest(coalesce(p_player2_score, 0), 0) / 100);
    END IF;
  END IF;

  UPDATE public.profiles
  SET wins = coalesce(wins, 0) + 1,
      points = coalesce(points, 0) + v_points_change
  WHERE user_id = p_winner_id;

  UPDATE public.profiles
  SET losses = coalesce(losses, 0) + 1,
      points = greatest(coalesce(points, 0) - (v_points_change / 2), 0)
  WHERE user_id = v_loser_id;

  INSERT INTO public.tcg_profiles (user_id, tcg_type, username)
  SELECT p.user_id, v_tcg, p.username
  FROM public.profiles p
  WHERE p.user_id IN (p_winner_id, v_loser_id)
  ON CONFLICT (user_id, tcg_type) DO NOTHING;

  UPDATE public.tcg_profiles
  SET wins = coalesce(wins, 0) + 1,
      points = coalesce(points, 0) + v_points_change,
      updated_at = now()
  WHERE user_id = p_winner_id AND tcg_type = v_tcg;

  UPDATE public.tcg_profiles
  SET losses = coalesce(losses, 0) + 1,
      points = greatest(coalesce(points, 0) - (v_points_change / 2), 0),
      updated_at = now()
  WHERE user_id = v_loser_id AND tcg_type = v_tcg;

  UPDATE public.match_history
  SET winner_id = p_winner_id,
      ranked_points_awarded = true,
      ranked_points_change = v_points_change,
      tcg_type = v_tcg
  WHERE id = v_match_id;

  RETURN v_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_finished_duel_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finished'
     AND NEW.max_players = 2
     AND NEW.creator_id IS NOT NULL
     AND NEW.opponent_id IS NOT NULL
     AND NEW.winner_id IS NOT NULL
     AND (OLD.status IS DISTINCT FROM 'finished' OR OLD.winner_id IS DISTINCT FROM NEW.winner_id) THEN
    PERFORM public.record_match_result(
      NEW.id, NEW.creator_id, NEW.opponent_id, NEW.winner_id,
      NEW.player1_lp, NEW.player2_lp, NEW.bet_amount
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_record_finished_duel_result ON public.live_duels;
CREATE TRIGGER trigger_record_finished_duel_result
AFTER UPDATE OF status, winner_id ON public.live_duels
FOR EACH ROW
EXECUTE FUNCTION public.record_finished_duel_result();

REVOKE ALL ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, integer, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_finished_duel_result() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_finished_duel_result() TO service_role;