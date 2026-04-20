-- 1) Atualiza set_match_winner para distribuir pontos e notificar
CREATE OR REPLACE FUNCTION public.set_match_winner(p_match_id uuid, p_winner_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_match RECORD;
  v_loser_id uuid;
  v_created_by uuid;
  v_tournament_name text;
BEGIN
  SELECT tm.*, t.created_by, t.name AS tournament_name
    INTO v_match
  FROM tournament_matches tm
  JOIN tournaments t ON t.id = tm.tournament_id
  WHERE tm.id = p_match_id;

  IF v_match.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Partida não encontrada');
  END IF;

  v_created_by := v_match.created_by;
  v_tournament_name := v_match.tournament_name;

  -- Permissão: criador ou admin
  IF v_created_by != auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Sem permissão');
  END IF;

  -- Determina perdedor
  IF p_winner_id = v_match.player1_id THEN
    v_loser_id := v_match.player2_id;
  ELSIF p_winner_id = v_match.player2_id THEN
    v_loser_id := v_match.player1_id;
  ELSE
    RETURN json_build_object('success', false, 'message', 'Vencedor inválido para esta partida');
  END IF;

  -- Atualiza partida (idempotente: só pontua se ainda não estava completed)
  IF v_match.status <> 'completed' THEN
    UPDATE tournament_matches
       SET winner_id = p_winner_id,
           status = 'completed',
           player1_result = CASE WHEN p_winner_id = player1_id THEN 'win' ELSE 'loss' END,
           player2_result = CASE WHEN p_winner_id = player2_id THEN 'win' ELSE 'loss' END,
           player1_reported = true,
           player2_reported = true
     WHERE id = p_match_id;

    -- +1 vitória, +3 pontos para o vencedor
    UPDATE tournament_participants
       SET wins  = COALESCE(wins, 0) + 1,
           score = COALESCE(score, 0) + 3
     WHERE tournament_id = v_match.tournament_id
       AND user_id = p_winner_id;

    -- +1 derrota para o perdedor (se houver)
    IF v_loser_id IS NOT NULL THEN
      UPDATE tournament_participants
         SET losses = COALESCE(losses, 0) + 1
       WHERE tournament_id = v_match.tournament_id
         AND user_id = v_loser_id;
    END IF;
  ELSE
    -- Já completed: apenas troca o vencedor sem mexer em pontos (admin override)
    UPDATE tournament_matches
       SET winner_id = p_winner_id
     WHERE id = p_match_id;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Vencedor definido');
END;
$function$;

-- 2) Recalcula stats de wins/losses/score em um torneio com base nas partidas concluídas.
--    Útil para torneios onde set_match_winner antigo não pontuava.
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

  -- Reset
  UPDATE tournament_participants
     SET wins = 0, losses = 0, score = 0
   WHERE tournament_id = p_tournament_id;

  -- Recompute wins / score
  UPDATE tournament_participants tp
     SET wins  = sub.wins,
         score = sub.wins * 3
    FROM (
      SELECT winner_id AS user_id, COUNT(*)::int AS wins
        FROM tournament_matches
       WHERE tournament_id = p_tournament_id
         AND status = 'completed'
         AND winner_id IS NOT NULL
       GROUP BY winner_id
    ) sub
   WHERE tp.tournament_id = p_tournament_id
     AND tp.user_id = sub.user_id;

  -- Recompute losses
  UPDATE tournament_participants tp
     SET losses = sub.losses
    FROM (
      SELECT user_id, COUNT(*)::int AS losses FROM (
        SELECT player1_id AS user_id
          FROM tournament_matches
         WHERE tournament_id = p_tournament_id
           AND status = 'completed'
           AND winner_id IS NOT NULL
           AND winner_id <> player1_id
           AND player1_id IS NOT NULL
        UNION ALL
        SELECT player2_id AS user_id
          FROM tournament_matches
         WHERE tournament_id = p_tournament_id
           AND status = 'completed'
           AND winner_id IS NOT NULL
           AND winner_id <> player2_id
           AND player2_id IS NOT NULL
      ) losses_src
      GROUP BY user_id
    ) sub
   WHERE tp.tournament_id = p_tournament_id
     AND tp.user_id = sub.user_id;

  RETURN json_build_object('success', true, 'message', 'Estatísticas recalculadas');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_match_winner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_tournament_stats(uuid) TO authenticated;