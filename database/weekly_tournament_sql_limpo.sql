-- ============================================
-- SISTEMA DE TORNEIO SEMANAL AUTOMATICO
-- Execute este script no Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. ADICIONAR COLUNAS À TABELA tournaments
-- ============================================
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS is_weekly BOOLEAN DEFAULT FALSE;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS total_collected DECIMAL DEFAULT 0;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_paid BOOLEAN DEFAULT FALSE;

-- ============================================
-- 2. CRIAR INDICES PARA PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tournaments_is_weekly ON tournaments(is_weekly);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);

-- ============================================
-- 3. CRIAR FUNCAO: create_weekly_tournament
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
  SELECT auth.uid() INTO v_user_id;
  SELECT duelcoins_balance INTO v_user_balance FROM profiles WHERE user_id = v_user_id;
  
  IF v_user_balance < p_prize_pool THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Saldo insuficiente. Voce precisa de ' || p_prize_pool || ' DuelCoins.'
    );
  END IF;
  
  v_start_date := NOW();
  v_end_date := NOW() + INTERVAL '7 days';
  
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool 
  WHERE user_id = v_user_id;
  
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento antecipado de premio - Torneio Semanal: ' || p_name);
  
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
-- 4. CRIAR FUNCAO: join_weekly_tournament
-- ============================================
CREATE OR REPLACE FUNCTION join_weekly_tournament(p_tournament_id UUID)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
  v_user_id UUID;
  v_current_participants INTEGER;
  v_user_balance DECIMAL;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF v_tournament.id IS NULL OR v_tournament.is_weekly = FALSE THEN
    RETURN json_build_object('success', FALSE, 'message', 'Torneio nao encontrado');
  END IF;
  
  IF v_tournament.status != 'upcoming' THEN
    RETURN json_build_object('success', FALSE, 'message', 'Inscricoes encerradas');
  END IF;
  
  SELECT COUNT(*) INTO v_current_participants 
  FROM tournament_participants WHERE tournament_id = p_tournament_id;
  
  IF v_current_participants >=_participants THEN v_tournament.max
    RETURN json_build_object('success', FALSE, 'message', 'Torneio lotado');
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = p_tournament_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('success', FALSE, 'message', 'Voce ja esta inscrito');
  END IF;
  
  SELECT duelcoins_balance INTO v_user_balance FROM profiles WHERE user_id = v_user_id;
  IF v_user_balance < v_tournament.entry_fee THEN
    RETURN json_build_object('success', FALSE, 'message', 'Saldo insuficiente para taxa de inscricao');
  END IF;
  
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_tournament.entry_fee 
  WHERE user_id = v_user_id;
  
  INSERT INTO tournament_participants (tournament_id, user_id, joined_at)
  VALUES (p_tournament_id, v_user_id, NOW());
  
  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_tournament.entry_fee 
  WHERE user_id = v_tournament.created_by;
  
  INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
  VALUES (v_user_id, v_tournament.created_by, v_tournament.entry_fee, 'tournament_entry', 
          'Taxa de inscricao - Torneio Semanal: ' || v_tournament.name);
  
  UPDATE tournaments SET total_collected = total_collected + v_tournament.entry_fee
  WHERE id = p_tournament_id;
  
  RETURN json_build_object('success', TRUE, 'message', 'Inscricao realizada com sucesso!');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. CRIAR FUNCAO: distribute_weekly_tournament_prize
-- ============================================
CREATE OR REPLACE FUNCTION distribute_weekly_tournament_prize(
  p_tournament_id UUID,
  p_winner_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF v_tournament.id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Torneio nao encontrado');
  END IF;
  
  IF v_tournament.prize_paid THEN
    RETURN json_build_object('success', FALSE, 'message', 'Premio ja foi pago');
  END IF;
  
  IF v_tournament.is_weekly = FALSE THEN
    RETURN json_build_object('success', FALSE, 'message', 'Este nao e um Torneio Semanal');
  END IF;
  
  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_tournament.prize_pool 
  WHERE user_id = p_winner_id;
  
  INSERT INTO duelcoins_transactions (receiver_id, amount, transaction_type, description)
  VALUES (p_winner_id, v_tournament.prize_pool, 'tournament_win', 
          'Premio de Torneio Semanal: ' || v_tournament.name);
  
  UPDATE tournaments SET prize_paid = TRUE WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', TRUE,
    'message', 'Premio distribuido com sucesso para o vencedor!'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. CRIAR FUNCAO: get_weekly_tournaments
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
-- 7. RLS POLICIES
-- ============================================
CREATE POLICY "Usuarios podem ver torneios semanais" 
  ON tournaments FOR SELECT
  USING (is_weekly = TRUE);

-- ============================================
-- FIM DO SCRIPT
-- ============================================
