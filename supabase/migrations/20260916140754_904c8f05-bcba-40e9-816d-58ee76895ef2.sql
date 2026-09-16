
-- ============ SEASONS ============
CREATE TABLE public.battle_pass_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  season_number integer NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  is_active boolean NOT NULL DEFAULT false,
  max_levels integer NOT NULL DEFAULT 50,
  count_tournament_wins boolean NOT NULL DEFAULT true,
  pro_price_duelcoins integer NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_number)
);
GRANT SELECT ON public.battle_pass_seasons TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.battle_pass_seasons TO authenticated;
GRANT ALL ON public.battle_pass_seasons TO service_role;
ALTER TABLE public.battle_pass_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_seasons_read" ON public.battle_pass_seasons FOR SELECT USING (true);
CREATE POLICY "bp_seasons_admin" ON public.battle_pass_seasons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ LEVELS ============
CREATE TABLE public.battle_pass_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  level integer NOT NULL,
  wins_required integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, level)
);
GRANT SELECT ON public.battle_pass_levels TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.battle_pass_levels TO authenticated;
GRANT ALL ON public.battle_pass_levels TO service_role;
ALTER TABLE public.battle_pass_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_levels_read" ON public.battle_pass_levels FOR SELECT USING (true);
CREATE POLICY "bp_levels_admin" ON public.battle_pass_levels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ REWARDS ============
CREATE TABLE public.battle_pass_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  level integer NOT NULL,
  track text NOT NULL CHECK (track IN ('free','pro')),
  reward_type text NOT NULL DEFAULT 'cosmetic'
    CHECK (reward_type IN ('duelcoins','sleeve','playmat','badge','title','avatar','frame','effect','cosmetic')),
  title text NOT NULL,
  description text,
  image_url text,
  amount integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, level, track)
);
GRANT SELECT ON public.battle_pass_rewards TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.battle_pass_rewards TO authenticated;
GRANT ALL ON public.battle_pass_rewards TO service_role;
ALTER TABLE public.battle_pass_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_rewards_read" ON public.battle_pass_rewards FOR SELECT USING (true);
CREATE POLICY "bp_rewards_admin" ON public.battle_pass_rewards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ USER PROGRESS ============
CREATE TABLE public.battle_pass_user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  wins integer NOT NULL DEFAULT 0,
  duels_played integer NOT NULL DEFAULT 0,
  tournament_wins integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);
GRANT SELECT ON public.battle_pass_user_progress TO anon, authenticated;
GRANT ALL ON public.battle_pass_user_progress TO service_role;
ALTER TABLE public.battle_pass_user_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_progress_read" ON public.battle_pass_user_progress FOR SELECT USING (true);
CREATE POLICY "bp_progress_admin" ON public.battle_pass_user_progress FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ WIN EVENTS (dedup) ============
CREATE TABLE public.battle_pass_win_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('duel','tournament')),
  source_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'win' CHECK (kind IN ('win','played')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id, source, source_id, kind)
);
GRANT SELECT ON public.battle_pass_win_events TO authenticated;
GRANT ALL ON public.battle_pass_win_events TO service_role;
ALTER TABLE public.battle_pass_win_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_events_own" ON public.battle_pass_win_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ PURCHASES ============
CREATE TABLE public.battle_pass_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  price_duelcoins integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id)
);
GRANT SELECT ON public.battle_pass_purchases TO authenticated;
GRANT ALL ON public.battle_pass_purchases TO service_role;
ALTER TABLE public.battle_pass_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_purchases_own" ON public.battle_pass_purchases FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "bp_purchases_admin" ON public.battle_pass_purchases FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ REWARD CLAIMS ============
CREATE TABLE public.battle_pass_reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.battle_pass_rewards(id) ON DELETE CASCADE,
  season_id uuid NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reward_id, user_id)
);
GRANT SELECT ON public.battle_pass_reward_claims TO authenticated;
GRANT ALL ON public.battle_pass_reward_claims TO service_role;
ALTER TABLE public.battle_pass_reward_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_claims_own" ON public.battle_pass_reward_claims FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ MISSIONS ============
CREATE TABLE public.battle_pass_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.battle_pass_seasons(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('daily','weekly','season')),
  metric text NOT NULL CHECK (metric IN ('wins','duels','tournament_wins','tournaments')),
  title text NOT NULL,
  goal integer NOT NULL DEFAULT 1,
  reward_duelcoins integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.battle_pass_missions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.battle_pass_missions TO authenticated;
GRANT ALL ON public.battle_pass_missions TO service_role;
ALTER TABLE public.battle_pass_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_missions_read" ON public.battle_pass_missions FOR SELECT USING (true);
CREATE POLICY "bp_missions_admin" ON public.battle_pass_missions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.battle_pass_user_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES public.battle_pass_missions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  period_key text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, user_id, period_key)
);
GRANT SELECT ON public.battle_pass_user_missions TO authenticated;
GRANT ALL ON public.battle_pass_user_missions TO service_role;
ALTER TABLE public.battle_pass_user_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_user_missions_own" ON public.battle_pass_user_missions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============ updated_at triggers ============
CREATE TRIGGER bp_seasons_updated BEFORE UPDATE ON public.battle_pass_seasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bp_levels_updated BEFORE UPDATE ON public.battle_pass_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bp_rewards_updated BEFORE UPDATE ON public.battle_pass_rewards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bp_progress_updated BEFORE UPDATE ON public.battle_pass_user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bp_missions_updated BEFORE UPDATE ON public.battle_pass_missions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER bp_user_missions_updated BEFORE UPDATE ON public.battle_pass_user_missions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CORE FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.bp_current_season_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.battle_pass_seasons
  WHERE is_active AND now() >= starts_at AND now() <= ends_at
  ORDER BY season_number DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.bp_level_for_wins(p_season_id uuid, p_wins integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(max(level), 1) FROM public.battle_pass_levels
  WHERE season_id = p_season_id AND wins_required <= greatest(p_wins, 0);
$$;

CREATE OR REPLACE FUNCTION public.bp_period_key(p_scope text)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE p_scope
    WHEN 'daily' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    WHEN 'weekly' THEN to_char(now() AT TIME ZONE 'UTC', 'IYYY-"W"IW')
    ELSE 'season' END;
$$;

CREATE OR REPLACE FUNCTION public.bp_bump_missions(p_season_id uuid, p_user_id uuid, p_metric text, p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m RECORD; v_key text;
BEGIN
  FOR m IN SELECT * FROM public.battle_pass_missions
           WHERE season_id = p_season_id AND is_active AND metric = p_metric LOOP
    v_key := public.bp_period_key(m.scope);
    INSERT INTO public.battle_pass_user_missions (mission_id, user_id, period_key, progress)
    VALUES (m.id, p_user_id, v_key, greatest(p_amount, 0))
    ON CONFLICT (mission_id, user_id, period_key)
    DO UPDATE SET progress = public.battle_pass_user_missions.progress + greatest(p_amount, 0),
                  updated_at = now();
    UPDATE public.battle_pass_user_missions
       SET completed_at = now()
     WHERE mission_id = m.id AND user_id = p_user_id AND period_key = v_key
       AND completed_at IS NULL AND progress >= m.goal;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.bp_register_event(p_user_id uuid, p_source text, p_source_id uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season_id uuid;
  v_count_tournaments boolean;
  v_inserted uuid;
  v_wins integer;
BEGIN
  IF p_user_id IS NULL OR p_source_id IS NULL THEN RETURN; END IF;
  v_season_id := public.bp_current_season_id();
  IF v_season_id IS NULL THEN RETURN; END IF;

  SELECT count_tournament_wins INTO v_count_tournaments
  FROM public.battle_pass_seasons WHERE id = v_season_id;

  IF p_source = 'tournament' AND NOT coalesce(v_count_tournaments, true) THEN RETURN; END IF;

  INSERT INTO public.battle_pass_win_events (season_id, user_id, source, source_id, kind)
  VALUES (v_season_id, p_user_id, p_source, p_source_id, p_kind)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN RETURN; END IF;

  INSERT INTO public.battle_pass_user_progress (season_id, user_id, wins, duels_played, tournament_wins)
  VALUES (v_season_id, p_user_id, 0, 0, 0)
  ON CONFLICT (season_id, user_id) DO NOTHING;

  IF p_kind = 'win' THEN
    UPDATE public.battle_pass_user_progress
       SET wins = wins + 1,
           tournament_wins = tournament_wins + CASE WHEN p_source = 'tournament' THEN 1 ELSE 0 END,
           updated_at = now()
     WHERE season_id = v_season_id AND user_id = p_user_id
     RETURNING wins INTO v_wins;

    UPDATE public.battle_pass_user_progress
       SET level = public.bp_level_for_wins(v_season_id, v_wins)
     WHERE season_id = v_season_id AND user_id = p_user_id;

    PERFORM public.bp_bump_missions(v_season_id, p_user_id, 'wins', 1);
    IF p_source = 'tournament' THEN
      PERFORM public.bp_bump_missions(v_season_id, p_user_id, 'tournament_wins', 1);
    END IF;
  ELSE
    UPDATE public.battle_pass_user_progress
       SET duels_played = duels_played + 1, updated_at = now()
     WHERE season_id = v_season_id AND user_id = p_user_id;
    IF p_source = 'tournament' THEN
      PERFORM public.bp_bump_missions(v_season_id, p_user_id, 'tournaments', 1);
    ELSE
      PERFORM public.bp_bump_missions(v_season_id, p_user_id, 'duels', 1);
    END IF;
  END IF;
END;
$$;

-- ============ TRIGGERS ON MATCHES ============
CREATE OR REPLACE FUNCTION public.bp_on_match_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.duel_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.bp_register_event(NEW.player1_id, 'duel', NEW.duel_id, 'played');
  PERFORM public.bp_register_event(NEW.player2_id, 'duel', NEW.duel_id, 'played');
  IF NEW.winner_id IS NOT NULL THEN
    PERFORM public.bp_register_event(NEW.winner_id, 'duel', NEW.duel_id, 'win');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bp_match_history_progress
AFTER INSERT OR UPDATE OF winner_id ON public.match_history
FOR EACH ROW EXECUTE FUNCTION public.bp_on_match_history();

CREATE OR REPLACE FUNCTION public.bp_on_tournament_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.winner_id IS NOT NULL
     AND NEW.player1_id IS NOT NULL AND NEW.player2_id IS NOT NULL THEN
    PERFORM public.bp_register_event(NEW.winner_id, 'tournament', NEW.id, 'win');
    PERFORM public.bp_register_event(NEW.player1_id, 'tournament', NEW.id, 'played');
    PERFORM public.bp_register_event(NEW.player2_id, 'tournament', NEW.id, 'played');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bp_tournament_match_progress
AFTER INSERT OR UPDATE OF winner_id, status ON public.tournament_matches
FOR EACH ROW EXECUTE FUNCTION public.bp_on_tournament_match();

-- ============ CLIENT RPCs ============
CREATE OR REPLACE FUNCTION public.bp_get_overview(p_season_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season public.battle_pass_seasons;
  v_uid uuid := auth.uid();
  v_progress public.battle_pass_user_progress;
  v_has_pro boolean := false;
BEGIN
  IF p_season_id IS NULL THEN
    SELECT * INTO v_season FROM public.battle_pass_seasons WHERE id = public.bp_current_season_id();
    IF v_season.id IS NULL THEN
      SELECT * INTO v_season FROM public.battle_pass_seasons ORDER BY season_number DESC LIMIT 1;
    END IF;
  ELSE
    SELECT * INTO v_season FROM public.battle_pass_seasons WHERE id = p_season_id;
  END IF;

  IF v_season.id IS NULL THEN RETURN jsonb_build_object('season', NULL); END IF;

  SELECT * INTO v_progress FROM public.battle_pass_user_progress
   WHERE season_id = v_season.id AND user_id = v_uid;

  SELECT EXISTS (SELECT 1 FROM public.battle_pass_purchases
                  WHERE season_id = v_season.id AND user_id = v_uid) INTO v_has_pro;

  RETURN jsonb_build_object(
    'season', to_jsonb(v_season),
    'progress', jsonb_build_object(
      'wins', coalesce(v_progress.wins, 0),
      'duels_played', coalesce(v_progress.duels_played, 0),
      'tournament_wins', coalesce(v_progress.tournament_wins, 0),
      'level', coalesce(v_progress.level, 1)
    ),
    'has_pro', v_has_pro,
    'levels', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'level', l.level,
        'wins_required', l.wins_required,
        'rewards', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'id', r.id, 'track', r.track, 'reward_type', r.reward_type,
            'title', r.title, 'description', r.description, 'image_url', r.image_url,
            'amount', r.amount,
            'claimed', EXISTS (SELECT 1 FROM public.battle_pass_reward_claims c
                                WHERE c.reward_id = r.id AND c.user_id = v_uid)
          ) ORDER BY r.track)
          FROM public.battle_pass_rewards r
          WHERE r.season_id = v_season.id AND r.level = l.level
        ), '[]'::jsonb)
      ) ORDER BY l.level)
      FROM public.battle_pass_levels l WHERE l.season_id = v_season.id
    ), '[]'::jsonb),
    'missions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'scope', m.scope, 'metric', m.metric, 'title', m.title,
        'goal', m.goal, 'reward_duelcoins', m.reward_duelcoins,
        'progress', coalesce(um.progress, 0),
        'completed', um.completed_at IS NOT NULL,
        'claimed', um.claimed_at IS NOT NULL
      ) ORDER BY m.scope, m.sort_order)
      FROM public.battle_pass_missions m
      LEFT JOIN public.battle_pass_user_missions um
        ON um.mission_id = m.id AND um.user_id = v_uid
       AND um.period_key = public.bp_period_key(m.scope)
      WHERE m.season_id = v_season.id AND m.is_active
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bp_claim_reward(p_reward_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reward public.battle_pass_rewards;
  v_wins integer := 0;
  v_required integer;
  v_has_pro boolean;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT * INTO v_reward FROM public.battle_pass_rewards WHERE id = p_reward_id;
  IF v_reward.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Recompensa não encontrada'); END IF;

  SELECT wins INTO v_wins FROM public.battle_pass_user_progress
   WHERE season_id = v_reward.season_id AND user_id = v_uid;
  SELECT wins_required INTO v_required FROM public.battle_pass_levels
   WHERE season_id = v_reward.season_id AND level = v_reward.level;

  IF coalesce(v_wins, 0) < coalesce(v_required, 0) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Nível ainda bloqueado');
  END IF;

  IF v_reward.track = 'pro' THEN
    SELECT EXISTS (SELECT 1 FROM public.battle_pass_purchases
                    WHERE season_id = v_reward.season_id AND user_id = v_uid) INTO v_has_pro;
    IF NOT v_has_pro THEN
      RETURN jsonb_build_object('success', false, 'message', 'Requer Battle Pass PRO');
    END IF;
  END IF;

  INSERT INTO public.battle_pass_reward_claims (reward_id, season_id, user_id)
  VALUES (v_reward.id, v_reward.season_id, v_uid)
  ON CONFLICT (reward_id, user_id) DO NOTHING;

  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'message', 'Recompensa já resgatada'); END IF;

  IF v_reward.reward_type = 'duelcoins' AND v_reward.amount > 0 THEN
    UPDATE public.profiles SET duelcoins_balance = coalesce(duelcoins_balance, 0) + v_reward.amount
     WHERE user_id = v_uid;
    INSERT INTO public.duelcoins_transactions (receiver_id, amount, transaction_type, description)
    VALUES (v_uid, v_reward.amount, 'battle_pass_reward', 'Battle Pass: ' || v_reward.title);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Recompensa resgatada');
END;
$$;

CREATE OR REPLACE FUNCTION public.bp_claim_mission(p_mission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mission public.battle_pass_missions;
  v_key text;
  v_row public.battle_pass_user_missions;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT * INTO v_mission FROM public.battle_pass_missions WHERE id = p_mission_id AND is_active;
  IF v_mission.id IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Missão não encontrada'); END IF;
  v_key := public.bp_period_key(v_mission.scope);

  SELECT * INTO v_row FROM public.battle_pass_user_missions
   WHERE mission_id = v_mission.id AND user_id = v_uid AND period_key = v_key FOR UPDATE;

  IF v_row.id IS NULL OR v_row.progress < v_mission.goal THEN
    RETURN jsonb_build_object('success', false, 'message', 'Missão ainda não concluída');
  END IF;
  IF v_row.claimed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Recompensa já resgatada');
  END IF;

  UPDATE public.battle_pass_user_missions SET claimed_at = now(), updated_at = now() WHERE id = v_row.id;

  IF v_mission.reward_duelcoins > 0 THEN
    UPDATE public.profiles SET duelcoins_balance = coalesce(duelcoins_balance, 0) + v_mission.reward_duelcoins
     WHERE user_id = v_uid;
    INSERT INTO public.duelcoins_transactions (receiver_id, amount, transaction_type, description)
    VALUES (v_uid, v_mission.reward_duelcoins, 'battle_pass_mission', 'Missão: ' || v_mission.title);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Missão resgatada');
END;
$$;

CREATE OR REPLACE FUNCTION public.bp_purchase_pro(p_season_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_price integer;
  v_balance integer;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT pro_price_duelcoins INTO v_price FROM public.battle_pass_seasons WHERE id = p_season_id;
  IF v_price IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Temporada inválida'); END IF;

  IF EXISTS (SELECT 1 FROM public.battle_pass_purchases WHERE season_id = p_season_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Você já possui o Battle Pass PRO');
  END IF;

  SELECT duelcoins_balance INTO v_balance FROM public.profiles WHERE user_id = v_uid FOR UPDATE;
  IF coalesce(v_balance, 0) < v_price THEN
    RETURN jsonb_build_object('success', false, 'message', 'DuelCoins insuficientes');
  END IF;

  UPDATE public.profiles SET duelcoins_balance = duelcoins_balance - v_price WHERE user_id = v_uid;
  INSERT INTO public.battle_pass_purchases (season_id, user_id, price_duelcoins) VALUES (p_season_id, v_uid, v_price);
  INSERT INTO public.duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_uid, v_price, 'battle_pass_pro', 'Compra do Battle Pass PRO');

  RETURN jsonb_build_object('success', true, 'message', 'Battle Pass PRO ativado');
END;
$$;

CREATE OR REPLACE FUNCTION public.bp_admin_set_progress(p_season_id uuid, p_user_id uuid, p_wins integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sem permissão');
  END IF;
  INSERT INTO public.battle_pass_user_progress (season_id, user_id, wins, level)
  VALUES (p_season_id, p_user_id, greatest(p_wins, 0), public.bp_level_for_wins(p_season_id, greatest(p_wins, 0)))
  ON CONFLICT (season_id, user_id) DO UPDATE
    SET wins = greatest(p_wins, 0),
        level = public.bp_level_for_wins(p_season_id, greatest(p_wins, 0)),
        updated_at = now();
  RETURN jsonb_build_object('success', true, 'message', 'Progresso atualizado');
END;
$$;

-- ============ SEED SEASON 01 ============
DO $$
DECLARE v_season uuid; i integer; v_req integer;
BEGIN
  INSERT INTO public.battle_pass_seasons (name, season_number, is_active, starts_at, ends_at)
  VALUES ('Season 01', 1, true, now(), now() + interval '90 days')
  RETURNING id INTO v_season;

  FOR i IN 1..50 LOOP
    IF i = 50 THEN v_req := 150;
    ELSIF i <= 25 THEN v_req := (i - 1) * 2;
    ELSE v_req := 48 + (i - 25) * 4;
    END IF;

    INSERT INTO public.battle_pass_levels (season_id, level, wins_required) VALUES (v_season, i, v_req);

    INSERT INTO public.battle_pass_rewards (season_id, level, track, reward_type, title, amount)
    VALUES (
      v_season, i, 'free',
      CASE WHEN i % 10 = 0 THEN 'badge' WHEN i % 5 = 0 THEN 'sleeve' ELSE 'duelcoins' END,
      CASE WHEN i % 10 = 0 THEN 'Badge Season 01 - Nível ' || i
           WHEN i % 5 = 0 THEN 'Sleeve Season 01 - Nível ' || i
           ELSE (50 + i * 5) || ' DuelCoins' END,
      CASE WHEN i % 5 = 0 THEN 0 ELSE 50 + i * 5 END
    );

    INSERT INTO public.battle_pass_rewards (season_id, level, track, reward_type, title, amount)
    VALUES (
      v_season, i, 'pro',
      CASE WHEN i % 10 = 0 THEN 'playmat' WHEN i % 7 = 0 THEN 'effect'
           WHEN i % 5 = 0 THEN 'frame' WHEN i % 3 = 0 THEN 'title' ELSE 'duelcoins' END,
      CASE WHEN i % 10 = 0 THEN 'Playmat Exclusivo - Nível ' || i
           WHEN i % 7 = 0 THEN 'Efeito de Life Points - Nível ' || i
           WHEN i % 5 = 0 THEN 'Moldura de Perfil - Nível ' || i
           WHEN i % 3 = 0 THEN 'Título Exclusivo - Nível ' || i
           ELSE (150 + i * 10) || ' DuelCoins' END,
      CASE WHEN i % 10 = 0 OR i % 7 = 0 OR i % 5 = 0 OR i % 3 = 0 THEN 0 ELSE 150 + i * 10 END
    );
  END LOOP;

  INSERT INTO public.battle_pass_missions (season_id, scope, metric, title, goal, reward_duelcoins, sort_order) VALUES
    (v_season, 'daily', 'wins', 'Vença 2 duelos', 2, 50, 1),
    (v_season, 'daily', 'duels', 'Jogue 3 duelos', 3, 30, 2),
    (v_season, 'weekly', 'wins', 'Vença 10 duelos', 10, 200, 1),
    (v_season, 'weekly', 'tournaments', 'Participe de 2 torneios', 2, 250, 2),
    (v_season, 'season', 'wins', 'Alcance 25 vitórias', 25, 500, 1),
    (v_season, 'season', 'wins', 'Alcance 50 vitórias', 50, 1000, 2),
    (v_season, 'season', 'wins', 'Alcance 100 vitórias', 100, 2500, 3);
END $$;
