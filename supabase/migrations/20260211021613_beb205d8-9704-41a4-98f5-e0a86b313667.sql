
-- Add is_weekly column to tournaments
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS is_weekly boolean DEFAULT false;

-- Add match_deadline column to tournament_matches
ALTER TABLE public.tournament_matches ADD COLUMN IF NOT EXISTS match_deadline timestamptz;

-- Add total_collected and prize_paid to tournaments
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS total_collected integer DEFAULT 0;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS prize_paid boolean DEFAULT false;

-- Create tournament_match_reports table
CREATE TABLE IF NOT EXISTS public.tournament_match_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.tournament_matches(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  result text NOT NULL CHECK (result IN ('win', 'loss', 'double_loss')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tournament_match_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reports for their tournaments" ON public.tournament_match_reports
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create reports" ON public.tournament_match_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Enable realtime for tournament_match_reports
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_match_reports;

-- Create create_normal_tournament RPC
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

  -- Check balance
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_prize_pool THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente para criar o torneio');
  END IF;

  -- Calculate rounds for swiss
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

  -- Deduct balance
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool WHERE user_id = v_user_id;

  -- Record transaction
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento de prêmio - Torneio: ' || p_name);

  -- Create tournament
  INSERT INTO tournaments (name, description, start_date, end_date, prize_pool, entry_fee, max_participants, tournament_type, total_rounds, created_by, status, is_weekly)
  VALUES (p_name, p_description, p_start_date::timestamptz, p_end_date::timestamptz, p_prize_pool, p_entry_fee, p_max_participants, p_tournament_type, v_total_rounds, v_user_id, 'upcoming', false)
  RETURNING id INTO v_tournament_id;

  RETURN json_build_object('success', true, 'message', 'Torneio criado com sucesso', 'tournament_id', v_tournament_id);
END;
$$;

-- Create create_weekly_tournament RPC
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

  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool WHERE user_id = v_user_id;

  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento de prêmio - Torneio Semanal: ' || p_name);

  INSERT INTO tournaments (name, description, start_date, end_date, prize_pool, entry_fee, max_participants, tournament_type, total_rounds, created_by, status, is_weekly)
  VALUES (p_name, p_description, v_start_date, v_end_date, p_prize_pool, p_entry_fee, p_max_participants, 'single_elimination', 5, v_user_id, 'upcoming', true)
  RETURNING id INTO v_tournament_id;

  RETURN json_build_object('success', true, 'message', 'Torneio semanal criado', 'tournament_id', v_tournament_id);
END;
$$;

-- Create get_weekly_tournaments RPC
CREATE OR REPLACE FUNCTION public.get_weekly_tournaments()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT 
        tor.id,
        tor.name,
        tor.description,
        tor.start_date,
        tor.end_date,
        tor.max_participants,
        tor.prize_pool,
        tor.entry_fee,
        tor.status,
        tor.is_weekly,
        COALESCE(tor.total_collected, 0) as total_collected,
        COALESCE(tor.prize_paid, false) as prize_paid,
        tor.created_by,
        tor.current_round,
        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = tor.id)::integer as participant_count
      FROM tournaments tor
      WHERE tor.is_weekly = true
      ORDER BY tor.created_at DESC
    ) t
  );
END;
$$;

-- Create set_match_winner RPC
CREATE OR REPLACE FUNCTION public.set_match_winner(
  p_match_id uuid,
  p_winner_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tournament_id uuid;
  v_created_by uuid;
BEGIN
  -- Get tournament info
  SELECT tm.tournament_id INTO v_tournament_id
  FROM tournament_matches tm WHERE tm.id = p_match_id;

  IF v_tournament_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Partida não encontrada');
  END IF;

  -- Verify caller is tournament creator or admin
  SELECT created_by INTO v_created_by FROM tournaments WHERE id = v_tournament_id;
  IF v_created_by != auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Sem permissão');
  END IF;

  -- Update match
  UPDATE tournament_matches SET winner_id = p_winner_id, status = 'completed' WHERE id = p_match_id;

  RETURN json_build_object('success', true, 'message', 'Vencedor definido');
END;
$$;

-- Create join_weekly_tournament RPC
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

  -- Get tournament info
  SELECT entry_fee, max_participants INTO v_entry_fee, v_max_participants
  FROM tournaments WHERE id = p_tournament_id AND is_weekly = true;

  IF v_entry_fee IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;

  -- Check if already joined
  IF EXISTS (SELECT 1 FROM tournament_participants WHERE tournament_id = p_tournament_id AND user_id = v_user_id) THEN
    RETURN json_build_object('success', false, 'message', 'Você já está inscrito');
  END IF;

  -- Check capacity
  SELECT COUNT(*) INTO v_current_count FROM tournament_participants WHERE tournament_id = p_tournament_id;
  IF v_current_count >= v_max_participants THEN
    RETURN json_build_object('success', false, 'message', 'Torneio lotado');
  END IF;

  -- Check balance
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance < v_entry_fee THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
  END IF;

  -- Deduct fee
  IF v_entry_fee > 0 THEN
    UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_entry_fee WHERE user_id = v_user_id;
    
    INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
    VALUES (v_user_id, v_entry_fee, 'tournament_entry', 'Inscrição em torneio semanal');

    -- Add to tournament collected
    UPDATE tournaments SET total_collected = COALESCE(total_collected, 0) + v_entry_fee WHERE id = p_tournament_id;
  END IF;

  -- Join tournament
  INSERT INTO tournament_participants (tournament_id, user_id, status)
  VALUES (p_tournament_id, v_user_id, 'registered');

  RETURN json_build_object('success', true, 'message', 'Inscrito com sucesso!');
END;
$$;
