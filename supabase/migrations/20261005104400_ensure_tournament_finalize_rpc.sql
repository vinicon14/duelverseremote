-- =====================================================
-- Garantia: tournament_finalize_winner em supabase/migrations
-- Data: 2026-10-05 10:44:00
-- =====================================================
--
-- CONTEXTO: O commit fc1b422 "Corrigiu seleção de ganhador" introduziu
-- tournament_finalize_winner em drizzle/migrations/0000_tournament_finalize_winner.sql.
--
-- PROBLEMA: Lovable Cloud pode usar apenas supabase/migrations/ para produção,
-- não drizzle/migrations/. Esta migration garante que tournament_finalize_winner
-- está disponível em supabase/migrations também (cópia do drizzle).
--
-- VALIDAÇÃO prize_pool=0: A função CORRETAMENTE trata torneios com prêmio
-- manual (R$ 10 Pix ou PRO). Se prize_pool = 0, apenas marca vencedor e
-- finaliza (status = 'completed'), sem tentar pagar DuelCoins.
-- =====================================================

-- Copia tournament_finalize_winner do drizzle para supabase/migrations
-- (idempotente via CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION public.tournament_finalize_winner(
  p_tournament_id UUID, 
  p_winner_id UUID
)
RETURNS JSON 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_t RECORD;
  v_pay JSON;
  v_paid INTEGER := 0;
BEGIN
  -- Valida autenticação
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Busca torneio
  SELECT id, created_by, status, prize_pool 
  INTO v_t 
  FROM tournaments 
  WHERE id = p_tournament_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;

  -- Valida permissão: só criador ou admin
  IF v_t.created_by IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode escolher o vencedor');
  END IF;

  -- Valida status: não pode finalizar torneio já completo
  IF v_t.status = 'completed' THEN
    RETURN json_build_object('success', false, 'message', 'Torneio já finalizado');
  END IF;

  -- Valida vencedor: tem que ser participante
  IF NOT EXISTS (
    SELECT 1 
    FROM tournament_participants 
    WHERE tournament_id = p_tournament_id 
      AND user_id = p_winner_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não é participante do torneio');
  END IF;

  -- Paga prêmio SE houver prize_pool > 0 E ainda não foi pago
  -- IMPORTANTE: Se prize_pool = 0, pula pagamento (prêmio é manual: Pix/PRO)
  IF COALESCE(v_t.prize_pool, 0) > 0 AND NOT EXISTS (
    SELECT 1 
    FROM duelcoins_transactions
    WHERE tournament_id = p_tournament_id 
      AND transaction_type = 'tournament_prize' 
      AND receiver_id = p_winner_id
  ) THEN
    -- Chama tournament_pay_winner para pagar em DuelCoins
    v_pay := public.tournament_pay_winner(p_tournament_id, p_winner_id, v_t.prize_pool);
    
    -- Se pagamento falhar, retorna erro
    IF NOT COALESCE((v_pay->>'success')::BOOLEAN, false) THEN
      RETURN v_pay;
    END IF;
    
    v_paid := v_t.prize_pool;
  END IF;

  -- Marca vencedor
  UPDATE tournament_participants 
  SET status = 'winner'
  WHERE tournament_id = p_tournament_id 
    AND user_id = p_winner_id;

  -- Finaliza torneio (SECURITY DEFINER permite UPDATE mesmo com RLS)
  UPDATE tournaments 
  SET status = 'completed', 
      end_date = now(), 
      prize_paid = true
  WHERE id = p_tournament_id;

  RETURN json_build_object('success', true, 'amount_paid', v_paid);
END;
$$;

-- Revoga execução pública e concede apenas a authenticated e service_role
REVOKE ALL ON FUNCTION public.tournament_finalize_winner(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_finalize_winner(UUID, UUID) TO authenticated, service_role;

-- Documenta
COMMENT ON FUNCTION public.tournament_finalize_winner(UUID, UUID) IS 
  'Finaliza torneio: valida criador/admin, paga prêmio SE prize_pool > 0 (senão prêmio é manual: Pix/PRO), marca vencedor e define status=completed. Chamado por TournamentWinnerSelector. Cópia de drizzle/migrations/0000_tournament_finalize_winner.sql para garantir disponibilidade em produção Lovable.';
