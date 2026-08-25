-- =========================================================
-- 1. DUEL ROOM EXPIRATION
-- =========================================================
ALTER TABLE public.live_duels
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_warned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_reason text;

UPDATE public.live_duels
   SET expires_at = created_at + interval '30 minutes'
 WHERE expires_at IS NULL
   AND status = 'waiting'
   AND opponent_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_duel_room_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.opponent_id IS NULL AND NEW.status = 'waiting' THEN
    NEW.expires_at := COALESCE(NEW.expires_at, now() + interval '30 minutes');
  ELSE
    NEW.expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_duel_room_expiry ON public.live_duels;
CREATE TRIGGER trg_set_duel_room_expiry
BEFORE INSERT ON public.live_duels
FOR EACH ROW EXECUTE FUNCTION public.set_duel_room_expiry();

-- Cancel expiry + notify creator when someone joins
CREATE OR REPLACE FUNCTION public.duel_room_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.opponent_id IS NULL AND NEW.opponent_id IS NOT NULL THEN
    NEW.expires_at := NULL;
    NEW.expiry_warned := false;

    IF NEW.creator_id IS NOT NULL AND NEW.creator_id <> NEW.opponent_id THEN
      PERFORM public.create_notification(
        NEW.creator_id,
        'duel_room_joined',
        'Um jogador entrou na sua Duel Room!',
        'Sua sala está pronta para começar.',
        jsonb_build_object('duel_id', NEW.id, 'url', '/duel/' || NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_duel_room_on_join ON public.live_duels;
CREATE TRIGGER trg_duel_room_on_join
BEFORE UPDATE OF opponent_id ON public.live_duels
FOR EACH ROW EXECUTE FUNCTION public.duel_room_on_join();

-- Backend expiration sweeper (idempotent, safe to call often)
CREATE OR REPLACE FUNCTION public.expire_idle_duel_rooms()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warned int := 0;
  v_closed int := 0;
  r record;
BEGIN
  -- 5 minute warning
  FOR r IN
    SELECT id, creator_id, room_name
      FROM public.live_duels
     WHERE status = 'waiting'
       AND opponent_id IS NULL
       AND expires_at IS NOT NULL
       AND expiry_warned = false
       AND expires_at <= now() + interval '5 minutes'
       AND expires_at > now()
     LIMIT 100
  LOOP
    UPDATE public.live_duels SET expiry_warned = true WHERE id = r.id;
    PERFORM public.create_notification(
      r.creator_id,
      'duel_room_expiring',
      'Sua Duel Room expira em breve',
      'Esta sala será fechada automaticamente em 5 minutos caso nenhum jogador entre.',
      jsonb_build_object('duel_id', r.id, 'url', '/duel/' || r.id)
    );
    v_warned := v_warned + 1;
  END LOOP;

  -- Close expired rooms
  FOR r IN
    SELECT id, creator_id
      FROM public.live_duels
     WHERE status = 'waiting'
       AND opponent_id IS NULL
       AND expires_at IS NOT NULL
       AND expires_at <= now()
     LIMIT 200
  LOOP
    UPDATE public.live_duels
       SET status = 'finished',
           finished_at = now(),
           closed_reason = 'expired',
           expires_at = NULL
     WHERE id = r.id;

    PERFORM public.create_notification(
      r.creator_id,
      'duel_room_expired',
      'Duel Room encerrada',
      'Sua Duel Room foi encerrada automaticamente por falta de jogadores.',
      jsonb_build_object('duel_id', r.id, 'url', '/duels')
    );
    v_closed := v_closed + 1;
  END LOOP;

  RETURN json_build_object('warned', v_warned, 'closed', v_closed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_idle_duel_rooms() TO authenticated;

DO $$
BEGIN
  PERFORM cron.schedule('expire-idle-duel-rooms', '* * * * *', 'SELECT public.expire_idle_duel_rooms();');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- =========================================================
-- 2. TOURNAMENTS: SWISS + TOP 4
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_normal_tournament(p_name text, p_description text, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_prize_pool numeric, p_entry_fee numeric, p_max_participants integer, p_tournament_type text DEFAULT 'single_elimination'::text, p_requires_decklist boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF p_tournament_type NOT IN ('single_elimination', 'swiss', 'swiss_top4') THEN
    RETURN json_build_object('success', false, 'message', 'Formato de torneio inválido');
  END IF;

  SELECT COALESCE(duelcoins_balance, 0) INTO v_balance
  FROM profiles WHERE user_id = v_user_id;

  IF v_balance IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Perfil não encontrado');
  END IF;

  IF p_prize_pool > 0 AND v_balance < p_prize_pool THEN
    RETURN json_build_object('success', false, 'message',
      'Saldo insuficiente. Você precisa de ' || p_prize_pool || ' DuelCoins para o prêmio.');
  END IF;

  IF p_tournament_type IN ('swiss', 'swiss_top4') THEN
    IF p_max_participants >= 65 THEN v_swiss_rounds := 7;
    ELSIF p_max_participants >= 33 THEN v_swiss_rounds := 6;
    ELSIF p_max_participants >= 17 THEN v_swiss_rounds := 5;
    ELSIF p_max_participants >= 9 THEN v_swiss_rounds := 4;
    ELSE v_swiss_rounds := 3;
    END IF;
  END IF;

  IF p_prize_pool > 0 THEN
    UPDATE profiles
    SET duelcoins_balance = duelcoins_balance - p_prize_pool
    WHERE user_id = v_user_id;

    INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
    VALUES (v_user_id, p_prize_pool, 'tournament_prize_deposit',
      'Depósito de prêmio para torneio: ' || p_name);
  END IF;

  INSERT INTO tournaments (
    name, description, start_date, end_date, prize_pool, entry_fee,
    max_participants, status, created_by, tournament_type, total_rounds,
    tcg_type, requires_decklist
  ) VALUES (
    p_name, p_description, p_start_date, p_end_date, p_prize_pool, p_entry_fee,
    p_max_participants, 'upcoming', v_user_id, p_tournament_type, v_swiss_rounds,
    'yugioh', p_requires_decklist
  ) RETURNING id INTO v_tournament_id;

  RETURN json_build_object(
    'success', true,
    'tournament_id', v_tournament_id,
    'message', 'Torneio criado com sucesso!'
  );
END;
$function$;

-- Standings helper (shared tiebreak criteria)
CREATE OR REPLACE FUNCTION public.tournament_standings(p_tournament_id uuid)
RETURNS TABLE(user_id uuid, rank_position int, score int, wins int, losses int, draws int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tp.user_id,
         ROW_NUMBER() OVER (
           ORDER BY COALESCE(tp.score, 0) DESC,
                    COALESCE(tp.wins, 0) DESC,
                    COALESCE(tp.losses, 0) ASC,
                    COALESCE(tp.draws, 0) DESC,
                    tp.registered_at ASC
         )::int AS rank_position,
         COALESCE(tp.score, 0)::int,
         COALESCE(tp.wins, 0)::int,
         COALESCE(tp.losses, 0)::int,
         COALESCE(tp.draws, 0)::int
    FROM tournament_participants tp
   WHERE tp.tournament_id = p_tournament_id
$$;

GRANT EXECUTE ON FUNCTION public.tournament_standings(uuid) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.generate_next_round(p_tournament_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_created_by uuid;
  v_current_round int;
  v_total_rounds int;
  v_status text;
  v_type text;
  v_pending int;
  v_next_round int;
  v_existing_next int;
  v_matches_created int := 0;
  v_players uuid[] := ARRAY[]::uuid[];
  v_paired uuid[] := ARRAY[]::uuid[];
  v_top uuid[];
  v_semi_winners uuid[];
  v_p1 uuid;
  v_p2 uuid;
  v_i int;
  v_j int;
  v_already_played boolean;
BEGIN
  SELECT created_by, current_round, total_rounds, status, COALESCE(tournament_type, 'single_elimination')
    INTO v_created_by, v_current_round, v_total_rounds, v_status, v_type
  FROM tournaments WHERE id = p_tournament_id;

  IF v_created_by IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não encontrado');
  END IF;

  IF v_created_by <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Apenas o criador ou admin pode gerar próxima rodada');
  END IF;

  IF v_status <> 'active' THEN
    RETURN json_build_object('success', false, 'message', 'Torneio não está ativo');
  END IF;

  IF v_current_round IS NULL THEN
    v_current_round := 1;
  END IF;

  IF v_type = 'swiss_top4' THEN
    IF v_total_rounds IS NOT NULL AND v_current_round >= v_total_rounds + 2 THEN
      RETURN json_build_object('success', false, 'message', 'A final já foi gerada');
    END IF;
  ELSIF v_total_rounds IS NOT NULL AND v_current_round >= v_total_rounds THEN
    RETURN json_build_object('success', false, 'message', 'Esta já é a última rodada');
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id
    AND round = v_current_round
    AND status <> 'completed';

  IF v_pending > 0 THEN
    RETURN json_build_object('success', false, 'message', 'Existem partidas pendentes na rodada atual');
  END IF;

  v_next_round := v_current_round + 1;

  SELECT COUNT(*) INTO v_existing_next
  FROM tournament_matches
  WHERE tournament_id = p_tournament_id AND round = v_next_round;

  IF v_existing_next > 0 THEN
    RETURN json_build_object('success', false, 'message', 'Próxima rodada já foi gerada');
  END IF;

  -- ===== TOP 4 PHASE (swiss_top4) =====
  IF v_type = 'swiss_top4' AND v_total_rounds IS NOT NULL AND v_current_round >= v_total_rounds THEN
    IF v_current_round = v_total_rounds THEN
      -- Build semifinals from swiss standings
      SELECT array_agg(s.user_id ORDER BY s.rank_position)
        INTO v_top
      FROM (SELECT * FROM public.tournament_standings(p_tournament_id) ORDER BY rank_position LIMIT 4) s;

      IF v_top IS NULL OR array_length(v_top, 1) < 4 THEN
        RETURN json_build_object('success', false, 'message', 'São necessários ao menos 4 participantes para o Top 4');
      END IF;

      UPDATE tournament_participants
         SET status = 'eliminated'
       WHERE tournament_id = p_tournament_id
         AND NOT (user_id = ANY(v_top));

      UPDATE tournament_participants
         SET status = 'active'
       WHERE tournament_id = p_tournament_id
         AND user_id = ANY(v_top);

      INSERT INTO tournament_matches (tournament_id, round, player1_id, player2_id, status)
      VALUES (p_tournament_id, v_next_round, v_top[1], v_top[4], 'pending'),
             (p_tournament_id, v_next_round, v_top[2], v_top[3], 'pending');

      UPDATE tournaments SET current_round = v_next_round WHERE id = p_tournament_id;

      RETURN json_build_object('success', true, 'phase', 'top4_semifinals',
        'message', 'Semifinais do Top 4 geradas', 'round', v_next_round, 'matches_created', 2);
    ELSE
      -- Final from semifinal winners
      SELECT array_agg(winner_id ORDER BY created_at)
        INTO v_semi_winners
      FROM tournament_matches
      WHERE tournament_id = p_tournament_id
        AND round = v_total_rounds + 1
        AND winner_id IS NOT NULL;

      IF v_semi_winners IS NULL OR array_length(v_semi_winners, 1) < 2 THEN
        RETURN json_build_object('success', false, 'message', 'As semifinais ainda não têm dois vencedores');
      END IF;

      INSERT INTO tournament_matches (tournament_id, round, player1_id, player2_id, status)
      VALUES (p_tournament_id, v_next_round, v_semi_winners[1], v_semi_winners[2], 'pending');

      UPDATE tournament_participants
         SET status = 'eliminated'
       WHERE tournament_id = p_tournament_id
         AND NOT (user_id = ANY(v_semi_winners));

      UPDATE tournaments SET current_round = v_next_round WHERE id = p_tournament_id;

      RETURN json_build_object('success', true, 'phase', 'top4_final',
        'message', 'Final do Top 4 gerada', 'round', v_next_round, 'matches_created', 1);
    END IF;
  END IF;

  -- ===== SWISS PAIRING =====
  SELECT array_agg(user_id ORDER BY COALESCE(score, 0) DESC, COALESCE(wins, 0) DESC, COALESCE(losses, 0) ASC, random())
    INTO v_players
  FROM tournament_participants
  WHERE tournament_id = p_tournament_id
    AND COALESCE(status, 'active') <> 'eliminated';

  IF v_players IS NULL OR array_length(v_players, 1) IS NULL OR array_length(v_players, 1) < 2 THEN
    RETURN json_build_object('success', false, 'message', 'Participantes insuficientes para gerar próxima rodada');
  END IF;

  v_i := 1;
  WHILE v_i <= array_length(v_players, 1) LOOP
    v_p1 := v_players[v_i];

    IF v_p1 = ANY(v_paired) THEN
      v_i := v_i + 1;
      CONTINUE;
    END IF;

    v_p2 := NULL;
    v_j := v_i + 1;
    WHILE v_j <= array_length(v_players, 1) LOOP
      IF NOT (v_players[v_j] = ANY(v_paired)) THEN
        SELECT EXISTS (
          SELECT 1 FROM tournament_matches
          WHERE tournament_id = p_tournament_id
            AND ((player1_id = v_p1 AND player2_id = v_players[v_j])
              OR (player1_id = v_players[v_j] AND player2_id = v_p1))
        ) INTO v_already_played;

        IF NOT v_already_played THEN
          v_p2 := v_players[v_j];
          EXIT;
        END IF;
      END IF;
      v_j := v_j + 1;
    END LOOP;

    IF v_p2 IS NULL THEN
      v_j := v_i + 1;
      WHILE v_j <= array_length(v_players, 1) LOOP
        IF NOT (v_players[v_j] = ANY(v_paired)) THEN
          v_p2 := v_players[v_j];
          EXIT;
        END IF;
        v_j := v_j + 1;
      END LOOP;
    END IF;

    IF v_p2 IS NOT NULL THEN
      INSERT INTO tournament_matches (tournament_id, round, player1_id, player2_id, status)
      VALUES (p_tournament_id, v_next_round, v_p1, v_p2, 'pending');
      v_matches_created := v_matches_created + 1;
      v_paired := v_paired || v_p1 || v_p2;
    ELSE
      INSERT INTO tournament_matches (tournament_id, round, player1_id, player2_id, winner_id, status)
      VALUES (p_tournament_id, v_next_round, v_p1, NULL, v_p1, 'completed');
      v_matches_created := v_matches_created + 1;
      v_paired := v_paired || v_p1;

      UPDATE tournament_participants
      SET wins = COALESCE(wins, 0) + 1, score = COALESCE(score, 0) + 3
      WHERE tournament_id = p_tournament_id AND user_id = v_p1;
    END IF;

    v_i := v_i + 1;
  END LOOP;

  UPDATE tournaments SET current_round = v_next_round WHERE id = p_tournament_id;

  RETURN json_build_object(
    'success', true,
    'phase', 'swiss',
    'message', 'Próxima rodada gerada (Suíço)',
    'round', v_next_round,
    'matches_created', v_matches_created
  );
END;
$function$;

-- =========================================================
-- 3. ADMIN METRICS V2
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_platform_metrics_v2(p_from timestamptz, p_to timestamptz)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(p_to, now());
  v_len interval;
  v_prev_from timestamptz;
  v_result json;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = '42501';
  END IF;

  IF v_to <= v_from THEN
    v_to := v_from + interval '1 day';
  END IF;

  v_len := v_to - v_from;
  v_prev_from := v_from - v_len;

  SELECT json_build_object(
    'range', json_build_object('from', v_from, 'to', v_to, 'prev_from', v_prev_from, 'prev_to', v_from),
    'users', json_build_object(
      'total', (SELECT count(*) FROM profiles),
      'online', (SELECT count(*) FROM profiles WHERE is_online = true),
      'new_current', (SELECT count(*) FROM profiles WHERE created_at >= v_from AND created_at < v_to),
      'new_previous', (SELECT count(*) FROM profiles WHERE created_at >= v_prev_from AND created_at < v_from),
      'active_current', (SELECT count(*) FROM profiles WHERE last_seen >= v_from AND last_seen < v_to),
      'active_previous', (SELECT count(*) FROM profiles WHERE last_seen >= v_prev_from AND last_seen < v_from),
      'total_at_period_start', (SELECT count(*) FROM profiles WHERE created_at < v_from)
    ),
    'rooms', json_build_object(
      'created_current', (SELECT count(*) FROM live_duels WHERE created_at >= v_from AND created_at < v_to),
      'created_previous', (SELECT count(*) FROM live_duels WHERE created_at >= v_prev_from AND created_at < v_from),
      'active_now', (SELECT count(*) FROM live_duels WHERE status IN ('waiting','in_progress')),
      'waiting_now', (SELECT count(*) FROM live_duels WHERE status = 'waiting'),
      'closed_current', (SELECT count(*) FROM live_duels WHERE status = 'finished' AND finished_at >= v_from AND finished_at < v_to),
      'expired_current', (SELECT count(*) FROM live_duels WHERE closed_reason = 'expired' AND finished_at >= v_from AND finished_at < v_to),
      'avg_players', (SELECT COALESCE(round(avg(
            1 + (CASE WHEN opponent_id IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN player3_id IS NOT NULL THEN 1 ELSE 0 END)
              + (CASE WHEN player4_id IS NOT NULL THEN 1 ELSE 0 END)
          )::numeric, 2), 0)
          FROM live_duels WHERE created_at >= v_from AND created_at < v_to)
    ),
    'duels', json_build_object(
      'matches_current', (SELECT count(*) FROM match_history WHERE played_at >= v_from AND played_at < v_to),
      'matches_previous', (SELECT count(*) FROM match_history WHERE played_at >= v_prev_from AND played_at < v_from),
      'matches_total', (SELECT count(*) FROM match_history),
      'in_progress_now', (SELECT count(*) FROM live_duels WHERE status = 'in_progress'),
      'finished_current', (SELECT count(*) FROM live_duels WHERE status = 'finished' AND closed_reason IS DISTINCT FROM 'expired' AND finished_at >= v_from AND finished_at < v_to),
      'ranked_current', (SELECT count(*) FROM match_history mh JOIN live_duels d ON d.id = mh.duel_id WHERE d.is_ranked = true AND mh.played_at >= v_from AND mh.played_at < v_to),
      'casual_current', (SELECT count(*) FROM match_history mh LEFT JOIN live_duels d ON d.id = mh.duel_id WHERE COALESCE(d.is_ranked, false) = false AND mh.played_at >= v_from AND mh.played_at < v_to),
      'avg_duration_minutes', (SELECT COALESCE(round((avg(EXTRACT(epoch FROM (finished_at - started_at)))/60)::numeric, 1), 0)
          FROM live_duels WHERE started_at IS NOT NULL AND finished_at IS NOT NULL AND finished_at > started_at
            AND finished_at >= v_from AND finished_at < v_to)
    ),
    'tournaments', json_build_object(
      'created_current', (SELECT count(*) FROM tournaments WHERE created_at >= v_from AND created_at < v_to),
      'created_previous', (SELECT count(*) FROM tournaments WHERE created_at >= v_prev_from AND created_at < v_from),
      'active_now', (SELECT count(*) FROM tournaments WHERE status = 'active'),
      'finished_total', (SELECT count(*) FROM tournaments WHERE status IN ('completed','finished')),
      'participants_current', (SELECT count(*) FROM tournament_participants WHERE registered_at >= v_from AND registered_at < v_to),
      'avg_participants', (SELECT COALESCE(round(avg(c)::numeric, 1), 0) FROM (
          SELECT count(tp.id) AS c FROM tournaments t
            LEFT JOIN tournament_participants tp ON tp.tournament_id = t.id
           WHERE t.created_at >= v_from AND t.created_at < v_to
           GROUP BY t.id) x),
      'formats', (SELECT COALESCE(json_agg(row_to_json(f)), '[]'::json) FROM (
          SELECT COALESCE(tournament_type, 'single_elimination') AS format, count(*) AS count
            FROM tournaments WHERE created_at >= v_from AND created_at < v_to
           GROUP BY 1) f)
    ),
    'economy', json_build_object(
      'duelcoins_moved', (SELECT COALESCE(sum(amount), 0) FROM duelcoins_transactions WHERE created_at >= v_from AND created_at < v_to),
      'marketplace_sales', (SELECT count(*) FROM marketplace_purchases WHERE created_at >= v_from AND created_at < v_to),
      'marketplace_revenue_dc', (SELECT COALESCE(sum(total_price), 0) FROM marketplace_purchases WHERE created_at >= v_from AND created_at < v_to),
      'digital_sales', (SELECT count(*) FROM marketplace_purchases mp JOIN marketplace_products p ON p.id = mp.product_id
          WHERE p.product_type <> 'physical' AND mp.created_at >= v_from AND mp.created_at < v_to),
      'physical_sales', (SELECT count(*) FROM marketplace_purchases mp JOIN marketplace_products p ON p.id = mp.product_id
          WHERE p.product_type = 'physical' AND mp.created_at >= v_from AND mp.created_at < v_to),
      'revenue_brl_current', (SELECT COALESCE(sum(amount_brl), 0) FROM duelcoins_orders WHERE status = 'paid' AND paid_at >= v_from AND paid_at < v_to),
      'revenue_brl_previous', (SELECT COALESCE(sum(amount_brl), 0) FROM duelcoins_orders WHERE status = 'paid' AND paid_at >= v_prev_from AND paid_at < v_from),
      'revenue_brl_total', (SELECT COALESCE(sum(amount_brl), 0) FROM duelcoins_orders WHERE status = 'paid'),
      'orders_paid', (SELECT count(*) FROM duelcoins_orders WHERE status = 'paid' AND created_at >= v_from AND created_at < v_to),
      'orders_pending', (SELECT count(*) FROM duelcoins_orders WHERE status = 'pending' AND created_at >= v_from AND created_at < v_to),
      'orders_cancelled', (SELECT count(*) FROM duelcoins_orders WHERE status IN ('cancelled','canceled','failed') AND created_at >= v_from AND created_at < v_to),
      'active_subscriptions', (SELECT count(*) FROM user_subscriptions WHERE is_active = true AND expires_at > now())
    ),
    'series', (
      SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.day), '[]'::json) FROM (
        SELECT d::date AS day,
          (SELECT count(*) FROM profiles p WHERE p.created_at >= d AND p.created_at < d + interval '1 day') AS signups,
          (SELECT count(*) FROM match_history m WHERE m.played_at >= d AND m.played_at < d + interval '1 day') AS matches,
          (SELECT count(*) FROM live_duels r WHERE r.created_at >= d AND r.created_at < d + interval '1 day') AS rooms,
          (SELECT count(*) FROM tournaments t WHERE t.created_at >= d AND t.created_at < d + interval '1 day') AS tournaments,
          (SELECT COALESCE(sum(o.amount_brl), 0) FROM duelcoins_orders o WHERE o.status = 'paid' AND o.paid_at >= d AND o.paid_at < d + interval '1 day') AS revenue_brl
        FROM generate_series(date_trunc('day', v_from), date_trunc('day', v_to), interval '1 day') d
      ) s
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_platform_metrics_v2(timestamptz, timestamptz) TO authenticated;