
-- Update create_normal_tournament to accept requires_decklist parameter
CREATE OR REPLACE FUNCTION public.create_normal_tournament(
  p_name text,
  p_description text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_prize_pool decimal,
  p_entry_fee decimal,
  p_max_participants integer,
  p_tournament_type text DEFAULT 'single_elimination',
  p_requires_decklist boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_balance decimal;
  v_tournament_id uuid;
  v_swiss_rounds integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Check balance
  SELECT COALESCE(duelcoins_balance, 0) INTO v_balance
  FROM profiles WHERE user_id = v_user_id;

  IF v_balance IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  IF p_prize_pool > 0 AND v_balance < p_prize_pool THEN
    RETURN json_build_object('success', false, 'message',
      'Saldo insuficiente. Você precisa de ' || p_prize_pool || ' DuelCoins para o prêmio.');
  END IF;

  -- Calculate swiss rounds if needed
  IF p_tournament_type = 'swiss' THEN
    IF p_max_participants >= 65 THEN v_swiss_rounds := 7;
    ELSIF p_max_participants >= 33 THEN v_swiss_rounds := 6;
    ELSIF p_max_participants >= 17 THEN v_swiss_rounds := 5;
    ELSIF p_max_participants >= 9 THEN v_swiss_rounds := 4;
    ELSE v_swiss_rounds := 3;
    END IF;
  END IF;

  -- Deduct balance
  IF p_prize_pool > 0 THEN
    UPDATE profiles
    SET duelcoins_balance = duelcoins_balance - p_prize_pool
    WHERE user_id = v_user_id;

    INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
    VALUES (v_user_id, p_prize_pool, 'tournament_prize_deposit',
      'Depósito de prêmio para torneio: ' || p_name);
  END IF;

  -- Create tournament
  INSERT INTO tournaments (
    name, description, start_date, end_date, prize_pool, entry_fee,
    max_participants, status, created_by, tournament_type, total_rounds,
    tcg_type, requires_decklist
  ) VALUES (
    p_name, p_description, p_start_date, p_end_date, p_prize_pool, p_entry_fee,
    p_max_participants, 'upcoming', v_user_id, p_tournament_type,
    CASE WHEN p_tournament_type = 'swiss' THEN v_swiss_rounds ELSE NULL END,
    'yugioh', p_requires_decklist
  ) RETURNING id INTO v_tournament_id;

  RETURN json_build_object(
    'success', true,
    'tournament_id', v_tournament_id,
    'message', 'Torneio criado com sucesso!'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_normal_tournament(text, text, timestamptz, timestamptz, decimal, decimal, integer, text, boolean) TO authenticated, anon;
