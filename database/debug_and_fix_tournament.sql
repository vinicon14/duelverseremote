-- ============================================
-- DEBUG: Test if your profile exists and is readable
-- Run this in Supabase SQL Editor
-- ============================================

-- Test 1: Check if you can read your own profile
SELECT 
  'Test 1: Profile read' as test_name,
  CASE 
    WHEN EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid()) 
    THEN 'SUCCESS - Profile exists'
    ELSE 'FAILED - Profile not found'
  END as result;

-- Test 2: Get your actual balance
SELECT 
  'Test 2: Your balance' as test_name,
  duelcoins_balance as your_balance
FROM profiles
WHERE user_id = auth.uid();

-- Test 3: Check if auth.uid() returns a value
SELECT 
  'Test 3: Auth UID' as test_name,
  auth.uid() as user_id,
  CASE 
    WHEN auth.uid() IS NOT NULL 
    THEN 'SUCCESS - User is authenticated'
    ELSE 'FAILED - Not authenticated'
  END as result;

-- ============================================
-- FIXED: create_normal_tournament with NULL handling
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
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Usuario nao esta autenticado. Faca login novamente.'
    );
  END IF;
  
  -- Get user balance - handle NULL properly
  SELECT COALESCE(duelcoins_balance, 0) INTO v_user_balance 
  FROM profiles 
  WHERE user_id = v_user_id;
  
  -- Check if profile was found
  IF v_user_balance IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Perfil nao encontrado. Seu usuario pode ter sido removido ou nao existe na tabela profiles.'
    );
  END IF;
  
  -- Only check balance if prize_pool > 0
  IF p_prize_pool > 0 AND v_user_balance < p_prize_pool THEN
    RETURN json_build_object(
      'success', FALSE,
      'message', 'Saldo insuficiente. Voce tem ' || v_user_balance || ' DuelCoins, mas precisa de ' || p_prize_pool || ' DuelCoins.'
    );
  END IF;
  
  -- Deduct prize pool from balance (only if > 0)
  IF p_prize_pool > 0 THEN
    UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool 
    WHERE user_id = v_user_id;
    
    INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
    VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento antecipado de premio - Torneio Normal: ' || p_name);
  END IF;
  
  -- Calculate rounds based on tournament type
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

-- Verify function
SELECT routine_name FROM information_schema.routines WHERE routine_name = 'create_normal_tournament' AND routine_schema = 'public';
