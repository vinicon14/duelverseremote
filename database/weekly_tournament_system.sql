-- ============================================
-- SISTEMA DE TORNEIO SEMANAL AUTOMÁTICO
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

-- ============================================
-- 3. CRIAR FUNÇÃO: create_weekly_tournament
-- ============================================
CREATE OR REPLACE FUNCTION create_weekly_tournament(
  p_name TEXT,
  p_description TEXT,
  p_prize_pool DECIMAL,
  p_entry_fee DECIMAL,
  p_max_participants INTEGER DEFAULT 32
)
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
  v_user_balance DECIMAL;
  v_tournament_id UUID;
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
BEGIN
  -- Get current user
  SELECT auth.uid() INTO v_user_id;
  
  -- Get user balance
  SELECT duelcoins_balance INTO v_user_balance FROM profiles WHERE user_id = v_user_id;
  
  -- Validate sufficient balance
  IF v_user_balance < p_prize_pool THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Saldo insuficiente. Você precisa de ' || p_prize_pool || ' DuelCoins.'
    );
  END IF;
  
  -- Calculate dates (7 days = 1 week)
  v_start_date := NOW();
  v_end_date := NOW() + INTERVAL '7 days';
  
  -- Deduct prize pool from creator
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool 
  WHERE user_id = v_user_id;
  
  -- Log transaction
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento antecipado de prêmio - Torneio Semanal: ' || p_name);
  
  -- Create tournament with single elimination (5 rounds for 32 players)
  INSERT INTO tournaments (
    name, description, start_date, end_date, max_participants,
    prize_pool, entry_fee, created_by, status, is_weekly,
    tournament_type, total_rounds
  ) VALUES (
    p_name, p_description, v_start_date, v_end_date, p_max_participants,
    p_prize_pool, p_entry_fee, v_user_id, 'upcoming', TRUE,
    'single_elimination', 5
  )
  RETURNING id INTO v_tournament_id;
  
  RETURN json_build_object(
    'success', TRUE,
    'tournament_id', v_tournament_id,
    'message', 'Torneio Semanal criado com sucesso!'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 4. CRIAR FUNÇÃO: join_weekly_tournament
-- ============================================
CREATE OR REPLACE FUNCTION join_weekly_tournament(p_tournament_id UUID)
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
  
  -- Validate tournament exists and is weekly
  IF v_tournament.id IS NULL OR v_tournament.is_weekly = FALSE THEN
    RETURN json_build_object('success', FALSE, 'message', 'Torneio não encontrado');
  END IF;
  
  -- Validate tournament is open
  IF v_tournament.status != 'upcoming' THEN
    RETURN json_build_object('success', FALSE, 'message', 'Inscrições encerradas');
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
    RETURN json_build_object('success', FALSE, 'message', 'Você já está inscrito');
  END IF;
  
  -- Check user balance
  SELECT duelcoins_balance INTO v_user_balance FROM profiles WHERE user_id = v_user_id;
  IF v_user_balance < v_tournament.entry_fee THEN
    RETURN json_build_object('success', FALSE, 'message', 'Saldo insuficiente para taxa de inscrição');
  END IF;
  
  -- Deduct entry fee from participant
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_tournament.entry_fee 
  WHERE user_id = v_user_id;
  
  -- Add participant
  INSERT INTO tournament_participants (tournament_id, user_id, joined_at)
  VALUES (p_tournament_id, v_user_id, NOW());
  
  -- Send entry_fee to creator
  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_tournament.entry_fee 
  WHERE user_id = v_tournament.created_by;
  
  -- Log transactions
  INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
  VALUES (v_user_id, v_tournament.created_by, v_tournament.entry_fee, 'tournament_entry', 
          'Taxa de inscrição - Torneio Semanal: ' || v_tournament.name);
  
  -- Update total collected
  UPDATE tournaments SET total_collected = total_collected + v_tournament.entry_fee
  WHERE id = p_tournament_id;
  
  RETURN json_build_object('success', TRUE, 'message', 'Inscrição realizada com sucesso!');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. CRIAR FUNÇÃO: distribute_weekly_tournament_prize
-- ============================================
CREATE OR REPLACE FUNCTION distribute_weekly_tournament_prize(
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
  
  IF v_tournament.is_weekly = FALSE THEN
    RETURN json_build_object('success', FALSE, 'message', 'Este não é um Torneio Semanal');
  END IF;
  
  -- Distribute prize to winner
  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_tournament.prize_pool 
  WHERE user_id = p_winner_id;
  
  -- Log transaction
  INSERT INTO duelcoins_transactions (receiver_id, amount, transaction_type, description)
  VALUES (p_winner_id, v_tournament.prize_pool, 'tournament_win', 
          'Prêmio de Torneio Semanal: ' || v_tournament.name);
  
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
-- 6. CRIAR FUNÇÃO: process_expired_weekly_tournaments
-- ============================================
CREATE OR REPLACE FUNCTION process_expired_weekly_tournaments()
RETURNS JSON AS $$
DECLARE
  v_expired_tournaments RECORD;
  v_processed_count INTEGER := 0;
BEGIN
  FOR v_expired_tournaments IN 
    SELECT id, name, prize_pool, prize_paid, winner_id, created_by
    FROM tournaments
    WHERE is_weekly = TRUE
      AND status = 'upcoming'
      AND end_date < NOW()
  LOOP
    -- Se nenhum vencedor foi definido, cancelar e devolver prize_pool
    IF v_expired_tournaments.winner_id IS NULL THEN
      -- Devolver prize_pool para o criador
      UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_expired_tournaments.prize_pool
      WHERE user_id = v_expired_tournaments.created_by;
      
      -- Log
      INSERT INTO duelcoins_transactions (receiver_id, amount, transaction_type, description)
      VALUES (v_expired_tournaments.created_by, v_expired_tournaments.prize_pool, 
              'tournament_refund', 'Reembolso de Torneio Semanal expirado: ' || v_expired_tournaments.name);
    END IF;
    
    -- Marcar como expirado
    UPDATE tournaments SET status = 'expired' WHERE id = v_expired_tournaments.id;
    v_processed_count := v_processed_count + 1;
  END LOOP;
  
  RETURN json_build_object(
    'success', TRUE,
    'processed_count', v_processed_count,
    'message', 'Torneios expirados processados'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. CRIAR FUNÇÃO: get_weekly_tournaments
-- ============================================
CREATE OR REPLACE FUNCTION get_weekly_tournaments()
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
    WHERE t.is_weekly = TRUE
    ORDER BY t.created_at DESC
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 8. CRIAR FUNÇÃO: is_user_joined_in_tournament
-- ============================================
CREATE OR REPLACE FUNCTION is_user_joined_in_tournament(p_tournament_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  RETURN EXISTS (
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = p_tournament_id AND user_id = v_user_id
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. RLS POLICIES ADICIONAIS
-- ============================================

-- Policy para permitir que usuários vejam torneios semanais
CREATE POLICY "Usuários podem ver torneios semanais" 
  ON tournaments FOR SELECT
  USING (is_weekly = TRUE);

-- ============================================
-- FIM DO SCRIPT
-- ============================================

-- Verificar se tudo foi criado corretamente
SELECT 
  routine_name, 
  routine_type 
FROM information_schema.routines 
WHERE routine_name IN (
  'create_weekly_tournament',
  'join_weekly_tournament',
  'distribute_weekly_tournament_prize',
  'process_expired_weekly_tournaments',
  'get_weekly_tournaments',
  'is_user_joined_in_tournament'
)
ORDER BY routine_name;
