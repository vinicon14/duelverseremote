-- Migração: Adicionar view para verificar torneios prontos para finalização
-- Data: 2026-02-11

-- ============================================
-- VIEW: tournaments_ready_for_completion
-- Mostra torneios que têm todas as partidas da rodada final completadas
-- mas ainda não foram finalizados (prêmio não distribuído)
-- ============================================
DROP VIEW IF EXISTS public.tournaments_ready_for_completion;

CREATE OR REPLACE VIEW public.tournaments_ready_for_completion AS
SELECT 
  t.id as tournament_id,
  t.name as tournament_name,
  t.created_by,
  t.current_round,
  t.total_rounds,
  t.prize_pool,
  t.status,
  (SELECT COUNT(*) FROM tournament_matches tm 
   WHERE tm.tournament_id = t.id AND tm.round = t.total_rounds) as final_round_matches,
  (SELECT COUNT(*) FROM tournament_matches tm 
   WHERE tm.tournament_id = t.id AND tm.round = t.total_rounds AND tm.status = 'completed') as completed_final_matches,
  (SELECT winner_id FROM tournament_matches tm 
   WHERE tm.tournament_id = t.id AND tm.round = t.total_rounds AND tm.status = 'completed' AND tm.winner_id IS NOT NULL
   ORDER BY tm.completed_at DESC LIMIT 1) as last_winner_id,
  NOT EXISTS (
    SELECT 1 FROM duelcoins_transactions dt 
    WHERE dt.tournament_id = t.id AND dt.transaction_type = 'tournament_prize'
  ) as prize_not_paid
FROM tournaments t
WHERE t.status = 'active'
AND t.total_rounds IS NOT NULL
AND t.current_round = t.total_rounds
AND (
  SELECT COUNT(*) FROM tournament_matches tm 
  WHERE tm.tournament_id = t.id AND tm.round = t.total_rounds
) = (
  SELECT COUNT(*) FROM tournament_matches tm 
  WHERE tm.tournament_id = t.id AND tm.round = t.total_rounds AND tm.status = 'completed'
)
AND NOT EXISTS (
  SELECT 1 FROM duelcoins_transactions dt 
  WHERE dt.tournament_id = t.id AND dt.transaction_type = 'tournament_prize'
);

-- Permissões
GRANT SELECT ON public.tournaments_ready_for_completion TO authenticated;

-- Comentário
COMMENT ON VIEW public.tournaments_ready_for_completion IS 'Torneios ativos que têm todas as partidas da rodada final completadas e estão prontos para receber a distribuição do prêmio';

-- ============================================
-- FUNÇÃO: get_tournament_final_status
-- Retorna informações sobre o status final do torneio
-- ============================================
DROP FUNCTION IF EXISTS public.get_tournament_final_status(UUID);

CREATE OR REPLACE FUNCTION public.get_tournament_final_status(p_tournament_id UUID)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
  v_final_matches INTEGER;
  v_completed_matches INTEGER;
  v_last_winner UUID;
  v_prize_paid BOOLEAN;
BEGIN
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  
  -- Contar partidas da rodada final
  SELECT COUNT(*) INTO v_final_matches
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
  AND round = v_tournament.total_rounds;
  
  -- Contar partidas completadas da rodada final
  SELECT COUNT(*) INTO v_completed_matches
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
  AND round = v_tournament.total_rounds
  AND status = 'completed';
  
  -- Buscar último vencedor
  SELECT winner_id INTO v_last_winner
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
  AND round = v_tournament.total_rounds
  AND status = 'completed'
  AND winner_id IS NOT NULL
  ORDER BY completed_at DESC
  LIMIT 1;
  
  -- Verificar se prêmio foi pago
  SELECT EXISTS (
    SELECT 1 FROM duelcoins_transactions 
    WHERE tournament_id = p_tournament_id 
    AND transaction_type = 'tournament_prize'
  ) INTO v_prize_paid;
  
  RETURN json_build_object(
    'success', true,
    'tournament_id', p_tournament_id,
    'status', v_tournament.status,
    'current_round', v_tournament.current_round,
    'total_rounds', v_tournament.total_rounds,
    'is_final_round', v_tournament.current_round = v_tournament.total_rounds,
    'final_matches', v_final_matches,
    'completed_final_matches', v_completed_matches,
    'all_final_matches_completed', v_final_matches > 0 AND v_final_matches = v_completed_matches,
    'last_winner_id', v_last_winner,
    'prize_paid', v_prize_paid,
    'ready_for_completion', v_tournament.status = 'active' 
      AND v_tournament.current_round = v_tournament.total_rounds
      AND v_final_matches > 0 
      AND v_final_matches = v_completed_matches
      AND NOT v_prize_paid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissões
GRANT EXECUTE ON FUNCTION public.get_tournament_final_status(UUID) TO authenticated;

-- Comentário
COMMENT ON FUNCTION public.get_tournament_final_status(UUID) IS 'Retorna informações detalhadas sobre o status final de um torneio, indicando se está pronto para finalização';
