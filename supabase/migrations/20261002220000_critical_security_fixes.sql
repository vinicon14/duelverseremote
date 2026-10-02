-- =====================================================
-- Correções críticas de segurança - Duelverse
-- Data: 2026-10-02 22:00:00
-- =====================================================
-- 
-- Este patch corrige vulnerabilidades críticas de autorização e validação
-- nas funções RPC SECURITY DEFINER relacionadas a torneios, assinaturas
-- e pontuação de partidas ranqueadas.
--
-- IMPORTANTE: Aplicar imediatamente em produção.
-- =====================================================

-- =====================================================
-- 1. CRÍTICO: distribute_tournament_prize
-- =====================================================
-- Problema: SECURITY DEFINER sem verificação de auth.uid(), executável por anon/authenticated
-- Correção: Exigir que auth.uid() seja o criador do torneio ou admin, verificar vencedor é participante, idempotência

CREATE OR REPLACE FUNCTION public.distribute_tournament_prize(
    p_tournament_id UUID,
    p_winner_id UUID
)
RETURNS JSON AS $$
DECLARE
    v_tournament RECORD;
    v_winner_profile RECORD;
    v_total_entry_fees INT;
    v_caller UUID;
    v_is_participant BOOLEAN;
BEGIN
    -- Verificação de autorização
    v_caller := auth.uid();
    IF v_caller IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Não autenticado');
    END IF;

    -- Buscar dados do torneio
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = p_tournament_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
    END IF;

    -- Verificar autorização: apenas criador do torneio ou admin
    IF v_tournament.created_by <> v_caller AND NOT public.is_admin(v_caller) THEN
        RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode distribuir prêmios');
    END IF;

    -- Idempotência: verificar se já foi pago
    IF EXISTS (
        SELECT 1 FROM public.duelcoins_transactions
        WHERE tournament_id = p_tournament_id
        AND transaction_type = 'tournament_prize'
    ) THEN
        RETURN json_build_object('success', false, 'message', 'Prêmio já foi distribuído');
    END IF;

    IF v_tournament.status = 'completed' THEN
        RETURN json_build_object('success', false, 'message', 'Torneio já foi finalizado');
    END IF;

    -- Verificar se o vencedor é participante do torneio
    SELECT EXISTS (
        SELECT 1 FROM public.tournament_participants
        WHERE tournament_id = p_tournament_id
        AND user_id = p_winner_id
    ) INTO v_is_participant;

    IF NOT v_is_participant THEN
        RETURN json_build_object('success', false, 'message', 'Vencedor não é participante do torneio');
    END IF;

    -- Buscar perfil do vencedor
    SELECT * INTO v_winner_profile
    FROM public.profiles
    WHERE user_id = p_winner_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Vencedor não encontrado');
    END IF;

    -- Calcular total de taxas de entrada
    SELECT COALESCE(SUM(amount), 0) INTO v_total_entry_fees
    FROM public.duelcoins_transactions
    WHERE tournament_id = p_tournament_id 
    AND transaction_type = 'tournament_entry';

    -- Transferir prêmio para o vencedor (total das taxas de entrada)
    IF v_total_entry_fees > 0 THEN
        UPDATE public.profiles
        SET duelcoins_balance = duelcoins_balance + v_total_entry_fees
        WHERE user_id = p_winner_id;

        -- Registrar transação do prêmio (sender_id NULL = sistema)
        INSERT INTO public.duelcoins_transactions (
            sender_id, 
            receiver_id, 
            amount, 
            transaction_type, 
            tournament_id,
            description
        ) VALUES (
            NULL, 
            p_winner_id, 
            v_total_entry_fees, 
            'tournament_prize', 
            p_tournament_id,
            format('Prêmio do torneio: %s', v_tournament.name)
        );
    END IF;

    -- Marcar participante como vencedor
    UPDATE public.tournament_participants
    SET status = 'winner'
    WHERE tournament_id = p_tournament_id 
    AND user_id = p_winner_id;

    -- Marcar torneio como completado
    UPDATE public.tournaments
    SET status = 'completed', 
        end_date = NOW()
    WHERE id = p_tournament_id;

    RETURN json_build_object(
        'success', true, 
        'message', format('Prêmio de %s DuelCoins distribuído para o vencedor!', v_total_entry_fees),
        'prize_amount', v_total_entry_fees
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revogar acesso de anon
REVOKE ALL ON FUNCTION public.distribute_tournament_prize(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.distribute_tournament_prize(UUID, UUID) TO authenticated;

-- =====================================================
-- 2. CRÍTICO: finalize_tournament_and_pay_winner
-- =====================================================
-- Problema: SECURITY DEFINER sem verificação de auth.uid(), executável por anon/authenticated
-- Correção: Exigir que auth.uid() seja o criador do torneio ou admin, verificar vencedor é participante, idempotência

CREATE OR REPLACE FUNCTION public.finalize_tournament_and_pay_winner(
  p_tournament_id UUID,
  p_winner_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_tournament RECORD;
  v_winner_profile RECORD;
  v_prize_amount INTEGER;
  v_caller UUID;
  v_is_participant BOOLEAN;
BEGIN
  -- Verificação de autorização
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Verificar se o torneio existe
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;

  -- Verificar autorização: apenas criador do torneio ou admin
  IF v_tournament.created_by <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode finalizar e pagar');
  END IF;
  
  -- Idempotência: verificar se já foi pago
  IF EXISTS (
    SELECT 1 FROM duelcoins_transactions 
    WHERE tournament_id = p_tournament_id 
    AND transaction_type = 'tournament_prize'
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Prêmio já foi pago');
  END IF;

  -- Verificar se o vencedor é participante do torneio
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_participants
    WHERE tournament_id = p_tournament_id
    AND user_id = p_winner_id
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não é participante do torneio');
  END IF;
  
  -- Calcular o prêmio (total arrecadado)
  SELECT COALESCE(SUM(amount), 0) INTO v_prize_amount
  FROM duelcoins_transactions
  WHERE tournament_id = p_tournament_id 
  AND transaction_type = 'tournament_entry';
  
  -- Se não tiver taxa de entrada, usar o prize_pool do torneio
  IF v_prize_amount = 0 THEN
    v_prize_amount := COALESCE(v_tournament.prize_pool, 0);
  END IF;
  
  -- Se não tiver prêmio, apenas finalizar
  IF v_prize_amount <= 0 THEN
    UPDATE tournaments SET status = 'completed', end_date = NOW()
    WHERE id = p_tournament_id;
    
    UPDATE tournament_participants SET status = 'winner'
    WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;
    
    RETURN json_build_object('success', true, 'message', 'Torneio finalizado sem prêmio');
  END IF;
  
  -- Buscar perfil do vencedor
  SELECT * INTO v_winner_profile
  FROM profiles
  WHERE user_id = p_winner_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não encontrado');
  END IF;
  
  -- Transferir prêmio (sender_id NULL = sistema)
  UPDATE profiles
  SET duelcoins_balance = duelcoins_balance + v_prize_amount
  WHERE user_id = p_winner_id;
  
  -- Registrar transação
  INSERT INTO duelcoins_transactions (
    sender_id,
    receiver_id,
    amount,
    transaction_type,
    tournament_id,
    description
  ) VALUES (
    NULL,
    p_winner_id,
    v_prize_amount,
    'tournament_prize',
    p_tournament_id,
    'Prêmio do torneio: ' || v_tournament.name
  );
  
  -- Marcar vencedor
  UPDATE tournament_participants
  SET status = 'winner'
  WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;
  
  -- Finalizar torneio
  UPDATE tournaments
  SET status = 'completed', end_date = NOW()
  WHERE id = p_tournament_id;
  
  RETURN json_build_object(
    'success', true, 
    'message', 'Prêmio de ' || v_prize_amount || ' DuelCoins pago ao vencedor!',
    'prize_amount', v_prize_amount
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revogar acesso de anon
REVOKE ALL ON FUNCTION public.finalize_tournament_and_pay_winner(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.finalize_tournament_and_pay_winner(UUID, UUID) TO authenticated;

-- =====================================================
-- 3. CRÍTICO: activate_subscription
-- =====================================================
-- Problema: Não verifica se p_user_id == auth.uid(), permitindo gastar DuelCoins de outra pessoa
-- Correção: Exigir p_user_id == auth.uid() ou admin/service_role

CREATE OR REPLACE FUNCTION public.activate_subscription(p_user_id uuid, p_plan_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan RECORD;
  v_balance INTEGER;
  v_subscription_id UUID;
  v_expires_at TIMESTAMPTZ;
  v_caller UUID;
BEGIN
  -- Verificação de autorização
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Apenas o próprio usuário ou admin pode ativar assinatura
  IF p_user_id <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Você só pode ativar assinatura para si mesmo');
  END IF;

  -- Get plan details
  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Plano não encontrado ou inativo');
  END IF;

  -- Check user balance
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = p_user_id;
  IF v_balance IS NULL OR v_balance < v_plan.price_duelcoins THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente de DuelCoins');
  END IF;

  -- Deduct DuelCoins
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_plan.price_duelcoins WHERE user_id = p_user_id;

  -- Record transaction
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (p_user_id, v_plan.price_duelcoins, 'subscription', 'Compra de plano: ' || v_plan.name);

  -- Calculate expiration
  v_expires_at := now() + (v_plan.duration_days || ' days')::interval;

  -- Deactivate existing subscriptions
  UPDATE user_subscriptions SET is_active = false WHERE user_id = p_user_id AND is_active = true;

  -- Create new subscription
  INSERT INTO user_subscriptions (user_id, plan_id, is_active, starts_at, expires_at)
  VALUES (p_user_id, p_plan_id, true, now(), v_expires_at)
  RETURNING id INTO v_subscription_id;

  -- Set account type to pro
  UPDATE profiles SET account_type = 'pro' WHERE user_id = p_user_id;

  RETURN json_build_object('success', true, 'message', 'Assinatura ativada', 'subscription_id', v_subscription_id, 'expires_at', v_expires_at);
END;
$function$;

-- Revogar acesso de anon
REVOKE ALL ON FUNCTION public.activate_subscription(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, uuid) TO authenticated;

-- =====================================================
-- 4. ALTO: record_match_result
-- =====================================================
-- Problema: p_bet_amount vem do cliente e pode ser arbitrário; se chamado direto, permite +1.000.000 pontos
-- Correção: Validar p_bet_amount contra o valor real do duelo (live_duels.bet_amount)

CREATE OR REPLACE FUNCTION public.record_match_result(
  p_duel_id uuid,
  p_player1_id uuid,
  p_player2_id uuid,
  p_winner_id uuid,
  p_player1_score integer,
  p_player2_score integer,
  p_bet_amount integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
  v_duel_status public.game_status;
  v_duel_creator uuid;
  v_duel_opponent uuid;
  v_is_ranked boolean;
  v_points_change integer := 0;
  v_loser_id uuid;
  v_tcg text;
  v_already_awarded boolean := false;
  v_actual_bet_amount integer;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Unauthorized: You must be a participant in this duel';
  END IF;

  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Invalid winner: Must be one of the players or NULL for draw';
  END IF;

  SELECT status, creator_id, opponent_id, is_ranked, bet_amount,
    CASE lower(coalesce(tcg_type, 'yugioh'))
      WHEN 'magic' THEN 'genesis'
      WHEN 'pokemon' THEN 'rush_duel'
      WHEN 'genesis' THEN 'genesis'
      WHEN 'rush_duel' THEN 'rush_duel'
      ELSE 'yugioh'
    END
  INTO v_duel_status, v_duel_creator, v_duel_opponent, v_is_ranked, v_actual_bet_amount, v_tcg
  FROM public.live_duels
  WHERE id = p_duel_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Duel not found'; END IF;
  IF v_duel_status NOT IN ('waiting', 'in_progress', 'finished') THEN
    RAISE EXCEPTION 'Duel must be in progress or finished to record results';
  END IF;
  IF NOT ((v_duel_creator = p_player1_id AND v_duel_opponent = p_player2_id)
       OR (v_duel_creator = p_player2_id AND v_duel_opponent = p_player1_id)) THEN
    RAISE EXCEPTION 'Player IDs do not match duel participants';
  END IF;

  -- CORREÇÃO CRÍTICA: Usar o valor real do duelo do banco, não o parâmetro do cliente
  -- Se chamado via trigger (auth.uid() é NULL), usar p_bet_amount (já vem do banco via trigger)
  -- Se chamado diretamente (auth.uid() não é NULL), usar v_actual_bet_amount do SELECT acima
  IF auth.uid() IS NOT NULL THEN
    p_bet_amount := COALESCE(v_actual_bet_amount, 0);
  END IF;

  SELECT id, ranked_points_awarded
  INTO v_match_id, v_already_awarded
  FROM public.match_history
  WHERE duel_id = p_duel_id
  FOR UPDATE;

  IF v_match_id IS NULL THEN
    INSERT INTO public.match_history (
      duel_id, player1_id, player2_id, winner_id,
      player1_score, player2_score, bet_amount, tcg_type
    ) VALUES (
      p_duel_id, p_player1_id, p_player2_id, p_winner_id,
      p_player1_score, p_player2_score, greatest(coalesce(p_bet_amount, 0), 0), v_tcg
    )
    ON CONFLICT (duel_id) WHERE duel_id IS NOT NULL DO NOTHING
    RETURNING id, ranked_points_awarded INTO v_match_id, v_already_awarded;

    IF v_match_id IS NULL THEN
      SELECT id, ranked_points_awarded INTO v_match_id, v_already_awarded
      FROM public.match_history WHERE duel_id = p_duel_id FOR UPDATE;
    END IF;
  ELSE
    UPDATE public.match_history
    SET winner_id = coalesce(p_winner_id, winner_id),
        player1_score = p_player1_score,
        player2_score = p_player2_score,
        bet_amount = greatest(coalesce(p_bet_amount, bet_amount, 0), 0),
        tcg_type = coalesce(tcg_type, v_tcg)
    WHERE id = v_match_id;
  END IF;

  IF p_winner_id IS NULL OR v_already_awarded THEN RETURN v_match_id; END IF;

  v_loser_id := CASE WHEN p_winner_id = p_player1_id THEN p_player2_id ELSE p_player1_id END;

  IF v_is_ranked THEN
    IF coalesce(p_bet_amount, 0) > 0 THEN
      v_points_change := p_bet_amount;
    ELSIF p_winner_id = p_player1_id THEN
      v_points_change := 10 + (greatest(coalesce(p_player1_score, 0), 0) / 100);
    ELSE
      v_points_change := 10 + (greatest(coalesce(p_player2_score, 0), 0) / 100);
    END IF;
  END IF;

  UPDATE public.profiles
  SET wins = coalesce(wins, 0) + 1,
      points = coalesce(points, 0) + v_points_change
  WHERE user_id = p_winner_id;

  UPDATE public.profiles
  SET losses = coalesce(losses, 0) + 1,
      points = greatest(coalesce(points, 0) - (v_points_change / 2), 0)
  WHERE user_id = v_loser_id;

  INSERT INTO public.tcg_profiles (user_id, tcg_type, username)
  SELECT p.user_id, v_tcg, p.username
  FROM public.profiles p
  WHERE p.user_id IN (p_winner_id, v_loser_id)
  ON CONFLICT (user_id, tcg_type) DO NOTHING;

  UPDATE public.tcg_profiles
  SET wins = coalesce(wins, 0) + 1,
      points = coalesce(points, 0) + v_points_change,
      updated_at = now()
  WHERE user_id = p_winner_id AND tcg_type = v_tcg;

  UPDATE public.tcg_profiles
  SET losses = coalesce(losses, 0) + 1,
      points = greatest(coalesce(points, 0) - (v_points_change / 2), 0),
      updated_at = now()
  WHERE user_id = v_loser_id AND tcg_type = v_tcg;

  UPDATE public.match_history
  SET winner_id = p_winner_id,
      ranked_points_awarded = true,
      ranked_points_change = v_points_change,
      tcg_type = v_tcg
  WHERE id = v_match_id;

  RETURN v_match_id;
END;
$$;

-- Manter as permissões existentes (authenticated pode chamar, trigger também funciona)

-- =====================================================
-- 5. ALTO: user_subscriptions policies
-- =====================================================
-- Problema: Policy user_subscriptions_insert_own permite usuário inserir assinatura ativa até 2099
-- Correção: Remover policies de INSERT/UPDATE; apenas RPC e service_role podem inserir/atualizar

DROP POLICY IF EXISTS "user_subscriptions_insert_own" ON user_subscriptions;
DROP POLICY IF EXISTS "user_subscriptions_update_own" ON user_subscriptions;

-- Manter apenas SELECT own e admin all
-- Recriar a policy de SELECT se necessário (pode já existir)
DROP POLICY IF EXISTS "user_subscriptions_select_own" ON user_subscriptions;
CREATE POLICY "user_subscriptions_select_own" ON user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- Admin pode fazer tudo (já existe, mas recriar por segurança)
DROP POLICY IF EXISTS "user_subscriptions_all" ON user_subscriptions;
CREATE POLICY "user_subscriptions_all" ON user_subscriptions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  ));

-- =====================================================
-- 6. MÉDIO: tournament_pay_winner e tournament_refund_participant
-- =====================================================
-- Problema: Sem limite de valor nem idempotência; sender_id = tournament_id viola FK
-- Correção: Limitar prêmio ao pool real, limitar reembolso à taxa paga, idempotência, sender_id NULL

CREATE OR REPLACE FUNCTION public.tournament_pay_winner(
  p_tournament_id uuid,
  p_winner_id uuid,
  p_amount integer
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_creator uuid;
  v_tournament_name text;
  v_total_pool integer;
  v_capped_amount integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Valor inválido');
  END IF;

  SELECT created_by, name INTO v_creator, v_tournament_name FROM tournaments WHERE id = p_tournament_id;
  IF v_creator IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  IF v_creator <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode pagar o prêmio');
  END IF;

  -- Idempotência: verificar se já pagou esse vencedor neste torneio
  IF EXISTS (
    SELECT 1 FROM duelcoins_transactions
    WHERE tournament_id = p_tournament_id
      AND transaction_type = 'tournament_prize'
      AND receiver_id = p_winner_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Prêmio já foi pago a este vencedor');
  END IF;

  -- Calcular o pool total arrecadado (taxas de entrada)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_pool
  FROM duelcoins_transactions
  WHERE tournament_id = p_tournament_id
    AND transaction_type = 'tournament_entry';

  -- Limitar o prêmio ao pool real (ou usar prize_pool se não houver taxas)
  IF v_total_pool = 0 THEN
    SELECT COALESCE(prize_pool, 0) INTO v_total_pool FROM tournaments WHERE id = p_tournament_id;
  END IF;

  v_capped_amount := LEAST(p_amount, v_total_pool);
  IF v_capped_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Pool insuficiente para prêmio');
  END IF;

  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_capped_amount
   WHERE user_id = p_winner_id;

  -- Correção: sender_id NULL (sistema), não tournament_id
  INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description)
  VALUES (NULL, p_winner_id, v_capped_amount, 'tournament_prize', p_tournament_id, 'Prêmio do torneio: ' || v_tournament_name);

  RETURN json_build_object('success', true, 'amount_paid', v_capped_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.tournament_refund_participant(
  p_tournament_id uuid,
  p_participant_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_creator uuid;
  v_fee integer;
  v_tournament_name text;
  v_amount_paid integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT created_by, entry_fee, name INTO v_creator, v_fee, v_tournament_name
    FROM tournaments WHERE id = p_tournament_id;
  IF v_creator IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  IF v_creator <> v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode reembolsar participantes');
  END IF;

  IF COALESCE(v_fee, 0) <= 0 THEN
    RETURN json_build_object('success', true, 'refunded', 0);
  END IF;

  -- Idempotência: verificar se já reembolsou
  IF EXISTS (
    SELECT 1 FROM duelcoins_transactions
    WHERE tournament_id = p_tournament_id
      AND transaction_type = 'tournament_refund'
      AND receiver_id = p_participant_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Participante já foi reembolsado');
  END IF;

  -- Verificar quanto o participante realmente pagou (pode ter pago menos se houve desconto)
  SELECT COALESCE(SUM(amount), 0) INTO v_amount_paid
  FROM duelcoins_transactions
  WHERE tournament_id = p_tournament_id
    AND transaction_type = 'tournament_entry'
    AND sender_id = p_participant_id;

  -- Limitar o reembolso ao que foi efetivamente pago
  v_fee := LEAST(v_fee, v_amount_paid);
  IF v_fee <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Nada a reembolsar');
  END IF;

  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_fee
   WHERE user_id = p_participant_id;

  -- Correção: sender_id NULL (sistema), não tournament_id
  INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description)
  VALUES (NULL, p_participant_id, v_fee, 'tournament_refund', p_tournament_id, 'Reembolso de inscrição: ' || v_tournament_name);

  RETURN json_build_object('success', true, 'refunded', v_fee);
END;
$$;

-- As permissões já estão corretas (authenticated pode chamar, já tem verificação interna)

-- =====================================================
-- FIM DAS CORREÇÕES
-- =====================================================

COMMENT ON FUNCTION public.distribute_tournament_prize(UUID, UUID) IS 'Corrigido: autorização, idempotência, validação de participante';
COMMENT ON FUNCTION public.finalize_tournament_and_pay_winner(UUID, UUID) IS 'Corrigido: autorização, idempotência, validação de participante';
COMMENT ON FUNCTION public.activate_subscription(uuid, uuid) IS 'Corrigido: autorização (apenas próprio usuário ou admin)';
COMMENT ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, integer, integer, integer) IS 'Corrigido: validação de p_bet_amount contra valor real do duelo';
COMMENT ON FUNCTION public.tournament_pay_winner(uuid, uuid, integer) IS 'Corrigido: idempotência, limite ao pool real, sender_id NULL';
COMMENT ON FUNCTION public.tournament_refund_participant(uuid, uuid) IS 'Corrigido: idempotência, limite ao valor pago, sender_id NULL';
