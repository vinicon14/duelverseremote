-- ============================================================================
-- Testes de integração: correções antifraude (20261004170000_antifraude_duelcoins.sql)
-- ============================================================================
--
-- Valida que as vulnerabilidades S1, S2 e S4 foram corrigidas e os fluxos
-- legítimos continuam funcionando.
--
--   psql -v ON_ERROR_STOP=1 -d <db> -f tests/sql/test_antifraude.sql
--
-- Cobre:
--   A*: Ataques fechados (PoCs originais falhando)
--   L*: Caminhos legítimos (fluxos normais funcionando)
--   C*: Configuração e limites
-- ============================================================================

\set ON_ERROR_STOP 1
\pset pager off
SET client_min_messages = warning;

BEGIN;

CREATE TEMP TABLE _res (n serial, name text, ok boolean, detail text);

CREATE FUNCTION pg_temp.ok(p_name text, p_ok boolean, p_detail text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO _res(name, ok, detail) VALUES (p_name, coalesce(p_ok, false), p_detail);
$$;

CREATE FUNCTION pg_temp.login(p_uid uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', p_role)::text, true);
  PERFORM set_config('role', p_role, true);
END $$;

CREATE FUNCTION pg_temp.logout() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

CREATE FUNCTION pg_temp.q(p_uid uuid, p_sql text, p_role text DEFAULT 'authenticated')
RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN
    PERFORM pg_temp.login(p_uid, p_role);
    EXECUTE p_sql INTO r;
    PERFORM pg_temp.logout();
    RETURN coalesce(r, 'NULL');
  EXCEPTION WHEN OTHERS THEN
    RETURN 'ERR: ' || SQLERRM;
  END;
END $$;

CREATE FUNCTION pg_temp.js(p_r text, p_key text) RETURNS text LANGUAGE sql AS $$
  SELECT CASE WHEN p_r IS NULL OR p_r LIKE 'ERR:%' OR p_r = 'NULL' THEN NULL ELSE (p_r::json ->> p_key) END;
$$;

CREATE FUNCTION pg_temp.bal(p_uid uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT duelcoins_balance FROM public.profiles WHERE user_id = p_uid;
$$;
CREATE FUNCTION pg_temp.wins(p_uid uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT coalesce(wins, 0) FROM public.profiles WHERE user_id = p_uid;
$$;
CREATE FUNCTION pg_temp.losses(p_uid uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT coalesce(losses, 0) FROM public.profiles WHERE user_id = p_uid;
$$;

-- ============================================================================
-- FIXTURES
-- ============================================================================
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1111111-0000-0000-0000-000000000001', 'farmer@test.local', '{"username":"farmer"}'),
  ('b1111111-0000-0000-0000-000000000002', 'victim@test.local', '{"username":"victim"}'),
  ('c1111111-0000-0000-0000-000000000003', 'tourney@test.local', '{"username":"tourney"}'),
  ('d1111111-0000-0000-0000-000000000004', 'admin@test.local', '{"username":"admin"}'),
  ('e1111111-0000-0000-0000-000000000005', 'user1@test.local', '{"username":"user1"}'),
  ('f1111111-0000-0000-0000-000000000006', 'user2@test.local', '{"username":"user2"}');

INSERT INTO public.profiles (user_id, username, duelcoins_balance, account_type, points, wins, losses) VALUES
  ('a1111111-0000-0000-0000-000000000001', 't_farmer', 0, 'free', 0, 0, 0),
  ('b1111111-0000-0000-0000-000000000002', 't_victim', 0, 'free', 0, 0, 0),
  ('c1111111-0000-0000-0000-000000000003', 't_tourney', 2000, 'free', 0, 0, 0),
  ('d1111111-0000-0000-0000-000000000004', 't_admin', 0, 'free', 0, 0, 0),
  ('e1111111-0000-0000-0000-000000000005', 't_user1', 1000, 'free', 100, 0, 0),
  ('f1111111-0000-0000-0000-000000000006', 't_user2', 1000, 'free', 100, 0, 0);

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a1111111-0000-0000-0000-000000000001', 'user'),
  ('b1111111-0000-0000-0000-000000000002', 'user'),
  ('c1111111-0000-0000-0000-000000000003', 'user'),
  ('d1111111-0000-0000-0000-000000000004', 'admin'),
  ('e1111111-0000-0000-0000-000000000005', 'user'),
  ('f1111111-0000-0000-0000-000000000006', 'user');

-- Battle Pass season para os testes
INSERT INTO public.battle_pass_seasons (id, name, season_number, is_active, pro_price_duelcoins, starts_at, ends_at)
VALUES ('88000000-0000-0000-0000-000000000008', 't_antifraude_season', 999999, true, 50, now() - interval '1 day', now() + interval '30 days');

-- Missões de teste
INSERT INTO public.battle_pass_missions (id, season_id, title, description, metric, goal, reward_duelcoins, scope, is_active) VALUES
  ('99000001-0000-0000-0000-000000000001', '88000000-0000-0000-0000-000000000008', 'Vença 2 duelos', 'Desc', 'wins', 2, 50, 'daily', true),
  ('99000002-0000-0000-0000-000000000002', '88000000-0000-0000-0000-000000000008', 'Jogue 3 duelos', 'Desc', 'duels', 3, 30, 'daily', true),
  ('99000003-0000-0000-0000-000000000003', '88000000-0000-0000-0000-000000000008', 'Participe de 2 torneios', 'Desc', 'tournaments', 2, 250, 'weekly', true);

-- Níveis de BP para os testes
INSERT INTO public.battle_pass_levels (season_id, level, wins_required) VALUES
  ('88000000-0000-0000-0000-000000000008', 1, 0),
  ('88000000-0000-0000-0000-000000000008', 2, 2),
  ('88000000-0000-0000-0000-000000000008', 3, 4);

-- Recompensas de BP para os testes
INSERT INTO public.battle_pass_rewards (season_id, level, track, reward_type, title, description, amount) VALUES
  ('88000000-0000-0000-0000-000000000008', 1, 'free', 'duelcoins', 'Nível 1', 'Desc', 55),
  ('88000000-0000-0000-0000-000000000008', 2, 'free', 'duelcoins', 'Nível 2', 'Desc', 60),
  ('88000000-0000-0000-0000-000000000008', 3, 'free', 'duelcoins', 'Nível 3', 'Desc', 70);

-- Pedido de DuelCoins para teste S4
INSERT INTO public.duelcoins_orders (id, user_id, duelcoins_amount, amount_brl, payment_method, status) VALUES
  ('dd000000-0000-0000-0000-000000000001', 'e1111111-0000-0000-0000-000000000005', 100, 5000, 'pix', 'pending');

SET LOCAL session_replication_role = origin;

-- ============================================================================
-- A. ATAQUES FECHADOS (PoCs S1, S2, S4 devem falhar)
-- ============================================================================

-- A1: PoC S1 - tentar criar duelo com opponent_id já definido (sem consentimento)
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('a1111111-0000-0000-0000-000000000001',
      $q$INSERT INTO public.live_duels (creator_id, opponent_id, status, is_ranked, max_players)
         VALUES (auth.uid(), 'b1111111-0000-0000-0000-000000000002', 'in_progress', true, 2) RETURNING id::text$q$);
    v_ok := r LIKE 'ERR:%';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('A1: INSERT live_duels com opponent_id sem consentimento é rejeitado', v_ok, v_d);
END $$;

-- A2: PoC S1 - tentar criar duelo com winner_id já definido
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('a1111111-0000-0000-0000-000000000001',
      $q$INSERT INTO public.live_duels (creator_id, opponent_id, winner_id, status, is_ranked, max_players)
         VALUES (auth.uid(), NULL, auth.uid(), 'waiting', true, 2) RETURNING id::text$q$);
    v_ok := r LIKE 'ERR:%';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('A2: INSERT live_duels com winner_id pré-definido é rejeitado', v_ok, v_d);
END $$;

-- A3: PoC S1 - tentar chamar record_match_result sem consenso (cliente decide sozinho)
DO $$
DECLARE v_duel_id uuid; r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    -- Criar duelo legítimo
    r := pg_temp.q('e1111111-0000-0000-0000-000000000005',
      $q$INSERT INTO public.live_duels (creator_id, status, is_ranked, max_players)
         VALUES (auth.uid(), 'waiting', true, 2) RETURNING id::text$q$);
    v_duel_id := r::uuid;
    
    -- Oponente entra
    PERFORM pg_temp.q('f1111111-0000-0000-0000-000000000006',
      format($q$SELECT public.join_duel(%L)::text$q$, v_duel_id));
    
    -- Aguardar 1 segundo (menos que duração mínima)
    PERFORM pg_sleep(1);
    
    -- Tentar decidir resultado unilateralmente (sem consenso)
    r := pg_temp.q('e1111111-0000-0000-0000-000000000005',
      format($q$SELECT public.record_match_result(%L,'e1111111-0000-0000-0000-000000000005','f1111111-0000-0000-0000-000000000006','e1111111-0000-0000-0000-000000000005',8000,0,0)::text$q$, v_duel_id));
    
    v_ok := r LIKE 'ERR:%' OR r LIKE '%consensus%';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('A3: record_match_result direto sem consenso é rejeitado', v_ok, v_d);
END $$;

-- A4: PoC S2 - tentar inserir tournament_match diretamente com status completed
DO $$
DECLARE v_tournament_id uuid; r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    -- Criar torneio
    r := pg_temp.q('c1111111-0000-0000-0000-000000000003',
      $q$SELECT public.create_normal_tournament('test_tour','desc',now(),now()+interval '1 day',0,0,8,'single_elimination',false)::text$q$);
    v_tournament_id := (pg_temp.js(r, 'tournament_id'))::uuid;
    
    -- Tentar inserir match direto
    r := pg_temp.q('c1111111-0000-0000-0000-000000000003',
      format($q$INSERT INTO public.tournament_matches (tournament_id, round_number, match_number, player1_id, player2_id, winner_id, status)
             VALUES (%L, 1, 1, 'e1111111-0000-0000-0000-000000000005', 'f1111111-0000-0000-0000-000000000006', 'e1111111-0000-0000-0000-000000000005', 'completed') RETURNING id::text$q$, v_tournament_id));
    
    v_ok := r LIKE 'ERR:%';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('A4: INSERT direto em tournament_matches é rejeitado', v_ok, v_d);
END $$;

-- A5: PoC S4 - admin_approve_duelcoins_order é idempotente
DO $$
DECLARE r1 text; r2 text; v_ok boolean := false; v_d text; v_bal int;
BEGIN
  BEGIN
    -- Primeira aprovação
    r1 := pg_temp.q('d1111111-0000-0000-0000-000000000004',
      $q$SELECT public.admin_approve_duelcoins_order('dd000000-0000-0000-0000-000000000001')::text$q$);
    
    -- Segunda aprovação (deve ser idempotente)
    r2 := pg_temp.q('d1111111-0000-0000-0000-000000000004',
      $q$SELECT public.admin_approve_duelcoins_order('dd000000-0000-0000-0000-000000000001')::text$q$);
    
    v_bal := pg_temp.bal('e1111111-0000-0000-0000-000000000005');
    
    -- Deve ter creditado apenas uma vez (1000 + 100 = 1100)
    v_ok := pg_temp.js(r1, 'success') = 'true' 
        AND pg_temp.js(r2, 'success') = 'true'
        AND coalesce(pg_temp.js(r2, 'already_paid')::boolean, false)
        AND v_bal = 1100;
    
    v_d := format('1ª=%s | 2ª=%s | saldo=%s (esperado 1100)', r1, r2, v_bal);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('A5: admin_approve_duelcoins_order é idempotente (não credita 2x)', v_ok, v_d);
END $$;

-- ============================================================================
-- L. CAMINHOS LEGÍTIMOS (fluxos normais devem funcionar)
-- ============================================================================

-- L1: Fluxo completo de duelo legítimo com consenso
DO $$
DECLARE 
  v_duel_id uuid; 
  r_create text;
  r_join text;
  r_vote1 text;
  r_vote2 text;
  v_ok boolean := false; 
  v_d text;
  v_wins_e int;
  v_losses_f int;
BEGIN
  BEGIN
    -- Jogador E cria sala
    r_create := pg_temp.q('e1111111-0000-0000-0000-000000000005',
      $q$INSERT INTO public.live_duels (creator_id, status, is_ranked, max_players, tcg_type)
         VALUES (auth.uid(), 'waiting', true, 2, 'yugioh') RETURNING id::text$q$);
    v_duel_id := r_create::uuid;
    
    -- Jogador F entra
    r_join := pg_temp.q('f1111111-0000-0000-0000-000000000006',
      format($q$SELECT public.join_duel(%L)::text$q$, v_duel_id));
    
    -- Aguardar duração mínima configurada (3 min = 180s; simulamos com sleep menor e ajustamos o timestamp)
    UPDATE public.live_duels SET opponent_joined_at = now() - interval '4 minutes' WHERE id = v_duel_id;
    
    -- Ambos votam no mesmo vencedor (E)
    r_vote1 := pg_temp.q('e1111111-0000-0000-0000-000000000005',
      format($q$SELECT public.vote_match_result(%L, 'e1111111-0000-0000-0000-000000000005')::text$q$, v_duel_id));
    
    r_vote2 := pg_temp.q('f1111111-0000-0000-0000-000000000006',
      format($q$SELECT public.vote_match_result(%L, 'e1111111-0000-0000-0000-000000000005')::text$q$, v_duel_id));
    
    v_wins_e := pg_temp.wins('e1111111-0000-0000-0000-000000000005');
    v_losses_f := pg_temp.losses('f1111111-0000-0000-0000-000000000006');
    
    v_ok := pg_temp.js(r_create, '') IS NOT NULL
        AND pg_temp.js(r_join, 'joined') = 'true'
        AND pg_temp.js(r_vote2, 'consensus_reached') = 'true'
        AND v_wins_e = 1
        AND v_losses_f = 1;
    
    v_d := format('create=%s | join=%s | vote1=%s | vote2=%s | wins_e=%s losses_f=%s', 
                  substring(r_create, 1, 36), r_join, r_vote1, r_vote2, v_wins_e, v_losses_f);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L1: Fluxo completo com consenso (criar, entrar, votar, pontuar)', v_ok, v_d);
END $$;

-- L2: Limite de partidas por par funciona (3 partidas OK, 4ª não conta)
DO $$
DECLARE 
  v_duel1_id uuid;
  v_duel2_id uuid;
  v_duel3_id uuid;
  v_duel4_id uuid;
  v_ok boolean := false; 
  v_d text;
  v_wins_e_antes int;
  v_wins_e_depois int;
  i int;
BEGIN
  BEGIN
    v_wins_e_antes := pg_temp.wins('e1111111-0000-0000-0000-000000000005');
    
    -- Criar e completar 4 duelos entre E e F no mesmo dia
    FOR i IN 1..4 LOOP
      -- Criar duelo
      EXECUTE format($q$SELECT public.join_duel(d.id)::text FROM (
        INSERT INTO public.live_duels (creator_id, status, is_ranked, max_players, tcg_type)
        VALUES ('e1111111-0000-0000-0000-000000000005', 'waiting', true, 2, 'yugioh') 
        RETURNING id
      ) d$q$) INTO v_duel1_id;
      
      -- F entra
      PERFORM set_config('request.jwt.claims', 
        json_build_object('sub', 'f1111111-0000-0000-0000-000000000006', 'role', 'authenticated')::text, true);
      PERFORM set_config('role', 'authenticated', true);
      PERFORM public.join_duel(v_duel1_id);
      
      -- Ajustar timestamp para duração válida
      UPDATE public.live_duels SET opponent_joined_at = now() - interval '4 minutes', status = 'in_progress' 
      WHERE id = v_duel1_id;
      
      -- Votos consensuais (E vence)
      PERFORM set_config('request.jwt.claims', 
        json_build_object('sub', 'e1111111-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
      PERFORM public.vote_match_result(v_duel1_id, 'e1111111-0000-0000-0000-000000000005');
      
      PERFORM set_config('request.jwt.claims', 
        json_build_object('sub', 'f1111111-0000-0000-0000-000000000006', 'role', 'authenticated')::text, true);
      PERFORM public.vote_match_result(v_duel1_id, 'e1111111-0000-0000-0000-000000000005');
    END LOOP;
    
    PERFORM set_config('role', 'none', true);
    
    v_wins_e_depois := pg_temp.wins('e1111111-0000-0000-0000-000000000005');
    
    -- Deve ter contado apenas 3 vitórias (limite por par/dia)
    v_ok := (v_wins_e_depois - v_wins_e_antes) = 3;
    
    v_d := format('wins antes=%s depois=%s (esperado +3)', v_wins_e_antes, v_wins_e_depois);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L2: Limite de 3 partidas por par/dia funciona (4ª não conta)', v_ok, v_d);
END $$;

-- L3: Torneio legítimo via create_tournament_match
DO $$
DECLARE 
  v_tournament_id uuid;
  r_create text;
  r_match text;
  v_ok boolean := false;
  v_d text;
BEGIN
  BEGIN
    -- Criar torneio
    r_create := pg_temp.q('c1111111-0000-0000-0000-000000000003',
      $q$SELECT public.create_normal_tournament('legit_tour','desc',now(),now()+interval '1 day',0,0,8,'single_elimination',false)::text$q$);
    v_tournament_id := (pg_temp.js(r_create, 'tournament_id'))::uuid;
    
    -- Inscrever participantes
    PERFORM pg_temp.q(NULL,
      format($q$INSERT INTO public.tournament_participants (tournament_id, user_id, status) VALUES (%L, 'e1111111-0000-0000-0000-000000000005', 'registered'), (%L, 'f1111111-0000-0000-0000-000000000006', 'registered')$q$,
             v_tournament_id, v_tournament_id), 'service_role');
    
    -- Criar match via RPC (único caminho permitido)
    r_match := pg_temp.q('c1111111-0000-0000-0000-000000000003',
      format($q$SELECT public.create_tournament_match(%L, 1, 1, 'e1111111-0000-0000-0000-000000000005', 'f1111111-0000-0000-0000-000000000006')::text$q$, v_tournament_id));
    
    v_ok := pg_temp.js(r_create, 'success') = 'true'
        AND pg_temp.js(r_match, 'success') = 'true'
        AND pg_temp.js(r_match, 'match_id') IS NOT NULL;
    
    v_d := format('create=%s | match=%s', r_create, r_match);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L3: Torneio legítimo via create_tournament_match funciona', v_ok, v_d);
END $$;

-- L4: Torneio com ≥4 participantes conta para BP
DO $$
DECLARE 
  v_tournament_id uuid;
  v_match_id uuid;
  r text;
  v_ok boolean := false;
  v_d text;
  v_progress_e record;
BEGIN
  BEGIN
    -- Criar torneio
    r := pg_temp.q('c1111111-0000-0000-0000-000000000003',
      $q$SELECT public.create_normal_tournament('bp_tour','desc',now(),now()+interval '1 day',0,0,8,'single_elimination',false)::text$q$);
    v_tournament_id := (pg_temp.js(r, 'tournament_id'))::uuid;
    
    -- Inscrever 4 participantes (mínimo)
    PERFORM pg_temp.q(NULL,
      format($q$INSERT INTO public.tournament_participants (tournament_id, user_id, status) VALUES 
             (%L, 'e1111111-0000-0000-0000-000000000005', 'registered'),
             (%L, 'f1111111-0000-0000-0000-000000000006', 'registered'),
             (%L, 'a1111111-0000-0000-0000-000000000001', 'registered'),
             (%L, 'b1111111-0000-0000-0000-000000000002', 'registered')$q$,
             v_tournament_id, v_tournament_id, v_tournament_id, v_tournament_id), 'service_role');
    
    -- Criar e completar match
    r := pg_temp.q('c1111111-0000-0000-0000-000000000003',
      format($q$SELECT public.create_tournament_match(%L, 1, 1, 'e1111111-0000-0000-0000-000000000005', 'f1111111-0000-0000-0000-000000000006')::text$q$, v_tournament_id));
    v_match_id := (pg_temp.js(r, 'match_id'))::uuid;
    
    -- Completar match (service_role pode UPDATE)
    PERFORM pg_temp.q(NULL,
      format($q$UPDATE public.tournament_matches SET status = 'completed', winner_id = 'e1111111-0000-0000-0000-000000000005' WHERE id = %L RETURNING 'ok'$q$, v_match_id), 'service_role');
    
    -- Verificar que foi contado no BP
    SELECT * INTO v_progress_e FROM public.battle_pass_user_progress 
    WHERE user_id = 'e1111111-0000-0000-0000-000000000005' 
      AND season_id = '88000000-0000-0000-0000-000000000008';
    
    v_ok := v_progress_e.tournament_wins > 0;
    
    v_d := format('tournament_wins=%s (esperado >0)', v_progress_e.tournament_wins);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L4: Torneio com ≥4 participantes conta para BP', v_ok, v_d);
END $$;

-- ============================================================================
-- C. CONFIGURAÇÃO E LIMITES
-- ============================================================================

-- C1: Configuração antifraude existe e tem valores padrão
DO $$
DECLARE v_ok boolean; v_d text;
BEGIN
  SELECT 
    EXISTS (SELECT 1 FROM public.antifraude_config WHERE key = 'max_matches_per_pair_per_day')
    AND EXISTS (SELECT 1 FROM public.antifraude_config WHERE key = 'min_match_duration_seconds')
    AND EXISTS (SELECT 1 FROM public.antifraude_config WHERE key = 'min_tournament_participants')
  INTO v_ok;
  
  v_d := (SELECT string_agg(key || '=' || value, ', ') FROM public.antifraude_config);
  
  PERFORM pg_temp.ok('C1: Configuração antifraude existe com valores padrão', v_ok, v_d);
END $$;

-- C2: Funções antifraude existem e são SECURITY DEFINER
DO $$
DECLARE v_ok boolean; v_d text;
BEGIN
  SELECT 
    (SELECT prosecdef FROM pg_proc WHERE proname = 'is_match_eligible_for_rewards' LIMIT 1)
    AND (SELECT prosecdef FROM pg_proc WHERE proname = 'vote_match_result' LIMIT 1)
    AND (SELECT prosecdef FROM pg_proc WHERE proname = 'create_tournament_match' LIMIT 1)
    AND (SELECT prosecdef FROM pg_proc WHERE proname = 'admin_approve_duelcoins_order' LIMIT 1)
  INTO v_ok;
  
  v_d := 'Funções: is_match_eligible_for_rewards, vote_match_result, create_tournament_match, admin_approve_duelcoins_order';
  
  PERFORM pg_temp.ok('C2: Funções antifraude são SECURITY DEFINER', v_ok, v_d);
END $$;

-- ============================================================================
-- RESULTADO
-- ============================================================================
SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name,
       CASE WHEN ok THEN '' ELSE left(coalesce(detail, ''), 220) END AS detail
FROM _res ORDER BY n;

DO $$
DECLARE v_fail int; v_total int;
BEGIN
  SELECT count(*) FILTER (WHERE NOT ok), count(*) INTO v_fail, v_total FROM _res;
  IF v_fail > 0 THEN
    RAISE EXCEPTION '% de % testes FALHARAM', v_fail, v_total;
  END IF;
  RAISE WARNING 'TODOS OS TESTES PASSARAM (%)', v_total;
END $$;

ROLLBACK;
