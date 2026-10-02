-- =====================================================
-- Correções críticas de segurança - Duelverse
-- Data: 2026-10-02 22:00:00
-- =====================================================
--
-- Corrige autorização/validação nas RPCs SECURITY DEFINER de prêmio de torneio,
-- reembolso, assinatura e pontuação ranqueada.
--
-- Modelo de chamada (igual ao de 20261002210000_fix_profile_guards_invoker.sql):
--   * front (supabase-js/PostgREST) ........ current_user = 'authenticated', auth.uid() = usuário
--   * edge function com JWT do usuário ..... idem (distribute-tournament-prize, charge-tournament-entry-fee)
--   * trigger de live_duels disparado por UPDATE do front: auth.uid() = usuário e
--     auth.role() = 'authenticated' (NÃO é service_role); dentro de record_match_result
--     a chamada vinda do trigger é identificada por pg_trigger_depth() > 0.
--
-- Todas as funções mantêm EXATAMENTE a assinatura da definição anterior (CREATE OR
-- REPLACE, sem overloads novos), ficam SECURITY DEFINER com search_path fixo e
-- perdem EXECUTE de PUBLIC/anon (o default do Postgres concede EXECUTE a PUBLIC;
-- revogar só de anon não tem efeito).
-- =====================================================

-- =====================================================
-- 1. distribute_tournament_prize
-- =====================================================
-- Só o criador do torneio ou admin; vencedor tem que ser participante; paga uma
-- única vez por torneio (qualquer 'tournament_prize' já lançado bloqueia).
-- created_by NULL (torneio legado sem dono) só pode ser pago por admin.

CREATE OR REPLACE FUNCTION public.distribute_tournament_prize(
    p_tournament_id UUID,
    p_winner_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tournament RECORD;
    v_total_entry_fees INT;
    v_caller UUID := auth.uid();
BEGIN
    IF v_caller IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Não autenticado');
    END IF;

    -- trava o torneio: serializa pagamentos concorrentes do mesmo torneio
    SELECT * INTO v_tournament
    FROM public.tournaments
    WHERE id = p_tournament_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
    END IF;

    IF v_tournament.created_by IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
        RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode distribuir prêmios');
    END IF;

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

    IF NOT EXISTS (
        SELECT 1 FROM public.tournament_participants
        WHERE tournament_id = p_tournament_id AND user_id = p_winner_id
    ) THEN
        RETURN json_build_object('success', false, 'message', 'Vencedor não é participante do torneio');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_winner_id) THEN
        RETURN json_build_object('success', false, 'message', 'Vencedor não encontrado');
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_entry_fees
    FROM public.duelcoins_transactions
    WHERE tournament_id = p_tournament_id
      AND transaction_type = 'tournament_entry';

    IF v_total_entry_fees > 0 THEN
        UPDATE public.profiles
        SET duelcoins_balance = duelcoins_balance + v_total_entry_fees
        WHERE user_id = p_winner_id;

        INSERT INTO public.duelcoins_transactions (
            sender_id, receiver_id, amount, transaction_type, tournament_id, description
        ) VALUES (
            NULL, p_winner_id, v_total_entry_fees, 'tournament_prize', p_tournament_id,
            format('Prêmio do torneio: %s', v_tournament.name)
        );
    END IF;

    UPDATE public.tournament_participants
    SET status = 'winner'
    WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;

    UPDATE public.tournaments
    SET status = 'completed', end_date = NOW()
    WHERE id = p_tournament_id;

    RETURN json_build_object(
        'success', true,
        'message', format('Prêmio de %s DuelCoins distribuído para o vencedor!', v_total_entry_fees),
        'prize_amount', v_total_entry_fees
    );
END;
$$;

REVOKE ALL ON FUNCTION public.distribute_tournament_prize(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.distribute_tournament_prize(UUID, UUID) TO authenticated, service_role;

-- =====================================================
-- 2. finalize_tournament_and_pay_winner (edge function distribute-tournament-prize)
-- =====================================================
-- Mesmas regras de autorização. Valor: o prêmio disponível do torneio =
-- GREATEST(prize_pool depositado pelo criador, taxas de inscrição lançadas), o
-- mesmo teto usado por tournament_pay_winner (a edge function anuncia
-- "Prêmio de <prize_pool> DuelCoins").

CREATE OR REPLACE FUNCTION public.finalize_tournament_and_pay_winner(
  p_tournament_id UUID,
  p_winner_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament RECORD;
  v_prize_amount INTEGER;
  v_entries INTEGER;
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;

  IF v_tournament.created_by IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode finalizar e pagar');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.duelcoins_transactions
    WHERE tournament_id = p_tournament_id
      AND transaction_type = 'tournament_prize'
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Prêmio já foi pago');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_participants
    WHERE tournament_id = p_tournament_id AND user_id = p_winner_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não é participante do torneio');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_entries
  FROM public.duelcoins_transactions
  WHERE tournament_id = p_tournament_id
    AND transaction_type = 'tournament_entry';

  v_prize_amount := GREATEST(COALESCE(v_tournament.prize_pool, 0), v_entries);

  IF v_prize_amount <= 0 THEN
    UPDATE public.tournaments SET status = 'completed', end_date = NOW()
    WHERE id = p_tournament_id;

    UPDATE public.tournament_participants SET status = 'winner'
    WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;

    RETURN json_build_object('success', true, 'message', 'Torneio finalizado sem prêmio');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_winner_id) THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não encontrado');
  END IF;

  UPDATE public.profiles
  SET duelcoins_balance = duelcoins_balance + v_prize_amount
  WHERE user_id = p_winner_id;

  INSERT INTO public.duelcoins_transactions (
    sender_id, receiver_id, amount, transaction_type, tournament_id, description
  ) VALUES (
    NULL, p_winner_id, v_prize_amount, 'tournament_prize', p_tournament_id,
    'Prêmio do torneio: ' || v_tournament.name
  );

  UPDATE public.tournament_participants
  SET status = 'winner'
  WHERE tournament_id = p_tournament_id AND user_id = p_winner_id;

  UPDATE public.tournaments
  SET status = 'completed', end_date = NOW()
  WHERE id = p_tournament_id;

  RETURN json_build_object(
    'success', true,
    'message', 'Prêmio de ' || v_prize_amount || ' DuelCoins pago ao vencedor!',
    'prize_amount', v_prize_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_tournament_and_pay_winner(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_tournament_and_pay_winner(UUID, UUID) TO authenticated, service_role;

-- =====================================================
-- 3. activate_subscription
-- =====================================================
-- p_user_id tem que ser auth.uid() (o front sempre passa o próprio userId) ou admin.

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
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_user_id IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Você só pode ativar assinatura para si mesmo');
  END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Plano não encontrado ou inativo');
  END IF;

  -- trava o saldo (duas ativações simultâneas não gastam o mesmo saldo)
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = p_user_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < v_plan.price_duelcoins THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente de DuelCoins');
  END IF;

  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_plan.price_duelcoins WHERE user_id = p_user_id;

  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (p_user_id, v_plan.price_duelcoins, 'subscription', 'Compra de plano: ' || v_plan.name);

  v_expires_at := now() + (v_plan.duration_days || ' days')::interval;

  UPDATE user_subscriptions SET is_active = false WHERE user_id = p_user_id AND is_active = true;

  INSERT INTO user_subscriptions (user_id, plan_id, is_active, starts_at, expires_at)
  VALUES (p_user_id, p_plan_id, true, now(), v_expires_at)
  RETURNING id INTO v_subscription_id;

  UPDATE profiles SET account_type = 'pro' WHERE user_id = p_user_id;

  RETURN json_build_object('success', true, 'message', 'Assinatura ativada', 'subscription_id', v_subscription_id, 'expires_at', v_expires_at);
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_subscription(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_subscription(uuid, uuid) TO authenticated, service_role;

-- =====================================================
-- 4. record_match_result + live_duels.bet_amount
-- =====================================================
-- Antes: pontos = p_bet_amount (do cliente) ou 10 + p_player*_score/100 (do
-- cliente), e a RPC aceitava duelo 'waiting'/'in_progress'. Um participante
-- ganhava +1.000.000 pontos chamando a RPC direto, ou fazendo
-- UPDATE live_duels SET bet_amount/player1_lp = <enorme>, status = 'finished'.
--
-- Agora:
--   * a aposta vem SEMPRE de live_duels.bet_amount (p_bet_amount é ignorado) e o
--     cliente não consegue mais gravar bet_amount (guard abaixo; nenhum caminho
--     legítimo grava valor diferente de 0: matchmake usa 0 e o front não envia);
--   * o score usado na conta é limitado a 0..10000 (yugioh/rush começam com 8000
--     LP; magic 40; pokemon 6) -> no máximo 110 pontos por vitória sem aposta;
--   * chamada DIRETA (PostgREST, pg_trigger_depth() = 0) não contradiz o
--     resultado gravado: se live_duels.winner_id já está definido, p_winner_id
--     tem que ser igual (o perdedor não reescreve histórico/pontos). O fim de
--     duelo do front (UPDATE status='finished', winner_id) pontua pelo trigger;
--     a chamada que o DuelRoom faz em seguida é idempotente.
--   * Fica de fora (modelo de confiança atual): qualquer participante pode
--     declarar o resultado (UPDATE live_duels ... winner_id ou esta RPC antes de
--     haver vencedor). Fechar isso exige consenso entre os jogadores.

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
  v_duel_winner uuid;
  v_is_ranked boolean;
  v_points_change integer := 0;
  v_loser_id uuid;
  v_tcg text;
  v_already_awarded boolean := false;
  v_bet integer;
  v_direct boolean := (pg_trigger_depth() = 0);
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Unauthorized: You must be a participant in this duel';
  END IF;

  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Invalid winner: Must be one of the players or NULL for draw';
  END IF;

  SELECT status, creator_id, opponent_id, winner_id, is_ranked, bet_amount,
    CASE lower(coalesce(tcg_type, 'yugioh'))
      WHEN 'magic' THEN 'genesis'
      WHEN 'pokemon' THEN 'rush_duel'
      WHEN 'genesis' THEN 'genesis'
      WHEN 'rush_duel' THEN 'rush_duel'
      ELSE 'yugioh'
    END
  INTO v_duel_status, v_duel_creator, v_duel_opponent, v_duel_winner, v_is_ranked, v_bet, v_tcg
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

  IF v_direct AND v_duel_winner IS NOT NULL AND p_winner_id IS DISTINCT FROM v_duel_winner THEN
    RAISE EXCEPTION 'Winner does not match the duel result';
  END IF;

  -- nunca confiar no p_bet_amount do cliente
  v_bet := greatest(coalesce(v_bet, 0), 0);

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
      p_player1_score, p_player2_score, v_bet, v_tcg
    )
    ON CONFLICT (duel_id) WHERE duel_id IS NOT NULL DO NOTHING
    RETURNING id, ranked_points_awarded INTO v_match_id, v_already_awarded;

    IF v_match_id IS NULL THEN
      SELECT id, ranked_points_awarded INTO v_match_id, v_already_awarded
      FROM public.match_history WHERE duel_id = p_duel_id FOR UPDATE;
    END IF;
  ELSIF NOT v_already_awarded THEN
    UPDATE public.match_history
    SET winner_id = coalesce(p_winner_id, winner_id),
        player1_score = p_player1_score,
        player2_score = p_player2_score,
        bet_amount = v_bet,
        tcg_type = coalesce(tcg_type, v_tcg)
    WHERE id = v_match_id;
  END IF;

  IF p_winner_id IS NULL OR v_already_awarded THEN RETURN v_match_id; END IF;

  v_loser_id := CASE WHEN p_winner_id = p_player1_id THEN p_player2_id ELSE p_player1_id END;

  IF v_is_ranked THEN
    IF v_bet > 0 THEN
      v_points_change := v_bet;
    ELSIF p_winner_id = p_player1_id THEN
      v_points_change := 10 + (least(greatest(coalesce(p_player1_score, 0), 0), 10000) / 100);
    ELSE
      v_points_change := 10 + (least(greatest(coalesce(p_player2_score, 0), 0), 10000) / 100);
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

REVOKE ALL ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, integer, integer, integer) TO authenticated, service_role;

-- Guard: cliente da API (anon/authenticated, não admin) não define nem altera
-- live_duels.bet_amount. SECURITY INVOKER: RPCs SECURITY DEFINER (matchmake),
-- service_role e SQL do servidor passam (mesmo modelo dos guards de profiles).
CREATE OR REPLACE FUNCTION public.protect_live_duel_bet_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.bet_amount, 0) <> 0 THEN
      RAISE EXCEPTION 'bet_amount só pode ser definido pelo servidor' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.bet_amount IS DISTINCT FROM OLD.bet_amount THEN
    RAISE EXCEPTION 'bet_amount só pode ser alterado pelo servidor' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_live_duel_bet_amount ON public.live_duels;
CREATE TRIGGER trg_protect_live_duel_bet_amount
BEFORE INSERT OR UPDATE OF bet_amount ON public.live_duels
FOR EACH ROW EXECUTE FUNCTION public.protect_live_duel_bet_amount();

-- =====================================================
-- 5. user_subscriptions: sem INSERT/UPDATE pelo cliente
-- =====================================================
-- A policy user_subscriptions_insert_own (20260218_add_subscription_plans.sql)
-- deixava o usuário inserir assinatura ativa até 2099. Assinaturas só nascem por
-- activate_subscription (SECURITY DEFINER), webhooks (service_role) ou admin.

DROP POLICY IF EXISTS "user_subscriptions_insert_own" ON user_subscriptions;
DROP POLICY IF EXISTS "user_subscriptions_update_own" ON user_subscriptions;

DROP POLICY IF EXISTS "user_subscriptions_select_own" ON user_subscriptions;
CREATE POLICY "user_subscriptions_select_own" ON user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_subscriptions_all" ON user_subscriptions;
CREATE POLICY "user_subscriptions_all" ON user_subscriptions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  ));

-- =====================================================
-- 6. tournament_pay_winner (TournamentWinnerSelector)
-- =====================================================
-- Antes: sender_id = tournament_id violava a FK (a função sempre falhava) e não
-- havia teto. Agora:
--   * só criador/admin; vencedor tem que ser participante;
--   * teto CUMULATIVO por torneio: soma de todos os 'tournament_prize' lançados
--     <= GREATEST(prize_pool depositado, taxas de inscrição lançadas). Valor acima
--     do disponível é recusado (não paga parcial calado);
--   * o mesmo participante não recebe 2x; vários colocados podem dividir o pool;
--   * sender_id NULL (sistema).

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
  v_t record;
  v_entries integer;
  v_paid integer;
  v_available integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Valor inválido');
  END IF;

  SELECT id, created_by, name, prize_pool INTO v_t
    FROM tournaments WHERE id = p_tournament_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  IF v_t.created_by IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode pagar o prêmio');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tournament_participants
    WHERE tournament_id = p_tournament_id AND user_id = p_winner_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não é participante do torneio');
  END IF;

  IF EXISTS (
    SELECT 1 FROM duelcoins_transactions
    WHERE tournament_id = p_tournament_id
      AND transaction_type = 'tournament_prize'
      AND receiver_id = p_winner_id
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Prêmio já foi pago a este vencedor');
  END IF;

  SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'tournament_entry'), 0),
         COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'tournament_prize'), 0)
    INTO v_entries, v_paid
    FROM duelcoins_transactions
   WHERE tournament_id = p_tournament_id;

  v_available := GREATEST(COALESCE(v_t.prize_pool, 0), v_entries) - v_paid;
  IF p_amount > v_available THEN
    RETURN json_build_object('success', false,
      'message', format('Valor acima do prêmio disponível do torneio (%s DuelCoins)', GREATEST(v_available, 0)),
      'available', GREATEST(v_available, 0));
  END IF;

  UPDATE profiles SET duelcoins_balance = duelcoins_balance + p_amount
   WHERE user_id = p_winner_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Vencedor não encontrado');
  END IF;

  INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description)
  VALUES (NULL, p_winner_id, p_amount, 'tournament_prize', p_tournament_id, 'Prêmio do torneio: ' || v_t.name);

  RETURN json_build_object('success', true, 'amount_paid', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_pay_winner(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_pay_winner(uuid, uuid, integer) TO authenticated, service_role;

-- =====================================================
-- 7. tournament_refund_participant (TournamentDetail.removeParticipant)
-- =====================================================
-- Reembolsa no máximo o que o participante pagou e ainda não foi reembolsado
-- neste torneio (lançamentos 'tournament_entry' com tournament_id), limitado a
-- entry_fee. Inscrição sem pagamento (INSERT direto em tournament_participants)
-- não gera crédito; reinscrição paga e removida de novo é reembolsada de novo.
-- Não depende da linha em tournament_participants (o front apaga antes de
-- chamar). sender_id NULL (sistema).

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
  v_t record;
  v_paid integer;
  v_refunded integer;
  v_amount integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT id, created_by, entry_fee, name INTO v_t
    FROM tournaments WHERE id = p_tournament_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;
  IF v_t.created_by IS DISTINCT FROM v_caller AND NOT public.is_admin(v_caller) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador do torneio pode reembolsar participantes');
  END IF;

  IF COALESCE(v_t.entry_fee, 0) <= 0 THEN
    RETURN json_build_object('success', true, 'refunded', 0);
  END IF;

  SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'tournament_entry'  AND sender_id   = p_participant_id), 0),
         COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'tournament_refund' AND receiver_id = p_participant_id), 0)
    INTO v_paid, v_refunded
    FROM duelcoins_transactions
   WHERE tournament_id = p_tournament_id;

  v_amount := LEAST(v_t.entry_fee, v_paid - v_refunded);
  IF v_amount <= 0 THEN
    RETURN json_build_object('success', false, 'message', 'Nada a reembolsar: nenhuma inscrição paga pendente de reembolso');
  END IF;

  UPDATE profiles SET duelcoins_balance = duelcoins_balance + v_amount
   WHERE user_id = p_participant_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Participante não encontrado');
  END IF;

  INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description)
  VALUES (NULL, p_participant_id, v_amount, 'tournament_refund', p_tournament_id, 'Reembolso de inscrição: ' || v_t.name);

  RETURN json_build_object('success', true, 'refunded', v_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_refund_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_refund_participant(uuid, uuid) TO authenticated, service_role;

-- =====================================================
-- 8. join_weekly_tournament: lança a inscrição COM tournament_id
-- =====================================================
-- Sem tournament_id a inscrição semanal não aparecia no total arrecadado e não
-- podia ser reembolsada por tournament_refund_participant. Único ajuste em relação
-- a 20260211021613: tournament_id no INSERT do lançamento.

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

    INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, tournament_id, description)
    VALUES (v_user_id, v_entry_fee, 'tournament_entry', p_tournament_id, 'Inscrição em torneio semanal');

    -- Add to tournament collected
    UPDATE tournaments SET total_collected = COALESCE(total_collected, 0) + v_entry_fee WHERE id = p_tournament_id;
  END IF;

  -- Join tournament
  INSERT INTO tournament_participants (tournament_id, user_id, status)
  VALUES (p_tournament_id, v_user_id, 'registered');

  RETURN json_build_object('success', true, 'message', 'Inscrito com sucesso!');
END;
$$;

-- =====================================================
-- FIM DAS CORREÇÕES
-- =====================================================

COMMENT ON FUNCTION public.distribute_tournament_prize(UUID, UUID) IS 'Só criador/admin; vencedor participante; paga 1x por torneio';
COMMENT ON FUNCTION public.finalize_tournament_and_pay_winner(UUID, UUID) IS 'Só criador/admin; vencedor participante; paga 1x; valor = GREATEST(prize_pool, taxas)';
COMMENT ON FUNCTION public.activate_subscription(uuid, uuid) IS 'Só para si mesmo (ou admin)';
COMMENT ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, integer, integer, integer) IS 'Aposta de live_duels (p_bet_amount ignorado); chamada direta não contradiz o vencedor registrado; score limitado a 10000';
COMMENT ON FUNCTION public.tournament_pay_winner(uuid, uuid, integer) IS 'Só criador/admin; vencedor participante; teto cumulativo GREATEST(prize_pool, taxas); 1x por vencedor';
COMMENT ON FUNCTION public.tournament_refund_participant(uuid, uuid) IS 'Só criador/admin; reembolsa no máximo o pago e ainda não reembolsado';
