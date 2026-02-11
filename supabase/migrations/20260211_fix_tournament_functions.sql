-- Migração: Corrigir funções RPC do Gerenciador de Torneios
-- Data: 2026-02-11

-- ============================================
-- 1. FUNÇÃO: get_my_created_tournaments
-- ============================================
DROP FUNCTION IF EXISTS public.get_my_created_tournaments();

CREATE OR REPLACE FUNCTION public.get_my_created_tournaments()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  IF v_user_id IS NULL THEN
    RETURN '[]'::JSON;
  END IF;
  
  SELECT json_agg(
    json_build_object(
      'id', t.id,
      'name', t.name,
      'description', t.description,
      'status', t.status,
      'is_weekly', COALESCE(t.is_weekly, false),
      'start_date', t.start_date,
      'end_date', t.end_date,
      'prize_pool', COALESCE(t.prize_pool, 0),
      'entry_fee', COALESCE(t.entry_fee, 0),
      'current_round', COALESCE(t.current_round, 0),
      'total_rounds', t.total_rounds,
      'created_at', t.created_at,
      'participant_count', COALESCE(tp_count.count, 0),
      'total_collected', COALESCE(dt_sum.total, 0),
      'prize_paid', COALESCE(dt_prize.exists_prize, false)
    )
    ORDER BY t.created_at DESC
  ) INTO v_result
  FROM tournaments t
  LEFT JOIN (
    SELECT tournament_id, COUNT(*) as count 
    FROM tournament_participants 
    GROUP BY tournament_id
  ) tp_count ON tp_count.tournament_id = t.id
  LEFT JOIN (
    SELECT tournament_id, SUM(amount) as total 
    FROM duelcoins_transactions 
    WHERE transaction_type = 'tournament_entry'
    GROUP BY tournament_id
  ) dt_sum ON dt_sum.tournament_id = t.id
  LEFT JOIN (
    SELECT tournament_id, true as exists_prize 
    FROM duelcoins_transactions 
    WHERE transaction_type = 'tournament_prize'
    GROUP BY tournament_id
  ) dt_prize ON dt_prize.tournament_id = t.id
  WHERE t.created_by = v_user_id;
  
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 2. FUNÇÃO: get_tournament_participants
-- ============================================
DROP FUNCTION IF EXISTS public.get_tournament_participants(UUID);

CREATE OR REPLACE FUNCTION public.get_tournament_participants(p_tournament_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN '[]'::JSON;
  END IF;
  
  SELECT json_agg(
    json_build_object(
      'user_id', tp.user_id,
      'username', COALESCE(p.username, 'Usuário'),
      'avatar_url', p.avatar_url,
      'is_online', COALESCE(p.is_online, false),
      'joined_at', tp.registered_at,
      'status', tp.status,
      'wins', COALESCE(tp.wins, 0),
      'losses', COALESCE(tp.losses, 0),
      'score', COALESCE(tp.score, 0)
    )
    ORDER BY tp.registered_at ASC
  ) INTO v_result
  FROM tournament_participants tp
  LEFT JOIN profiles p ON p.user_id = tp.user_id
  WHERE tp.tournament_id = p_tournament_id;
  
  RETURN COALESCE(v_result, '[]'::JSON);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. FUNÇÃO: finalize_tournament_and_pay_winner
-- ============================================
-- Esta função é chamada quando o torneio termina para pagar o vencedor
DROP FUNCTION IF EXISTS public.finalize_tournament_and_pay_winner(UUID, UUID);

CREATE OR REPLACE FUNCTION public.finalize_tournament_and_pay_winner(
  p_tournament_id UUID,
  p_winner_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
  v_winner_profile RECORD;
  v_prize_amount INTEGER;
BEGIN
  -- Verificar se o torneio existe
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  
  -- Verificar se já foi pago
  IF EXISTS (
    SELECT 1 FROM duelcoins_transactions 
    WHERE tournament_id = p_tournament_id 
    AND transaction_type = 'tournament_prize'
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Prêmio já foi pago');
  END IF;
  
  -- Calcular o prêmio (total arrecadado)
  SELECT COALESCE(SUM(amount), 0) INTO v_prize_amount
  FROM duelcoins_transactions
  WHERE tournament_id = p_tournament_id 
  AND transaction_type = 'tournament_entry';
  
  -- Se não tiver taxa de entrada, usar o prize_pool do torneio
  IF v_prize_amount = 0 THEN
    v_prize_amount := COALESCE(v_tournament.prize_pool, 0);
  END IF;
  
  -- Se não tiver prêmio, apenas finalizar
  IF v_prize_amount <= 0 THEN
    UPDATE tournaments SET status = 'completed', end_date = NOW()
    WHERE id = p_tournament_id;
    
    UPDATE tournament_participants SET status = 'winner'
    WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;
    
    RETURN json_build_object('success', true, 'message', 'Torneio finalizado sem prêmio');
  END IF;
  
  -- Buscar perfil do vencedor
  SELECT * INTO v_winner_profile
  FROM profiles
  WHERE user_id = p_winner_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não encontrado');
  END IF;
  
  -- Transferir prêmio
  UPDATE profiles
  SET duelcoins_balance = duelcoins_balance + v_prize_amount
  WHERE user_id = p_winner_id;
  
  -- Registrar transação
  INSERT INTO duelcoins_transactions (
    sender_id,
    receiver_id,
    amount,
    transaction_type,
    tournament_id,
    description
  ) VALUES (
    NULL,
    p_winner_id,
    v_prize_amount,
    'tournament_prize',
    p_tournament_id,
    'Prêmio do torneio: ' || v_tournament.name
  );
  
  -- Marcar vencedor
  UPDATE tournament_participants
  SET status = 'winner'
  WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;
  
  -- Finalizar torneio
  UPDATE tournaments
  SET status = 'completed', end_date = NOW()
  WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true, 
    'message', 'Prêmio de ' || v_prize_amount || ' DuelCoins pago ao vencedor!',
    'prize_amount', v_prize_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. PERMISSÕES
-- ============================================
GRANT EXECUTE ON FUNCTION public.get_my_created_tournaments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tournament_participants(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tournament_and_pay_winner(UUID, UUID) TO authenticated;

-- ============================================
-- 5. COMENTÁRIOS
-- ============================================
COMMENT ON FUNCTION public.get_my_created_tournaments() IS 'Retorna todos os torneios criados pelo usuário atual com estatísticas completas';
COMMENT ON FUNCTION public.get_tournament_participants(UUID) IS 'Retorna todos os participantes de um torneio específico';
COMMENT ON FUNCTION public.finalize_tournament_and_pay_winner(UUID, UUID) IS 'Finaliza o torneio e paga o prêmio ao vencedor';
