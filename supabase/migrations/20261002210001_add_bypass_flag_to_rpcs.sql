-- ============================================================================
-- Adicionar bypass flag nas RPCs SECURITY DEFINER que modificam profiles
-- ============================================================================
--
-- Todas as funções SECURITY DEFINER que fazem UPDATE em campos protegidos de
-- profiles precisam setar SET LOCAL app.bypass_profile_guard = 'true' antes
-- do UPDATE, para que os triggers INVOKER permitam a modificação.
--
-- ============================================================================

-- 1. create_weekly_tournament
CREATE OR REPLACE FUNCTION public.create_weekly_tournament(
  p_name text,
  p_description text,
  p_prize_pool integer,
  p_entry_fee integer,
  p_max_participants integer DEFAULT 32
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_balance integer;
  v_tournament_id uuid;
  v_start_date timestamptz;
  v_end_date timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_prize_pool THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
  END IF;

  v_start_date := now();
  v_end_date := now() + interval '7 days';

  -- Setar bypass flag para permitir UPDATE em campo protegido
  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool WHERE user_id = v_user_id;

  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento de prêmio - Torneio Semanal: ' || p_name);

  INSERT INTO tournaments (name, description, start_date, end_date, prize_pool, entry_fee, max_participants, tournament_type, total_rounds, created_by, status, is_weekly)
  VALUES (p_name, p_description, v_start_date, v_end_date, p_prize_pool, p_entry_fee, p_max_participants, 'single_elimination', 5, v_user_id, 'upcoming', true)
  RETURNING id INTO v_tournament_id;

  RETURN json_build_object('success', true, 'message', 'Torneio semanal criado', 'tournament_id', v_tournament_id);
END;
$$;

-- 2. create_normal_tournament
CREATE OR REPLACE FUNCTION public.create_normal_tournament(
  p_name text,
  p_description text,
  p_start_date text,
  p_end_date text,
  p_prize_pool integer,
  p_entry_fee integer,
  p_max_participants integer,
  p_tournament_type text DEFAULT 'single_elimination'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_balance integer;
  v_tournament_id uuid;
  v_total_rounds integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_prize_pool THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente para criar o torneio');
  END IF;

  IF p_tournament_type = 'swiss' THEN
    IF p_max_participants >= 65 THEN v_total_rounds := 7;
    ELSIF p_max_participants >= 33 THEN v_total_rounds := 6;
    ELSIF p_max_participants >= 17 THEN v_total_rounds := 5;
    ELSIF p_max_participants >= 9 THEN v_total_rounds := 4;
    ELSE v_total_rounds := 3;
    END IF;
  ELSE
    v_total_rounds := NULL;
  END IF;

  -- Setar bypass flag
  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool WHERE user_id = v_user_id;

  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento de prêmio - Torneio: ' || p_name);

  INSERT INTO tournaments (name, description, start_date, end_date, prize_pool, entry_fee, max_participants, tournament_type, total_rounds, created_by, status, is_weekly)
  VALUES (p_name, p_description, p_start_date::timestamptz, p_end_date::timestamptz, p_prize_pool, p_entry_fee, p_max_participants, p_tournament_type, v_total_rounds, v_user_id, 'upcoming', false)
  RETURNING id INTO v_tournament_id;

  RETURN json_build_object('success', true, 'message', 'Torneio criado com sucesso', 'tournament_id', v_tournament_id);
END;
$$;

-- 3. join_weekly_tournament
CREATE OR REPLACE FUNCTION public.join_weekly_tournament(
  p_tournament_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_entry_fee integer;
  v_balance integer;
  v_max_participants integer;
  v_current_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT entry_fee, max_participants INTO v_entry_fee, v_max_participants
  FROM tournaments WHERE id = p_tournament_id AND is_weekly = true;

  IF v_entry_fee IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;

  IF EXISTS (SELECT 1 FROM tournament_participants WHERE tournament_id = p_tournament_id AND user_id = v_user_id) THEN
    RETURN json_build_object('success', false, 'message', 'Você já está inscrito');
  END IF;

  SELECT COUNT(*) INTO v_current_count FROM tournament_participants WHERE tournament_id = p_tournament_id;
  IF v_current_count >= v_max_participants THEN
    RETURN json_build_object('success', false, 'message', 'Torneio lotado');
  END IF;

  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance < v_entry_fee THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
  END IF;

  IF v_entry_fee > 0 THEN
    -- Setar bypass flag
    PERFORM set_config('app.bypass_profile_guard', 'true', true);
    
    UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_entry_fee WHERE user_id = v_user_id;
    
    INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
    VALUES (v_user_id, v_entry_fee, 'tournament_entry', 'Inscrição em torneio semanal');

    UPDATE tournaments SET total_collected = COALESCE(total_collected, 0) + v_entry_fee WHERE id = p_tournament_id;
  END IF;

  INSERT INTO tournament_participants (tournament_id, user_id, status)
  VALUES (p_tournament_id, v_user_id, 'registered');

  RETURN json_build_object('success', true, 'message', 'Inscrito com sucesso!');
END;
$$;

-- Nota: Outras funções como purchase_marketplace_items, bp_claim_reward, change_nickname,
-- service_credit_duelcoins etc. também precisarão ser atualizadas seguindo o mesmo padrão:
-- Adicionar PERFORM set_config('app.bypass_profile_guard', 'true', true); antes dos UPDATEs
-- em campos protegidos de profiles.
--
-- Como essas funções são extensas e podem ter sido modificadas, a atualização manual
-- é recomendada para evitar sobrescrever customizações. O padrão é sempre o mesmo:
-- antes de qualquer UPDATE profiles SET <campo_protegido>, adicionar o PERFORM set_config.
