-- ============================================
-- Make Tournament Functions Public
-- Run this in Supabase SQL Editor
-- ============================================

-- Set search path to include public schema
SET search_path TO public, pg_catalog;

-- ============================================
-- 1. create_normal_tournament
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
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
  v_user_balance DECIMAL;
  v_tournament_id UUID;
  v_total_rounds INTEGER;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT duelcoins_balance INTO v_user_balance FROM profiles WHERE user_id = v_user_id;
  
  IF v_user_balance < p_prize_pool THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Saldo insuficiente. Voce precisa de ' || p_prize_pool || ' DuelCoins.'
    );
  END IF;
  
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool 
  WHERE user_id = v_user_id;
  
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento antecipado de premio - Torneio Normal: ' || p_name);
  
  v_total_rounds := CEIL(LOG(2, p_max_participants::FLOAT))::INTEGER;
  
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
$$;

GRANT EXECUTE ON FUNCTION create_normal_tournament(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, DECIMAL, DECIMAL, INTEGER, TEXT) TO authenticated, anon;

-- ============================================
-- 2. join_normal_tournament
-- ============================================
CREATE OR REPLACE FUNCTION join_normal_tournament(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament RECORD;
  v_user_id UUID;
  v_current_participants INTEGER;
  v_user_balance DECIMAL;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id;
  
  IF v_tournament.id IS NULL THEN
    RETURN json_build_object('success', FALSE, 'message', 'Torneio nao encontrado');
  END IF;
  
  IF v_tournament.is_weekly = TRUE THEN
    RETURN json_build_object('success', FALSE, 'message', 'Use a funcao de inscricao de Torneio Semanal');
  END IF;
  
  IF v_tournament.status != 'upcoming' THEN
    RETURN json_build_object('success', FALSE, 'message', 'Inscricoes encerradas');
  END IF;
  
  IF v_tournament.created_by = v_user_id THEN
    RETURN json_build_object('success', FALSE, 'message', 'Voce nao pode se inscrer no seu proprio torneio');
  END IF;
  
  SELECT COUNT(*) INTO v_current_participants 
  FROM tournament_participants WHERE tournament_id = p_tournament_id;
  
  IF v_current_participants >= v_tournament.max_participants THEN
    RETURN json_build_object('success', FALSE, 'message', 'Torneio lotado');
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = p_tournament_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('success', FALSE, 'message', 'Voce ja esta inscrito neste torneio');
  END IF;
  
  IF v_tournament.entry_fee > 0 THEN
    SELECT duelcoins_balance INTO v_user_balance FROM profiles WHERE user_id = v_user_id;
    IF v_user_balance < v_tournament.entry_fee THEN
      RETURN json_build_object('success', FALSE, 'message', 'Saldo insuficiente para taxa de inscricao');
    END IF;
    
    UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_tournament.entry_fee 
    WHERE user_id = v_user_id;
    
    UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_tournament.entry_fee 
    WHERE user_id = v_tournament.created_by;
    
    INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (v_user_id, v_tournament.created_by, v_tournament.entry_fee, 'tournament_entry', 
            'Taxa de inscricao - Torneio Normal: ' || v_tournament.name);
    
    UPDATE tournaments SET total_collected = total_collected + v_tournament.entry_fee
    WHERE id = p_tournament_id;
  END IF;
  
  INSERT INTO tournament_participants (tournament_id, user_id, joined_at)
  VALUES (p_tournament_id, v_user_id, NOW());
  
  RETURN json_build_object('success', TRUE, 'message', 'Inscricao realizada com sucesso!');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', FALSE, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION join_normal_tournament(UUID) TO authenticated, anon;

-- ============================================
-- 3. get_normal_tournaments
-- ============================================
CREATE OR REPLACE FUNCTION get_normal_tournaments()
RETURNS JSON LANGUAGE plpgsql AS $$
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
$$;

GRANT EXECUTE ON FUNCTION get_normal_tournaments() TO authenticated, anon;

-- ============================================
-- 4. get_my_tournaments
-- ============================================
CREATE OR REPLACE FUNCTION get_my_tournaments()
RETURNS JSON LANGUAGE plpgsql AS $$
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
$$;

GRANT EXECUTE ON FUNCTION get_my_tournaments() TO authenticated, anon;

-- ============================================
-- 5. get_my_created_tournaments
-- ============================================
CREATE OR REPLACE FUNCTION get_my_created_tournaments()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', t.id,
        'name', t.name,
        'description', t.description,
        'status', t.status,
        'is_weekly', t.is_weekly,
        'start_date', t.start_date,
        'end_date', t.end_date,
        'prize_pool', t.prize_pool,
        'entry_fee', t.entry_fee,
        'current_round', t.current_round,
        'created_at', t.created_at,
        'participant_count', (
          SELECT COUNT(*) FROM tournament_participants tp 
          WHERE tp.tournament_id = t.id
        )
      )
    )
    FROM tournaments t
    WHERE t.created_by = v_user_id
    ORDER BY t.created_at DESC
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_created_tournaments() TO authenticated, anon;

-- ============================================
-- 6. create_weekly_tournament
-- ============================================
CREATE OR REPLACE FUNCTION create_weekly_tournament(
  p_name TEXT,
  p_description TEXT,
  p_prize_pool DECIMAL,
  p_entry_fee DECIMAL,
  p_max_participants INTEGER DEFAULT 32
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

GRANT EXECUTE ON FUNCTION create_weekly_tournament(TEXT, TEXT, DECIMAL, DECIMAL, INTEGER) TO authenticated, anon;

-- ============================================
-- 7. get_tournament_participants
-- ============================================
CREATE OR REPLACE FUNCTION get_tournament_participants(p_tournament_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(
      json_build_object(
        'user_id', tp.user_id,
        'username', p.username,
        'avatar_url', p.avatar_url,
        'joined_at', tp.joined_at,
        'wins', COALESCE(tm.wins, 0),
        'losses', COALESCE(tm.losses, 0)
      )
    )
    FROM tournament_participants tp
    LEFT JOIN profiles p ON p.user_id = tp.user_id
    LEFT JOIN tournament_matches tm ON (
      tm.tournament_id = p_tournament_id AND 
      (tm.player1_id = tp.user_id OR tm.player2_id = tp.user_id)
    )
    WHERE tp.tournament_id = p_tournament_id
    GROUP BY tp.user_id, p.username, p.avatar_url, tp.joined_at, tm.wins, tm.losses
    ORDER BY tp.joined_at ASC
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_tournament_participants(UUID) TO authenticated, anon;

-- ============================================
-- Verify functions are public
-- ============================================
SELECT 
  routine_name, 
  routine_schema
FROM information_schema.routines 
WHERE routine_name IN (
  'create_normal_tournament',
  'join_normal_tournament',
  'get_normal_tournaments',
  'get_my_tournaments',
  'get_my_created_tournaments',
  'create_weekly_tournament',
  'get_tournament_participants'
)
AND routine_schema = 'public'
ORDER BY routine_name;
