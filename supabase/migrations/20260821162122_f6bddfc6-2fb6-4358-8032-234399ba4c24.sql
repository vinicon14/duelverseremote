ALTER TABLE public.tournament_participants ADD COLUMN IF NOT EXISTS draws integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recalc_tournament_stats_internal(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE tournament_participants
     SET wins = 0, losses = 0, draws = 0, score = 0
   WHERE tournament_id = p_tournament_id;

  UPDATE tournament_participants tp
     SET wins   = sub.wins,
         losses = sub.losses,
         draws  = sub.draws,
         score  = sub.wins * 3 + sub.draws
    FROM (
      SELECT user_id,
             COUNT(*) FILTER (WHERE outcome = 'win')::int  AS wins,
             COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses,
             COUNT(*) FILTER (WHERE outcome = 'draw')::int AS draws
        FROM (
          SELECT player1_id AS user_id,
                 CASE
                   WHEN player1_result = 'draw' THEN 'draw'
                   WHEN winner_id = player1_id THEN 'win'
                   WHEN winner_id IS NOT NULL THEN 'loss'
                   ELSE NULL
                 END AS outcome
            FROM tournament_matches
           WHERE tournament_id = p_tournament_id
             AND status = 'completed'
             AND player1_id IS NOT NULL
          UNION ALL
          SELECT player2_id AS user_id,
                 CASE
                   WHEN player2_result = 'draw' THEN 'draw'
                   WHEN winner_id = player2_id THEN 'win'
                   WHEN winner_id IS NOT NULL THEN 'loss'
                   ELSE NULL
                 END AS outcome
            FROM tournament_matches
           WHERE tournament_id = p_tournament_id
             AND status = 'completed'
             AND player2_id IS NOT NULL
        ) src
       WHERE outcome IS NOT NULL
       GROUP BY user_id
    ) sub
   WHERE tp.tournament_id = p_tournament_id
     AND tp.user_id = sub.user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_tournament_stats(p_tournament_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_created_by uuid;
BEGIN
  SELECT created_by INTO v_created_by FROM tournaments WHERE id = p_tournament_id;
  IF v_created_by IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  IF v_created_by <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Sem permissão');
  END IF;

  PERFORM public.recalc_tournament_stats_internal(p_tournament_id);
  RETURN json_build_object('success', true, 'message', 'Estatísticas recalculadas');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_match_result(p_match_id uuid, p_result text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_match RECORD;
  v_created_by uuid;
BEGIN
  IF p_result NOT IN ('player1_win', 'player2_win', 'draw') THEN
    RETURN json_build_object('success', false, 'message', 'Resultado inválido');
  END IF;

  SELECT tm.*, t.created_by
    INTO v_match
  FROM tournament_matches tm
  JOIN tournaments t ON t.id = tm.tournament_id
  WHERE tm.id = p_match_id;

  IF v_match.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Partida não encontrada');
  END IF;

  v_created_by := v_match.created_by;
  IF v_created_by <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Sem permissão');
  END IF;

  IF p_result = 'draw' THEN
    IF v_match.player1_id IS NULL OR v_match.player2_id IS NULL THEN
      RETURN json_build_object('success', false, 'message', 'Empate exige dois jogadores');
    END IF;
    UPDATE tournament_matches
       SET winner_id = NULL,
           status = 'completed',
           player1_result = 'draw',
           player2_result = 'draw',
           player1_reported = true,
           player2_reported = true
     WHERE id = p_match_id;
  ELSE
    UPDATE tournament_matches
       SET winner_id = CASE WHEN p_result = 'player1_win' THEN player1_id ELSE player2_id END,
           status = 'completed',
           player1_result = CASE WHEN p_result = 'player1_win' THEN 'win' ELSE 'loss' END,
           player2_result = CASE WHEN p_result = 'player2_win' THEN 'win' ELSE 'loss' END,
           player1_reported = true,
           player2_reported = true
     WHERE id = p_match_id;
  END IF;

  PERFORM public.recalc_tournament_stats_internal(v_match.tournament_id);

  RETURN json_build_object('success', true, 'message', 'Resultado atualizado');
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_match_winner(p_match_id uuid, p_winner_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_match RECORD;
BEGIN
  SELECT * INTO v_match FROM tournament_matches WHERE id = p_match_id;
  IF v_match.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Partida não encontrada');
  END IF;

  IF p_winner_id = v_match.player1_id THEN
    RETURN public.set_match_result(p_match_id, 'player1_win');
  ELSIF p_winner_id = v_match.player2_id THEN
    RETURN public.set_match_result(p_match_id, 'player2_win');
  END IF;

  RETURN json_build_object('success', false, 'message', 'Vencedor inválido para esta partida');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_match_result(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_tournament_stats(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_tournament_stats_internal(uuid) FROM anon, authenticated;