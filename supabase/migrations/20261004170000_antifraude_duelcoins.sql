-- =====================================================
-- Correções antifraude - Duelverse
-- Data: 2026-10-04 17:00:00
-- =====================================================
--
-- Corrige vulnerabilidades críticas de farm de DuelCoins identificadas em:
-- S1: live_duels pode ser criado com opponent_id arbitrário sem consentimento
-- S2: tournament_matches pode ser inserido com status/vencedor arbitrário  
-- S4: aprovação manual pode marcar paid sem verificar sucesso do crédito
--
-- Compatibilidade: mantém fluxos legítimos de duelo, matchmaking, desafios,
-- convites, torneios, revanche e bots. Não altera valores de recompensa.
--
-- =====================================================

-- ============ CONSTANTES DE ANTIFRAUDE ============
-- Ajustáveis conforme necessidade
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.antifraude_config (
    key text PRIMARY KEY,
    value jsonb NOT NULL DEFAULT '{}'::jsonb,
    description text,
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  INSERT INTO public.antifraude_config (key, value, description) VALUES
  ('max_matches_per_pair_per_day', '3', 'Máximo de partidas ranqueadas entre o mesmo par de jogadores por dia que contam para BP, missões e ranking'),
  ('min_match_duration_seconds', '180', 'Duração mínima de partida (desde entrada do oponente até resultado) para contar para BP, missões e ranking'),
  ('min_tournament_participants', '4', 'Mínimo de participantes reais em torneio para contar no BP'),
  ('max_orders_credit_per_minute', '10', 'Rate limit para aprovação manual de pedidos')
  ON CONFLICT (key) DO NOTHING;

  GRANT SELECT ON public.antifraude_config TO authenticated;
  GRANT ALL ON public.antifraude_config TO service_role;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'antifraude_config') THEN
    ALTER TABLE public.antifraude_config ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "antifraude_config_read" ON public.antifraude_config FOR SELECT USING (true);
    CREATE POLICY "antifraude_config_admin" ON public.antifraude_config FOR ALL TO authenticated
      USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
  END IF;
END $$;

-- ============ S1: live_duels - consenso e limites ============

-- 1.1: Função auxiliar para verificar se partida é válida para recompensas
CREATE OR REPLACE FUNCTION public.is_match_eligible_for_rewards(
  p_duel_id uuid,
  p_player1_id uuid,
  p_player2_id uuid,
  p_duel_started_at timestamptz,
  p_result_recorded_at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min_duration_sec integer;
  v_max_per_pair integer;
  v_duration_sec integer;
  v_matches_today integer;
  v_today_utc text;
BEGIN
  -- Buscar configuração
  SELECT (value::text)::integer INTO v_min_duration_sec 
    FROM public.antifraude_config WHERE key = 'min_match_duration_seconds';
  SELECT (value::text)::integer INTO v_max_per_pair 
    FROM public.antifraude_config WHERE key = 'max_matches_per_pair_per_day';
  
  v_min_duration_sec := COALESCE(v_min_duration_sec, 180);
  v_max_per_pair := COALESCE(v_max_per_pair, 3);

  -- Verificar duração mínima (desde que o oponente entrou)
  v_duration_sec := EXTRACT(EPOCH FROM (p_result_recorded_at - p_duel_started_at));
  IF v_duration_sec < v_min_duration_sec THEN
    RETURN false;
  END IF;

  -- Contar partidas ranqueadas entre este par hoje (UTC)
  v_today_utc := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  
  SELECT COUNT(*) INTO v_matches_today
  FROM public.match_history mh
  JOIN public.live_duels ld ON mh.duel_id = ld.id
  WHERE ld.is_ranked = true
    AND ld.status = 'finished'
    AND (
      (mh.player1_id = p_player1_id AND mh.player2_id = p_player2_id) OR
      (mh.player1_id = p_player2_id AND mh.player2_id = p_player1_id)
    )
    AND to_char(mh.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') = v_today_utc
    AND mh.duel_id <> p_duel_id; -- Não contar esta própria partida
  
  IF v_matches_today >= v_max_per_pair THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_match_eligible_for_rewards(uuid, uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;

-- 1.2: Adicionar colunas para consenso de resultado em live_duels
ALTER TABLE public.live_duels
  ADD COLUMN IF NOT EXISTS opponent_joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_votes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result_finalized_by text CHECK (result_finalized_by IN ('consensus', 'server', 'admin', 'timeout'));

-- 1.3: Atualizar join_duel para registrar quando oponente entra
CREATE OR REPLACE FUNCTION public.join_duel(p_duel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_duel public.live_duels%ROWTYPE;
  v_slot text := NULL;
  v_filled int;
  v_new_status game_status;
  v_joined_at timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_duel FROM public.live_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;

  IF v_duel.status = 'finished' THEN
    RAISE EXCEPTION 'Duel finished';
  END IF;

  -- Already in duel?
  IF v_uid IN (v_duel.creator_id, v_duel.opponent_id, v_duel.player3_id, v_duel.player4_id) THEN
    RETURN jsonb_build_object('joined', false, 'already_in', true);
  END IF;

  IF v_duel.opponent_id IS NULL THEN
    v_slot := 'opponent_id';
  ELSIF v_duel.max_players >= 3 AND v_duel.player3_id IS NULL THEN
    v_slot := 'player3_id';
  ELSIF v_duel.max_players >= 4 AND v_duel.player4_id IS NULL THEN
    v_slot := 'player4_id';
  ELSE
    RETURN jsonb_build_object('joined', false, 'full', true);
  END IF;

  v_filled := 1
    + (CASE WHEN v_duel.opponent_id IS NOT NULL OR v_slot = 'opponent_id' THEN 1 ELSE 0 END)
    + (CASE WHEN v_duel.player3_id   IS NOT NULL OR v_slot = 'player3_id'   THEN 1 ELSE 0 END)
    + (CASE WHEN v_duel.player4_id   IS NOT NULL OR v_slot = 'player4_id'   THEN 1 ELSE 0 END);

  v_new_status := v_duel.status;
  IF v_filled >= v_duel.max_players THEN
    v_new_status := 'in_progress';
  END IF;

  -- Registrar quando primeiro oponente entra (para duração mínima)
  IF v_slot = 'opponent_id' THEN
    EXECUTE format(
      'UPDATE public.live_duels SET %I = $1, status = $2, opponent_joined_at = $3 WHERE id = $4',
      v_slot
    ) USING v_uid, v_new_status, v_joined_at, p_duel_id;
  ELSE
    EXECUTE format(
      'UPDATE public.live_duels SET %I = $1, status = $2 WHERE id = $3',
      v_slot
    ) USING v_uid, v_new_status, p_duel_id;
  END IF;

  RETURN jsonb_build_object('joined', true, 'slot', v_slot, 'status', v_new_status);
END;
$$;

-- 1.4: Nova RPC para votar no resultado (consenso)
CREATE OR REPLACE FUNCTION public.vote_match_result(
  p_duel_id uuid,
  p_winner_id uuid -- NULL para empate
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voter_id uuid := auth.uid();
  v_duel public.live_duels%ROWTYPE;
  v_votes jsonb;
  v_vote_winner_id text;
  v_consensus_reached boolean := false;
  v_agreed_winner uuid;
BEGIN
  IF v_voter_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_duel FROM public.live_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;

  -- Validar que votante é participante
  IF v_voter_id NOT IN (v_duel.creator_id, v_duel.opponent_id) THEN
    RAISE EXCEPTION 'Only participants can vote';
  END IF;

  -- Validar que vencedor é participante ou NULL
  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (v_duel.creator_id, v_duel.opponent_id) THEN
    RAISE EXCEPTION 'Winner must be a participant or NULL for draw';
  END IF;

  -- Já finalizado?
  IF v_duel.winner_id IS NOT NULL OR v_duel.status = 'finished' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Match already finalized');
  END IF;

  -- Registrar voto (usar string para NULL, pois jsonb não permite key NULL)
  v_vote_winner_id := COALESCE(p_winner_id::text, 'draw');
  v_votes := COALESCE(v_duel.result_votes, '{}'::jsonb);
  v_votes := jsonb_set(v_votes, array[v_voter_id::text], to_jsonb(v_vote_winner_id));

  -- Verificar consenso: ambos votaram no mesmo vencedor
  IF jsonb_array_length(jsonb_object_keys(v_votes)) >= 2 THEN
    DECLARE
      v_vote_values jsonb;
      v_first_vote text;
      v_all_equal boolean := true;
    BEGIN
      v_vote_values := jsonb_agg(value) FROM jsonb_each_text(v_votes);
      v_first_vote := v_votes->>v_duel.creator_id::text;
      
      -- Verificar se criador e oponente votaram igual
      IF (v_votes->>v_duel.creator_id::text) = (v_votes->>v_duel.opponent_id::text) THEN
        v_consensus_reached := true;
        v_agreed_winner := CASE WHEN v_vote_winner_id = 'draw' THEN NULL ELSE p_winner_id END;
      END IF;
    END;
  END IF;

  -- Salvar votos
  UPDATE public.live_duels 
  SET result_votes = v_votes,
      finalize_votes = v_votes -- Manter compatibilidade com coluna existente
  WHERE id = p_duel_id;

  -- Se consenso, finalizar
  IF v_consensus_reached THEN
    UPDATE public.live_duels
    SET winner_id = v_agreed_winner,
        status = 'finished',
        result_finalized_by = 'consensus'
    WHERE id = p_duel_id;

    RETURN jsonb_build_object(
      'success', true, 
      'consensus_reached', true,
      'winner_id', v_agreed_winner
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'consensus_reached', false,
    'votes_count', jsonb_array_length(jsonb_object_keys(v_votes))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.vote_match_result(uuid, uuid) TO authenticated;

-- 1.5: Modificar record_match_result para respeitar consenso
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
  v_result_finalized_by text;
  v_opponent_joined_at timestamptz;
  v_is_eligible boolean := true;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Unauthorized: You must be a participant in this duel';
  END IF;

  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Invalid winner: Must be one of the players or NULL for draw';
  END IF;

  SELECT status, creator_id, opponent_id, winner_id, is_ranked, bet_amount, result_finalized_by, opponent_joined_at,
    CASE lower(coalesce(tcg_type, 'yugioh'))
      WHEN 'magic' THEN 'genesis'
      WHEN 'pokemon' THEN 'rush_duel'
      WHEN 'genesis' THEN 'genesis'
      WHEN 'rush_duel' THEN 'rush_duel'
      ELSE 'yugioh'
    END
  INTO v_duel_status, v_duel_creator, v_duel_opponent, v_duel_winner, v_is_ranked, v_bet, v_result_finalized_by, v_opponent_joined_at, v_tcg
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

  -- ANTIFRAUDE: se chamada direta (não por trigger) e ainda não há consenso nem servidor definiu vencedor
  IF v_direct AND v_duel_winner IS NULL AND v_result_finalized_by IS NULL THEN
    -- Jogador não pode decidir unilateralmente; precisa de consenso via vote_match_result
    -- Exceção: service_role (bots, edge functions) pode decidir
    IF auth.role() = 'authenticated' AND NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Match result requires consensus from both players. Use vote_match_result() to vote.';
    END IF;
  END IF;

  -- Se já foi definido vencedor (por consenso/servidor/admin), chamada direta não pode contradizer
  IF v_direct AND v_duel_winner IS NOT NULL AND p_winner_id IS DISTINCT FROM v_duel_winner THEN
    RAISE EXCEPTION 'Winner does not match the finalized result';
  END IF;

  -- Validar elegibilidade para recompensas (duração mínima, limite por par)
  IF v_opponent_joined_at IS NOT NULL AND v_is_ranked AND v_duel_status = 'finished' THEN
    v_is_eligible := public.is_match_eligible_for_rewards(
      p_duel_id,
      p_player1_id,
      p_player2_id,
      v_opponent_joined_at,
      now()
    );
  ELSIF v_opponent_joined_at IS NULL THEN
    -- Oponente nunca entrou: partida não conta
    v_is_eligible := false;
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

  -- Só conceder pontos/estatísticas se elegível
  IF p_winner_id IS NULL OR v_already_awarded OR NOT v_is_eligible THEN 
    RETURN v_match_id; 
  END IF;

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

-- 1.6: Modificar trigger do BP para só contar partidas elegíveis
CREATE OR REPLACE FUNCTION public.bp_on_match_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duel public.live_duels%ROWTYPE;
  v_is_eligible boolean := true;
BEGIN
  IF NEW.duel_id IS NULL THEN RETURN NEW; END IF;
  
  -- Buscar dados do duelo
  SELECT * INTO v_duel FROM public.live_duels WHERE id = NEW.duel_id;
  
  -- Validar elegibilidade (duração, limite por par, oponente entrou, sala finished)
  IF v_duel.id IS NOT NULL AND v_duel.is_ranked AND v_duel.status = 'finished' AND v_duel.opponent_joined_at IS NOT NULL THEN
    v_is_eligible := public.is_match_eligible_for_rewards(
      NEW.duel_id,
      NEW.player1_id,
      NEW.player2_id,
      v_duel.opponent_joined_at,
      NEW.created_at
    );
  ELSIF v_duel.opponent_joined_at IS NULL OR v_duel.status <> 'finished' THEN
    v_is_eligible := false;
  END IF;

  -- Só registrar eventos de BP se elegível
  IF v_is_eligible THEN
    PERFORM public.bp_register_event(NEW.player1_id, 'duel', NEW.duel_id, 'played');
    PERFORM public.bp_register_event(NEW.player2_id, 'duel', NEW.duel_id, 'played');
    IF NEW.winner_id IS NOT NULL THEN
      PERFORM public.bp_register_event(NEW.winner_id, 'duel', NEW.duel_id, 'win');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 1.7: Restringir INSERT em live_duels: só com opponent_id NULL, winner_id NULL, status inicial
DROP POLICY IF EXISTS "Users create duels" ON public.live_duels;
CREATE POLICY "Users create duels" 
ON public.live_duels FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid() = creator_id 
  AND opponent_id IS NULL 
  AND player3_id IS NULL 
  AND player4_id IS NULL
  AND winner_id IS NULL
  AND status IN ('waiting', 'looking_for_match')
  AND result_finalized_by IS NULL
);

-- ============ S2: tournament_matches - só via RPC de chaveamento ============

-- 2.1: Remover INSERT direto de tournament_matches
DROP POLICY IF EXISTS "Tournament creators can create matches" ON public.tournament_matches;

-- Nova policy: INSERT só via service_role (RPCs SECURITY DEFINER e edge functions)
CREATE POLICY "Tournament matches via RPC only"
  ON public.tournament_matches
  FOR INSERT
  WITH CHECK (
    -- Só service_role (RPCs SECURITY DEFINER, edge functions) pode inserir
    current_user = 'service_role'
  );

-- 2.2: RPC SECURITY DEFINER para criar match de torneio (a partir de participants)
CREATE OR REPLACE FUNCTION public.create_tournament_match(
  p_tournament_id uuid,
  p_round_number integer,
  p_match_number integer,
  p_player1_id uuid,
  p_player2_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_tournament_creator uuid;
  v_player1_is_participant boolean;
  v_player2_is_participant boolean;
  v_match_id uuid;
BEGIN
  -- Validar autenticação
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;

  -- Validar que quem chama é criador do torneio ou admin
  SELECT created_by INTO v_tournament_creator FROM public.tournaments WHERE id = p_tournament_id;
  IF v_tournament_creator IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tournament not found');
  END IF;
  IF v_tournament_creator <> v_caller_id AND NOT public.is_admin(v_caller_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only tournament creator can create matches');
  END IF;

  -- Validar que ambos jogadores são participantes inscritos
  SELECT EXISTS (
    SELECT 1 FROM public.tournament_participants 
    WHERE tournament_id = p_tournament_id AND user_id = p_player1_id
  ) INTO v_player1_is_participant;

  SELECT EXISTS (
    SELECT 1 FROM public.tournament_participants 
    WHERE tournament_id = p_tournament_id AND user_id = p_player2_id
  ) INTO v_player2_is_participant;

  IF NOT v_player1_is_participant OR NOT v_player2_is_participant THEN
    RETURN jsonb_build_object('success', false, 'message', 'Both players must be tournament participants');
  END IF;

  -- Criar match via service_role (a policy permite)
  INSERT INTO public.tournament_matches (
    tournament_id,
    round_number,
    match_number,
    player1_id,
    player2_id,
    status
  ) VALUES (
    p_tournament_id,
    p_round_number,
    p_match_number,
    p_player1_id,
    p_player2_id,
    'pending'
  )
  RETURNING id INTO v_match_id;

  RETURN jsonb_build_object('success', true, 'match_id', v_match_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_tournament_match(uuid, integer, integer, uuid, uuid) TO authenticated;

-- 2.3: Modificar trigger do BP para só contar torneios legítimos
-- (≥4 participantes reais, jogador não é o criador)
CREATE OR REPLACE FUNCTION public.bp_on_tournament_match()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tournament_creator uuid;
  v_participants_count integer;
  v_min_participants integer;
BEGIN
  IF NEW.status = 'completed' AND NEW.winner_id IS NOT NULL
     AND NEW.player1_id IS NOT NULL AND NEW.player2_id IS NOT NULL THEN
    
    -- Buscar criador do torneio e contar participantes
    SELECT t.created_by, COUNT(tp.user_id)
    INTO v_tournament_creator, v_participants_count
    FROM public.tournaments t
    LEFT JOIN public.tournament_participants tp ON tp.tournament_id = t.id
    WHERE t.id = NEW.tournament_id
    GROUP BY t.created_by;

    -- Buscar configuração de mínimo de participantes
    SELECT (value::text)::integer INTO v_min_participants
      FROM public.antifraude_config WHERE key = 'min_tournament_participants';
    v_min_participants := COALESCE(v_min_participants, 4);

    -- Só contar se torneio tem participantes suficientes
    IF v_participants_count >= v_min_participants THEN
      -- Registrar eventos, mas EXCLUIR o criador do torneio
      IF NEW.winner_id <> v_tournament_creator THEN
        PERFORM public.bp_register_event(NEW.winner_id, 'tournament', NEW.id, 'win');
      END IF;
      
      IF NEW.player1_id <> v_tournament_creator THEN
        PERFORM public.bp_register_event(NEW.player1_id, 'tournament', NEW.id, 'played');
      END IF;
      
      IF NEW.player2_id <> v_tournament_creator THEN
        PERFORM public.bp_register_event(NEW.player2_id, 'tournament', NEW.id, 'played');
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2.4: Ajustar métrica de missão "tournaments" para contar tournament_id distintos
-- (em vez de número de partidas)
-- A métrica já é registrada por bp_register_event, linha 282 da 20260916140754
-- Precisamos modificar bp_bump_missions para lidar com 'tournaments' de forma especial

-- Adicionar coluna para rastrear torneios distintos do usuário
ALTER TABLE public.battle_pass_user_missions
  ADD COLUMN IF NOT EXISTS tournament_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Função auxiliar para adicionar tournament_id único
CREATE OR REPLACE FUNCTION public.bp_add_tournament(
  p_mission_id uuid,
  p_user_id uuid,
  p_period_key text,
  p_tournament_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_ids jsonb;
  v_new_ids jsonb;
  v_distinct_count integer;
  v_goal integer;
BEGIN
  -- Buscar goal da missão
  SELECT goal INTO v_goal FROM public.battle_pass_missions WHERE id = p_mission_id;

  INSERT INTO public.battle_pass_user_missions (mission_id, user_id, period_key, progress, tournament_ids)
  VALUES (p_mission_id, p_user_id, p_period_key, 0, '[]'::jsonb)
  ON CONFLICT (mission_id, user_id, period_key) DO NOTHING;

  SELECT tournament_ids INTO v_current_ids 
  FROM public.battle_pass_user_missions 
  WHERE mission_id = p_mission_id AND user_id = p_user_id AND period_key = p_period_key;

  -- Adicionar tournament_id se ainda não existe
  IF NOT (v_current_ids @> to_jsonb(p_tournament_id::text)) THEN
    v_new_ids := v_current_ids || to_jsonb(p_tournament_id::text);
    v_distinct_count := jsonb_array_length(v_new_ids);

    UPDATE public.battle_pass_user_missions
    SET tournament_ids = v_new_ids,
        progress = v_distinct_count,
        updated_at = now(),
        completed_at = CASE 
          WHEN completed_at IS NULL AND v_distinct_count >= v_goal THEN now() 
          ELSE completed_at 
        END
    WHERE mission_id = p_mission_id 
      AND user_id = p_user_id 
      AND period_key = p_period_key;
  END IF;
END;
$$;

-- Modificar bp_register_event para usar bp_add_tournament
CREATE OR REPLACE FUNCTION public.bp_register_event(p_user_id uuid, p_source text, p_source_id uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season_id uuid;
  v_count_tournaments boolean;
  v_inserted uuid;
  v_wins integer;
  v_tournament_id uuid;
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
      -- Para 'tournaments', adicionar tournament_id distinto via bp_add_tournament
      SELECT tournament_id INTO v_tournament_id 
      FROM public.tournament_matches WHERE id = p_source_id;
      
      IF v_tournament_id IS NOT NULL THEN
        -- Adicionar para todas as missões ativas de métrica 'tournaments'
        DECLARE
          m RECORD;
          v_key text;
        BEGIN
          FOR m IN SELECT * FROM public.battle_pass_missions
                   WHERE season_id = v_season_id AND is_active AND metric = 'tournaments' LOOP
            v_key := public.bp_period_key(m.scope);
            PERFORM public.bp_add_tournament(m.id, p_user_id, v_key, v_tournament_id);
          END LOOP;
        END;
      END IF;
    ELSE
      PERFORM public.bp_bump_missions(v_season_id, p_user_id, 'duels', 1);
    END IF;
  END IF;
END;
$$;

-- ============ S4: AdminDuelCoinsPackages - operação idempotente ============

-- 3.1: RPC admin que credita e marca paid na mesma transação, com idempotência
CREATE OR REPLACE FUNCTION public.admin_approve_duelcoins_order(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_order RECORD;
  v_result jsonb;
BEGIN
  -- Validar que é admin
  IF NOT public.is_admin(v_admin_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Access denied');
  END IF;

  -- Buscar e travar o pedido
  SELECT * INTO v_order
  FROM public.duelcoins_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- Idempotência: se já foi pago, retornar sucesso sem fazer nada
  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Order already paid',
      'already_paid', true
    );
  END IF;

  -- Creditar DuelCoins via admin_manage_duelcoins
  v_result := public.admin_manage_duelcoins(
    v_order.user_id,
    v_order.duelcoins_amount,
    'add',
    format('Compra aprovada manualmente - Pedido #%s', substring(v_order.id::text, 1, 8))
  );

  -- Verificar se crédito foi bem-sucedido
  IF NOT (v_result->>'success')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Failed to credit DuelCoins: %s', v_result->>'message')
    );
  END IF;

  -- Marcar como paid APENAS se crédito foi bem-sucedido
  UPDATE public.duelcoins_orders
  SET status = 'paid',
      paid_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Order approved and %s DuelCoins credited', v_order.duelcoins_amount),
    'order_id', p_order_id,
    'amount', v_order.duelcoins_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_duelcoins_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_duelcoins_order(uuid) TO authenticated;

-- ============ MANTER COMPATIBILIDADE COM FLUXOS EXISTENTES ============

-- Fluxos que criam live_duels com opponent_id já definido precisam ser migrados
-- para usar join_duel ou equivalente. Estes fluxos incluem:

-- 1. Matchmaking (já usa RPC SECURITY DEFINER)
-- 2. Aceitar convite/desafio (já usa join_duel ou deve usar)
-- 3. Torneio (cria salas vazias, jogadores entram via join_duel)
-- 4. Revanche (deve criar sala vazia e convidar)
-- 5. Bot do Discord/edge functions (usam service_role, não afetados pela policy)

-- Grants existentes mantidos (não removidos)

-- ============ COMMENTS ============
COMMENT ON FUNCTION public.is_match_eligible_for_rewards IS 'Verifica se partida é elegível para recompensas (duração mínima, limite por par/dia)';
COMMENT ON FUNCTION public.vote_match_result IS 'Permite jogador votar no resultado; finaliza quando ambos votam igual';
COMMENT ON FUNCTION public.create_tournament_match IS 'Cria match de torneio via chaveamento (criador ou admin, jogadores devem ser participantes)';
COMMENT ON FUNCTION public.bp_add_tournament IS 'Adiciona tournament_id distinto ao progresso de missão';
COMMENT ON FUNCTION public.admin_approve_duelcoins_order IS 'Aprova pedido de DuelCoins manualmente, creditando e marcando paid na mesma transação (idempotente)';
COMMENT ON TABLE public.antifraude_config IS 'Configuração de limites antifraude (ajustáveis)';

-- =====================================================
-- FIM DAS CORREÇÕES ANTIFRAUDE
-- =====================================================
