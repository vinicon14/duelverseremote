-- =====================================================
-- Garantia: tournament_finalize_winner está disponível
-- Data: 2026-10-05 10:44:00
-- =====================================================
--
-- PROBLEMA 2: TournamentWinnerSelector chama tournament_finalize_winner,
-- que pode falhar por RLS ao atualizar tournaments.status = 'completed'.
--
-- ANÁLISE: O commit fc1b422 "Corrigiu seleção de ganhador" já introduziu
-- tournament_finalize_winner (drizzle/migrations/0000_tournament_finalize_winner.sql)
-- que é SECURITY DEFINER, valida criador/admin, chama tournament_pay_winner
-- e atualiza o status do torneio.
--
-- Esta migration garante que tournament_finalize_winner está no schema
-- supabase/migrations (além de drizzle) e verifica se as policies de
-- tournaments permitem UPDATE do status via SECURITY DEFINER.
-- =====================================================

-- Recria tournament_finalize_winner (idempotente, mesmo conteúdo do drizzle)
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

  -- Paga prêmio se houver (e ainda não foi pago)
  IF COALESCE(v_t.prize_pool, 0) > 0 THEN
    -- Verifica se já foi pago
    IF NOT EXISTS (
      SELECT 1 
      FROM duelcoins_transactions
      WHERE tournament_id = p_tournament_id 
        AND transaction_type = 'tournament_prize' 
        AND receiver_id = p_winner_id
    ) THEN
      -- Chama tournament_pay_winner para pagar
      v_pay := public.tournament_pay_winner(p_tournament_id, p_winner_id, v_t.prize_pool);
      
      -- Se pagamento falhar, retorna erro
      IF NOT COALESCE((v_pay->>'success')::BOOLEAN, false) THEN
        RETURN v_pay;
      END IF;
      
      v_paid := v_t.prize_pool;
    END IF;
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
  'Finaliza torneio: valida criador/admin, paga prêmio (se houver e ainda não pago), marca vencedor e define status=completed. Chamado por TournamentWinnerSelector.';

-- Verifica/cria policy de UPDATE em tournaments para SECURITY DEFINER
-- (SECURITY DEFINER bypassa RLS, mas é bom ter policy explícita)
DO $$
BEGIN
  -- Se não existir policy de UPDATE para criadores/admins, cria
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'tournaments' 
      AND policyname = 'Creators and admins can update tournaments'
  ) THEN
    CREATE POLICY "Creators and admins can update tournaments"
      ON public.tournaments
      FOR UPDATE
      TO authenticated
      USING (
        created_by = auth.uid() 
        OR public.is_admin(auth.uid())
      )
      WITH CHECK (
        created_by = auth.uid() 
        OR public.is_admin(auth.uid())
      );
  END IF;
END $$;

-- Garante que a policy de SELECT em tournaments existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'tournaments' 
      AND policyname = 'Anyone can view tournaments'
  ) THEN
    CREATE POLICY "Anyone can view tournaments"
      ON public.tournaments
      FOR SELECT
      TO public
      USING (true);
  END IF;
END $$;
