CREATE OR REPLACE FUNCTION public.regenerate_tournament_bracket(p_tournament_id uuid, p_from_round integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_created_by uuid;
  v_deleted int := 0;
  v_gen json;
BEGIN
  SELECT created_by INTO v_created_by FROM tournaments WHERE id = p_tournament_id;

  IF v_created_by IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;

  IF v_created_by <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador ou admin pode regerar a chave');
  END IF;

  IF p_from_round IS NULL OR p_from_round < 1 THEN
    RETURN json_build_object('success', false, 'message', 'Rodada inválida');
  END IF;

  DELETE FROM tournament_match_reports
  WHERE match_id IN (
    SELECT id FROM tournament_matches
    WHERE tournament_id = p_tournament_id AND round > p_from_round
  );

  WITH del AS (
    DELETE FROM tournament_matches
    WHERE tournament_id = p_tournament_id AND round > p_from_round
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM del;

  UPDATE tournaments SET current_round = p_from_round WHERE id = p_tournament_id;

  PERFORM public.recalc_tournament_stats_internal(p_tournament_id);

  v_gen := public.generate_next_round(p_tournament_id);

  RETURN json_build_object(
    'success', true,
    'deleted_matches', v_deleted,
    'from_round', p_from_round,
    'generation', v_gen
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.regenerate_tournament_bracket(uuid, integer) TO authenticated;