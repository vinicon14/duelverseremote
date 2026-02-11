-- Migração: Corrigir distribuição automática de prêmio
-- Data: 2026-02-11

-- ============================================
-- FUNÇÃO: check_and_complete_tournament
-- Verifica se o torneio deve ser finalizado e paga o prêmio
-- ============================================
DROP FUNCTION IF EXISTS public.check_and_complete_tournament(UUID);

CREATE OR REPLACE FUNCTION public.check_and_complete_tournament(p_tournament_id UUID)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
  v_current_round INTEGER;
  v_total_rounds INTEGER;
  v_matches_in_round INTEGER;
  v_completed_matches INTEGER;
  v_last_winner UUID;
  v_prize_amount INTEGER;
  v_winner_profile RECORD;
BEGIN
  -- Buscar dados do torneio
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  
  IF v_tournament.status = 'completed' THEN
    RETURN json_build_object('success', false, 'message', 'Torneio já foi finalizado');
  END IF;
  
  v_current_round := COALESCE(v_tournament.current_round, 1);
  v_total_rounds := COALESCE(v_tournament.total_rounds, 1);
  
  -- Contar partidas na rodada atual
  SELECT COUNT(*), COUNT(CASE WHEN status = 'completed' THEN 1 END)
  INTO v_matches_in_round, v_completed_matches
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
  AND round = v_current_round;
  
  -- Verificar se todas as partidas da rodada foram completadas
  IF v_matches_in_round = 0 OR v_completed_matches < v_matches_in_round THEN
    RETURN json_build_object(
      'success', false, 
      'message', format('Rodada %s ainda não foi completada (%s/%s partidas)', 
        v_current_round, v_completed_matches, v_matches_in_round)
    );
  END IF;
  
  -- Se não for a última rodada, apenas retornar sucesso (a próxima rodada será gerada)
  IF v_current_round < v_total_rounds THEN
    RETURN json_build_object(
      'success', true, 
      'message', format('Rodada %s completada. Próxima rodada será gerada.', v_current_round),
      'is_final', false
    );
  END IF;
  
  -- É a última rodada! Buscar o vencedor
  SELECT winner_id INTO v_last_winner
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
  AND round = v_current_round
  AND winner_id IS NOT NULL
  ORDER BY completed_at DESC
  LIMIT 1;
  
  IF v_last_winner IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Nenhum vencedor encontrado na rodada final');
  END IF;
  
  -- Calcular o prêmio
  SELECT COALESCE(SUM(amount), 0) INTO v_prize_amount
  FROM duelcoins_transactions
  WHERE tournament_id = p_tournament_id
  AND transaction_type = 'tournament_entry';
  
  -- Se não houver taxas de entrada, usar o prize_pool do torneio
  IF v_prize_amount = 0 THEN
    v_prize_amount := COALESCE(v_tournament.prize_pool, 0);
  END IF;
  
  -- Buscar perfil do vencedor
  SELECT * INTO v_winner_profile
  FROM profiles
  WHERE user_id = v_last_winner;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Perfil do vencedor não encontrado');
  END IF;
  
  -- Iniciar transação para garantir consistência
  BEGIN
    -- Transferir prêmio
    IF v_prize_amount > 0 THEN
      UPDATE profiles
      SET duelcoins_balance = duelcoins_balance + v_prize_amount
      WHERE user_id = v_last_winner;
      
      -- Registrar transação
      INSERT INTO duelcoins_transactions (
        sender_id, receiver_id, amount, transaction_type, 
        tournament_id, description
      ) VALUES (
        NULL, v_last_winner, v_prize_amount, 'tournament_prize',
        p_tournament_id, 'Prêmio do torneio: ' || v_tournament.name
      );
    END IF;
    
    -- Marcar vencedor
    UPDATE tournament_participants
    SET status = 'winner'
    WHERE tournament_id = p_tournament_id AND user_id = v_last_winner;
    
    -- Finalizar torneio
    UPDATE tournaments
    SET status = 'completed', end_date = NOW()
    WHERE id = p_tournament_id;
    
    RETURN json_build_object(
      'success', true,
      'message', format('Torneio finalizado! Prêmio de %s DuelCoins pago para %s', 
        v_prize_amount, v_winner_profile.username),
      'is_final', true,
      'winner_id', v_last_winner,
      'winner_username', v_winner_profile.username,
      'prize_amount', v_prize_amount
    );
    
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false, 
      'message', 'Erro ao processar: ' || SQLERRM
    );
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNÇÃO: force_complete_tournament (para admins)
-- Força a finalização do torneio e pagamento do prêmio
-- ============================================
DROP FUNCTION IF EXISTS public.force_complete_tournament(UUID, UUID);

CREATE OR REPLACE FUNCTION public.force_complete_tournament(
  p_tournament_id UUID,
  p_winner_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
  v_winner_id UUID;
  v_prize_amount INTEGER;
  v_winner_profile RECORD;
BEGIN
  -- Verificar se é admin
  IF NOT is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Acesso negado');
  END IF;
  
  -- Buscar dados do torneio
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  
  -- Se não foi especificado um vencedor, pegar o último vencedor registrado
  IF p_winner_id IS NULL THEN
    SELECT winner_id INTO v_winner_id
    FROM tournament_matches
    WHERE tournament_id = p_tournament_id
    AND winner_id IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 1;
    
    IF v_winner_id IS NULL THEN
      RETURN json_build_object('success', false, 'message', 'Nenhum vencedor encontrado');
    END IF;
  ELSE
    v_winner_id := p_winner_id;
  END IF;
  
  -- Calcular o prêmio
  SELECT COALESCE(SUM(amount), 0) INTO v_prize_amount
  FROM duelcoins_transactions
  WHERE tournament_id = p_tournament_id
  AND transaction_type = 'tournament_entry';
  
  IF v_prize_amount = 0 THEN
    v_prize_amount := COALESCE(v_tournament.prize_pool, 0);
  END IF;
  
  -- Buscar perfil do vencedor
  SELECT * INTO v_winner_profile
  FROM profiles
  WHERE user_id = v_winner_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Perfil do vencedor não encontrado');
  END IF;
  
  -- Executar pagamento
  IF v_prize_amount > 0 THEN
    UPDATE profiles
    SET duelcoins_balance = duelcoins_balance + v_prize_amount
    WHERE user_id = v_winner_id;
    
    INSERT INTO duelcoins_transactions (
      sender_id, receiver_id, amount, transaction_type, 
      tournament_id, description
    ) VALUES (
      NULL, v_winner_id, v_prize_amount, 'tournament_prize',
      p_tournament_id, 'Prêmio do torneio: ' || v_tournament.name
    );
  END IF;
  
  UPDATE tournament_participants
  SET status = 'winner'
  WHERE tournament_id = p_tournament_id AND user_id = v_winner_id;
  
  UPDATE tournaments
  SET status = 'completed', end_date = NOW()
  WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true,
    'message', format('Torneio finalizado manualmente! Prêmio de %s DuelCoins pago para %s', 
      v_prize_amount, v_winner_profile.username),
    'winner_id', v_winner_id,
    'winner_username', v_winner_profile.username,
    'prize_amount', v_prize_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissões
GRANT EXECUTE ON FUNCTION public.check_and_complete_tournament(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_complete_tournament(UUID, UUID) TO authenticated;

-- Comentários
COMMENT ON FUNCTION public.check_and_complete_tournament(UUID) IS 'Verifica se o torneio deve ser finalizado e distribui o prêmio automaticamente';
COMMENT ON FUNCTION public.force_complete_tournament(UUID, UUID) IS 'Força a finalização do torneio e pagamento do prêmio (apenas admins)';
