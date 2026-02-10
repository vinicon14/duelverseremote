-- ============================================
-- SISTEMA DE TORNEIOS NORMAIS COM PAGAMENTOS
-- Execute este script no Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. ADICIONAR COLUNAS À TABELA tournaments
-- ============================================
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_weekly BOOLEAN DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS total_collected DECIMAL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_paid BOOLEAN DEFAULT FALSE;

-- ============================================
-- 2. CRIAR ÍNDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tournaments_is_weekly ON tournaments(is_weekly);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_by ON tournaments(created_by);

-- ============================================
-- 3. CRIAR FUNÇÃO: create_normal_tournament
-- ============================================
CREATE OR REPLACE FUNCTION create_normal_tournament(
  p_name TEXT,
  p_description TEXT,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_prize_pool DECIMAL,
  p_entry_fee DECIMAL,
  p_max_participants INTEGER DEFAULT 32,
  p_tournament_type TEXT DEFAULT 'single_elimination'
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_user_balance DECIMAL;
  v_tournament_id UUID;
  v_total_rounds INTEGER;
BEGIN
  -- Get current user
  SELECT auth.uid() INTO v_user_id;
  
  -- Get user balance
  SELECT duelcoins_balance INTO v_user_balance FROM profiles WHERE user_id = v_user_id;
  
  -- Validate sufficient balance for prize pool
  IF v_user_balance < p_prize_pool THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Saldo insuficiente. Você precisa de ' || p_prize_pool || ' DuelCoins para o prêmio.'
    );
  END IF;
  
  -- Deduct prize pool from creator
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool 
  WHERE user_id = v_user_id;
  
  -- Log transaction
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento antecipado de prêmio - Torneio Normal: ' || p_name);
  
  -- Calculate total rounds based on participants
  v_total_rounds := CEIL(LOG(2, p_max_participants::FLOAT))::INTEGER;
  
  -- Create tournament
  INSERT INTO tournaments (
    name, description, start_date, end_date, max_participants,
    prize_pool, entry_fee, created_by, status, is_weekly,
    tournament_type, total_rounds, min_participants
  ) VALUES (
    p_name, p_description, p_start_date, p_end_date, p_max_participants,
    p_prize_pool, p_entry_fee, v_user_id, 'upcoming', FALSE,
    p_tournament_type, v_total_rounds, 4
  )
  RETURNING id INTO v_tournament_id;
  
  RETURN json_build_object(
    'success', TRUE,
    'tournament_id', v_tournament_id,
    'message', 'Torneio Normal criado com sucesso!'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. CRIAR FUNÇÃO: join_normal_tournament
-- ============================================
CREATE OR REPLACE FUNCTION join_normal_tournament(p_tournament_id UUID)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
  v_user_id UUID;
  v_current_participants INTEGER;
  v_user_balance DECIMAL;
BEGIN
  -- Get current user
  SELECT auth.uid() INTO v_user_id;
  
  -- Get tournament info
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  -- Validate tournament exists
  IF v_tournament.id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Torneio não encontrado');
  END IF;
  
  -- Validate tournament is not weekly
  IF v_tournament.is_weekly = TRUE THEN
    RETURN json_build_object('success', FALSE, 'message', 'Use a função de inscrição de Torneio Semanal');
  END IF;
  
  -- Validate tournament is open
  IF v_tournament.status != 'upcoming' THEN
    RETURN json_build_object('success', FALSE, 'message', 'Inscrições encerradas');
  END IF;
  
  -- Check if user is creator (can't join own tournament)
  IF v_tournament.created_by = v_user_id THEN
    RETURN json_build_object('success', FALSE, 'message', 'Você não pode se inscrever no seu próprio torneio');
  END IF;
  
  -- Check participant limit
  SELECT COUNT(*) INTO v_current_participants 
  FROM tournament_participants WHERE tournament_id = p_tournament_id;
  
  IF v_current_participants >= v_tournament.max_participants THEN
    RETURN json_build_object('success', FALSE, 'message', 'Torneio lotado');
  END IF;
  
  -- Check if already joined
  IF EXISTS (
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = p_tournament_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('success', FALSE, 'message', 'Você já está inscrito neste torneio');
  END IF;
  
  -- Check user balance for entry fee
  IF v_tournament.entry_fee > 0 THEN
    SELECT duelcoins_balance INTO v_user_balance FROM profiles WHERE user_id = v_user_id;
    IF v_user_balance < v_tournament.entry_fee THEN
      RETURN json_build_object('success', FALSE, 'message', 'Saldo insuficiente para taxa de inscrição');
    END IF;
    
    -- Deduct entry fee from participant
    UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_tournament.entry_fee 
    WHERE user_id = v_user_id;
    
    -- Send entry_fee to creator (arrecadação)
    UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_tournament.entry_fee 
    WHERE user_id = v_tournament.created_by;
    
    -- Log transactions
    INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (v_user_id, v_tournament.created_by, v_tournament.entry_fee, 'tournament_entry', 
            'Taxa de inscrição - Torneio Normal: ' || v_tournament.name);
    
    -- Update total collected for creator
    UPDATE tournaments SET total_collected = total_collected + v_tournament.entry_fee
    WHERE id = p_tournament_id;
  END IF;
  
  -- Add participant
  INSERT INTO tournament_participants (tournament_id, user_id, joined_at)
  VALUES (p_tournament_id, v_user_id, NOW());
  
  RETURN json_build_object('success', TRUE, 'message', 'Inscrição realizada com sucesso!');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. CRIAR FUNÇÃO: distribute_normal_tournament_prize
-- ============================================
CREATE OR REPLACE FUNCTION distribute_normal_tournament_prize(
  p_tournament_id UUID,
  p_winner_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  -- Get tournament info
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  -- Validate
  IF v_tournament.id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Torneio não encontrado');
  END IF;
  
  IF v_tournament.prize_paid THEN
    RETURN json_build_object('success', FALSE, 'message', 'Prêmio já foi pago');
  END IF;
  
  IF v_tournament.is_weekly = TRUE THEN
    RETURN json_build_object('success', FALSE, 'message', 'Este não é um Torneio Normal');
  END IF;
  
  -- Validate winner is participant
  IF NOT EXISTS (
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = p_tournament_id AND user_id = p_winner_id
  ) THEN
    RETURN json_build_object('success', FALSE, 'message', 'O vencedor não é participante deste torneio');
  END IF;
  
  -- Distribute prize to winner
  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_tournament.prize_pool 
  WHERE user_id = p_winner_id;
  
  -- Log transaction
  INSERT INTO duelcoins_transactions (receiver_id, amount, transaction_type, description)
  VALUES (p_winner_id, v_tournament.prize_pool, 'tournament_win', 
          'Prêmio de Torneio Normal: ' || v_tournament.name);
  
  -- Mark prize as paid
  UPDATE tournaments SET prize_paid = TRUE WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', TRUE,
    'message', 'Prêmio distribuído com sucesso para o vencedor!'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. CRIAR FUNÇÃO: get_normal_tournaments
-- ============================================
CREATE OR REPLACE FUNCTION get_normal_tournaments()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', t.id,
        'name', t.name,
        'description', t.description,
        'start_date', t.start_date,
        'end_date', t.end_date,
        'max_participants', t.max_participants,
        'prize_pool', t.prize_pool,
        'entry_fee', t.entry_fee,
        'status', t.status,
        'is_weekly', t.is_weekly,
        'total_collected', t.total_collected,
        'prize_paid', t.prize_paid,
        'created_by', t.created_by,
        'current_round', t.current_round,
        'participant_count', (
          SELECT COUNT(*) FROM tournament_participants tp 
          WHERE tp.tournament_id = t.id
        )
      )
    )
    FROM tournaments t
    WHERE t.is_weekly = FALSE
    ORDER BY t.created_at DESC
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. CRIAR FUNÇÃO: get_my_tournaments
-- ============================================
CREATE OR REPLACE FUNCTION get_my_tournaments()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', t.id,
        'name', t.name,
        'status', t.status,
        'is_weekly', t.is_weekly,
        'created_by', t.created_by,
        'current_round', t.current_round,
        'created_at', t.created_at
      )
    )
    FROM tournaments t
    INNER JOIN tournament_participants tp ON tp.tournament_id = t.id
    WHERE tp.user_id = v_user_id
    ORDER BY t.created_at DESC
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. CRIAR FUNÇÃO: get_my_created_tournaments
-- ============================================
CREATE OR REPLACE FUNCTION get_my_created_tournaments()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', t.id,
        'name', t.name,
        'status', t.status,
        'is_weekly', t.is_weekly,
        'total_collected', t.total_collected,
        'prize_paid', t.prize_paid,
        'prize_pool', t.prize_pool,
        'participant_count', (
          SELECT COUNT(*) FROM tournament_participants tp 
          WHERE tp.tournament_id = t.id
        ),
        'created_at', t.created_at
      )
    )
    FROM tournaments t
    WHERE t.created_by = v_user_id
    ORDER BY t.created_at DESC
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. CRIAR FUNÇÃO: get_tournament_participants
-- ============================================
CREATE OR REPLACE FUNCTION get_tournament_participants(p_tournament_id UUID)
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(
      json_build_object(
        'user_id', p.user_id,
        'username', p.username,
        'avatar_url', p.avatar_url,
        'is_online', p.is_online,
        'joined_at', tp.joined_at
      )
    )
    FROM tournament_participants tp
    INNER JOIN profiles p ON p.user_id = tp.user_id
    WHERE tp.tournament_id = p_tournament_id
    ORDER BY tp.joined_at ASC
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 10. CRIAR FUNÇÃO: get_tournament_opponents
-- ============================================
CREATE OR REPLACE FUNCTION get_tournament_opponents(p_tournament_id UUID)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_result JSON;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  -- Get opponents where user is player1
  SELECT json_agg(
    json_build_object(
      'opponent_id', tm.player2_id,
      'opponent_username', p2.username,
      'match_id', tm.id,
      'round', tm.round,
      'status', tm.status
    )
  ) INTO v_result
  FROM tournament_matches tm
  LEFT JOIN profiles p2 ON p2.user_id = tm.player2_id
  WHERE tm.player1_id = v_user_id
    AND tm.tournament_id = p_tournament_id
    AND tm.status = 'pending'
    AND tm.player2_id IS NOT NULL;
    
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 11. VERIFICAÇÃO DO SISTEMA
-- ============================================
SELECT 
  routine_name, 
  routine_type 
FROM information_schema.routines 
WHERE routine_name IN (
  'create_normal_tournament',
  'join_normal_tournament',
  'distribute_normal_tournament_prize',
  'get_normal_tournaments',
  'get_my_tournaments',
  'get_my_created_tournaments',
  'get_tournament_participants',
  'get_tournament_opponents'
)
ORDER BY routine_name;
