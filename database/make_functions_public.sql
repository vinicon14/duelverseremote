-- ============================================
-- Make Tournament Functions Public
-- Run this in Supabase SQL Editor
-- ============================================

-- Set search path to include public schema
SET search_path TO public, pg_catalog;

-- ============================================
-- 1. get_my_created_tournaments
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
-- 2. create_weekly_tournament
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
-- 3. get_tournament_participants
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
  'get_my_created_tournaments',
  'create_weekly_tournament',
  'get_tournament_participants'
)
AND routine_schema = 'public';
