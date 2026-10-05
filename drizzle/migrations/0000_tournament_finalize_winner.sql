CREATE OR REPLACE FUNCTION public.tournament_finalize_winner(p_tournament_id uuid, p_winner_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_t record;
  v_pay json;
  v_paid integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;
  SELECT id, created_by, status, prize_pool INTO v_t FROM tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  IF v_t.created_by IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode escolher o vencedor');
  END IF;
  IF v_t.status = 'completed' THEN
    RETURN json_build_object('success', false, 'message', 'Torneio já finalizado');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tournament_participants WHERE tournament_id = p_tournament_id AND user_id = p_winner_id) THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não é participante do torneio');
  END IF;

  IF COALESCE(v_t.prize_pool, 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM duelcoins_transactions
    WHERE tournament_id = p_tournament_id AND transaction_type = 'tournament_prize' AND receiver_id = p_winner_id
  ) THEN
    v_pay := public.tournament_pay_winner(p_tournament_id, p_winner_id, v_t.prize_pool);
    IF NOT COALESCE((v_pay->>'success')::boolean, false) THEN
      RETURN v_pay;
    END IF;
    v_paid := v_t.prize_pool;
  END IF;

  UPDATE tournament_participants SET status = 'winner'
   WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;
  UPDATE tournaments SET status = 'completed', end_date = now(), prize_paid = true
   WHERE id = p_tournament_id;

  RETURN json_build_object('success', true, 'amount_paid', v_paid);
END;
$$;
REVOKE ALL ON FUNCTION public.tournament_finalize_winner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_finalize_winner(uuid, uuid) TO authenticated, service_role;