-- ============================================
-- Check your DuelCoins balance
-- Run this in Supabase SQL Editor
-- ============================================

-- Get current user ID
SELECT auth.uid() as user_id;

-- Check your balance
SELECT 
  user_id,
  username,
  duelcoins_balance,
  email
FROM profiles
WHERE user_id = auth.uid();

-- ============================================
-- Improved create_normal_tournament with better error messages
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
  -- Get current user
  SELECT auth.uid() INTO v_user_id;
  
  -- Debug: Check if user exists and get balance
  SELECT duelcoins_balance INTO v_user_balance 
  FROM profiles 
  WHERE user_id = v_user_id;
  
  -- Check if profile exists
  IF v_user_balance IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Perfil nao encontrado. Verifique se sua conta esta completa.'
    );
  END IF;
  
  -- Check balance
  RAISE NOTICE 'User: %, Balance: %, Prize Pool: %', v_user_id, v_user_balance, p_prize_pool;
  
  IF p_prize_pool > 0 AND v_user_balance < p_prize_pool THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Saldo insuficiente. Voce tem ' || v_user_balance || ' DuelCoins, mas precisa de ' || p_prize_pool || ' DuelCoins para o premio.'
    );
  END IF;
  
  -- Deduct prize pool from balance
  IF p_prize_pool > 0 THEN
    UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool 
    WHERE user_id = v_user_id;
    
    INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
    VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento antecipado de premio - Torneio Normal: ' || p_name);
  END IF;
  
  -- Calculate rounds
  IF p_tournament_type = 'swiss' THEN
    v_total_rounds := CASE 
      WHEN p_max_participants >= 65 THEN 7
      WHEN p_max_participants >= 33 THEN 6
      WHEN p_max_participants >= 17 THEN 5
      WHEN p_max_participants >= 9 THEN 4
      ELSE 3
    END;
  ELSE
    v_total_rounds := CEIL(LOG(2, p_max_participants::FLOAT))::INTEGER;
  END IF;
  
  -- Insert tournament
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

-- Verify function updated
SELECT routine_name FROM information_schema.routines WHERE routine_name = 'create_normal_tournament' AND routine_schema = 'public';
