-- ============================================================================
-- Testes de integração: autorização das RPCs de prêmio/assinatura/pontuação
--   (20261002220000_critical_security_fixes.sql)
-- ============================================================================
--
-- Roda contra um banco com o schema REAL (todas as migrations aplicadas, com
-- stubs mínimos do Supabase: roles anon/authenticated/service_role, schema auth
-- com auth.uid()/auth.role() lendo request.jwt.claims, como no PostgREST).
-- Simula requests do PostgREST com SET LOCAL ROLE + request.jwt.claims.
-- Cada caso roda numa subtransação desfeita no fim (estado isolado) e o script
-- inteiro termina em ROLLBACK: não deixa resíduo.
--
--   psql -v ON_ERROR_STOP=1 -d <db> -f tests/sql/test_rpc_authz.sql
--
-- Sai com erro (exit != 0) se QUALQUER caso falhar; a última linha
-- "TODOS OS TESTES PASSARAM" só aparece se tudo passou. Sem a migration
-- (schema da main antes do PR) os casos S* falham.
--
-- Cobre:
--   S*: ataques fechados (prêmio por não-criador / anon / torneio sem dono /
--       não participante / acima do pool, assinatura com saldo alheio, INSERT
--       direto em user_subscriptions, pontos forjados por p_bet_amount,
--       p_player*_score e live_duels.bet_amount/LP (inclusive em duelo em
--       andamento), vencedor
--       divergente, duelo alheio, reembolso sem pagamento).
--   L*: caminhos legítimos (o que o front em src/** chama, com os mesmos
--       argumentos: TournamentWinnerSelector, remoção+reembolso, torneio
--       semanal e normal, edge function distribute-tournament-prize, GoPro /
--       ProPlansSection, BattlePass, useSubscriptionExpirationCheck,
--       admin-toggle-pro, fim de duelo ranqueado pelo trigger + chamada direta
--       de record_match_result do DuelRoom).
--   G*: estrutura (sem overloads novos, SECURITY DEFINER + search_path,
--       GRANTs: anon sem EXECUTE, authenticated com EXECUTE).
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

-- "login" como no PostgREST: papel + claims do JWT (transaction-local)
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

-- executa p_sql como (p_uid, p_role); devolve o resultado em texto ou 'ERR: ...'
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
CREATE FUNCTION pg_temp.pts(p_uid uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT coalesce(points, 0) FROM public.profiles WHERE user_id = p_uid;
$$;
CREATE FUNCTION pg_temp.wins(p_uid uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT coalesce(wins, 0) FROM public.profiles WHERE user_id = p_uid;
$$;
CREATE FUNCTION pg_temp.losses(p_uid uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT coalesce(losses, 0) FROM public.profiles WHERE user_id = p_uid;
$$;

-- IDs
--   alice a..a / bob b..b : jogadores; carol c..c : criadora de torneios
--   admin d..d ; eve e..e : atacante ; frank f..f : não participa de nada
-- ---------------------------------------------------------------------------
-- Fixtures (triggers desligados só durante o setup)
-- ---------------------------------------------------------------------------
-- Produção (types.ts) tem user_subscriptions.starts_at; o histórico de
-- migrations local pode ter criado a tabela com started_at.
ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS starts_at timestamptz NOT NULL DEFAULT now();

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'alice@t.local', '{}'),
  ('b0000000-0000-0000-0000-00000000000b', 'bob@t.local',   '{}'),
  ('c0000000-0000-0000-0000-00000000000c', 'carol@t.local', '{}'),
  ('d0000000-0000-0000-0000-00000000000d', 'admin@t.local', '{}'),
  ('e0000000-0000-0000-0000-00000000000e', 'eve@t.local',   '{}'),
  ('f0000000-0000-0000-0000-00000000000f', 'frank@t.local', '{}');

INSERT INTO public.profiles (user_id, username, duelcoins_balance, account_type, points, wins, losses) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 't_alice', 1000, 'free', 100, 0, 0),
  ('b0000000-0000-0000-0000-00000000000b', 't_bob',   1000, 'free',  20, 0, 0),
  ('c0000000-0000-0000-0000-00000000000c', 't_carol', 2000, 'free',   0, 0, 0),
  ('d0000000-0000-0000-0000-00000000000d', 't_admin',    0, 'free',   0, 0, 0),
  ('e0000000-0000-0000-0000-00000000000e', 't_eve',      0, 'free',   0, 0, 0),
  ('f0000000-0000-0000-0000-00000000000f', 't_frank',    0, 'free',   0, 0, 0);

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'user'),
  ('b0000000-0000-0000-0000-00000000000b', 'user'),
  ('c0000000-0000-0000-0000-00000000000c', 'user'),
  ('d0000000-0000-0000-0000-00000000000d', 'admin'),
  ('e0000000-0000-0000-0000-00000000000e', 'user'),
  ('f0000000-0000-0000-0000-00000000000f', 'user');

-- T1: torneio normal da carol, prêmio 500 depositado na criação, inscrição 100
--     (alice e bob pagaram; eve se inscreveu direto na tabela, sem pagar)
-- T3: torneio legado SEM dono (created_by NULL), prize_pool 1000, eve inscrita
INSERT INTO public.tournaments (id, name, start_date, end_date, max_participants, prize_pool, entry_fee, created_by, status, is_weekly) VALUES
  ('71000000-0000-0000-0000-000000000001', 't_normal', now() - interval '1 day', now() + interval '1 day', 8,  500, 100, 'c0000000-0000-0000-0000-00000000000c', 'active', false),
  ('73000000-0000-0000-0000-000000000003', 't_orfao',  now() - interval '1 day', now() + interval '1 day', 8, 1000,   0, NULL,                                   'active', false);
INSERT INTO public.tournament_participants (tournament_id, user_id, status) VALUES
  ('71000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'registered'),
  ('71000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', 'registered'),
  ('71000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e', 'registered'),
  ('73000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-00000000000e', 'registered');
INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description) VALUES
  ('a0000000-0000-0000-0000-00000000000a', NULL, 100, 'tournament_entry', '71000000-0000-0000-0000-000000000001', 'Inscrição no torneio: t_normal'),
  ('b0000000-0000-0000-0000-00000000000b', NULL, 100, 'tournament_entry', '71000000-0000-0000-0000-000000000001', 'Inscrição no torneio: t_normal');

-- duelos: D1 ranqueado alice x bob; D2 ranqueado alice x bob; D3 casual
INSERT INTO public.live_duels (id, creator_id, opponent_id, status, is_ranked, max_players, tcg_type, bet_amount, player1_lp, player2_lp) VALUES
  ('d1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'in_progress', true,  2, 'yugioh', 0, 8000, 8000),
  ('d2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'in_progress', true,  2, 'yugioh', 0, 8000, 8000),
  ('d3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'in_progress', false, 2, 'yugioh', 0, 8000, 8000);

-- PRO: plano de 200; eve tem uma assinatura expirada; frank é PRO dado pelo admin
INSERT INTO public.subscription_plans (id, name, price_duelcoins, duration_days, is_active)
VALUES ('78000000-0000-0000-0000-000000000008', 't_plan', 200, 30, true);
INSERT INTO public.user_subscriptions (id, user_id, plan_id, is_active, starts_at, expires_at)
VALUES ('79000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-00000000000e', '78000000-0000-0000-0000-000000000008', true, now() - interval '31 days', now() - interval '1 day');
UPDATE public.profiles SET account_type = 'pro' WHERE user_id = 'e0000000-0000-0000-0000-00000000000e';

-- battle pass
INSERT INTO public.battle_pass_seasons (id, name, season_number, is_active, pro_price_duelcoins, starts_at, ends_at)
VALUES ('75000000-0000-0000-0000-000000000005', 't_season', 987655, true, 50, now() - interval '1 day', now() + interval '30 days');

SET LOCAL session_replication_role = origin;

-- ===========================================================================
-- G. ESTRUTURA / GRANTS
-- ===========================================================================
DO $$
DECLARE
  f text; v_cnt int; v_def boolean; v_cfg text[]; v_anon boolean; v_auth boolean;
BEGIN
  FOREACH f IN ARRAY ARRAY['distribute_tournament_prize','finalize_tournament_and_pay_winner',
                           'activate_subscription','record_match_result',
                           'tournament_pay_winner','tournament_refund_participant']
  LOOP
    SELECT count(*) INTO v_cnt FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = f;
    SELECT prosecdef, proconfig, has_function_privilege('anon', oid, 'EXECUTE'),
           has_function_privilege('authenticated', oid, 'EXECUTE')
      INTO v_def, v_cfg, v_anon, v_auth
      FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = f LIMIT 1;
    PERFORM pg_temp.ok('G: ' || f || ' sem overload novo (1 assinatura)', v_cnt = 1, 'overloads=' || v_cnt);
    PERFORM pg_temp.ok('G: ' || f || ' SECURITY DEFINER + search_path fixo',
      v_def AND EXISTS (SELECT 1 FROM unnest(coalesce(v_cfg, '{}')) c WHERE c LIKE 'search_path=%'),
      format('secdef=%s config=%s', v_def, v_cfg));
    PERFORM pg_temp.ok('G: anon SEM EXECUTE em ' || f, NOT v_anon, 'anon execute=' || v_anon);
    PERFORM pg_temp.ok('G: authenticated COM EXECUTE em ' || f, v_auth, 'authenticated execute=' || v_auth);
  END LOOP;

  FOREACH f IN ARRAY ARRAY['create_weekly_tournament','create_normal_tournament','join_weekly_tournament',
                           'bp_purchase_pro','check_expired_subscriptions','is_user_pro']
  LOOP
    SELECT has_function_privilege('authenticated', oid, 'EXECUTE') INTO v_auth
      FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = f LIMIT 1;
    PERFORM pg_temp.ok('G: authenticated continua executando ' || f, v_auth, NULL);
  END LOOP;

  PERFORM pg_temp.ok('G: user_subscriptions sem policy de INSERT/UPDATE para não-admin',
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_subscriptions'
                 AND cmd IN ('INSERT','UPDATE','ALL')
                 AND coalesce(qual, '') NOT LIKE '%admin%' AND coalesce(with_check, '') NOT LIKE '%admin%'),
    (SELECT string_agg(policyname || ':' || cmd, ', ') FROM pg_policies WHERE tablename = 'user_subscriptions'));
END $$;

-- ===========================================================================
-- S. ATAQUES FECHADOS
-- ===========================================================================

-- S1/S2: não-criador (eve, que está inscrita) paga o prêmio a si mesma
DO $$
DECLARE r text; v_ok boolean := false; v_d text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['distribute_tournament_prize','finalize_tournament_and_pay_winner'] LOOP
    BEGIN
      r := pg_temp.q('e0000000-0000-0000-0000-00000000000e',
        format($q$SELECT public.%I('71000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000e')::text$q$, f));
      v_ok := coalesce(pg_temp.js(r, 'success'), 'false') = 'false'
              AND pg_temp.bal('e0000000-0000-0000-0000-00000000000e') = 0
              AND (SELECT status FROM public.tournaments WHERE id = '71000000-0000-0000-0000-000000000001') = 'active';
      v_d := r;
      RAISE EXCEPTION '__rb__';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
    END;
    PERFORM pg_temp.ok('S: não-criador NÃO paga prêmio via ' || f, v_ok, v_d);
  END LOOP;
END $$;

-- S3: anon nas 4 RPCs de prêmio/reembolso e em activate_subscription
DO $$
DECLARE r text; v_ok boolean; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('distribute_tournament_prize', $q$SELECT public.distribute_tournament_prize('71000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000e')::text$q$),
    ('finalize_tournament_and_pay_winner', $q$SELECT public.finalize_tournament_and_pay_winner('71000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000e')::text$q$),
    ('tournament_pay_winner', $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000e',100)::text$q$),
    ('tournament_refund_participant', $q$SELECT public.tournament_refund_participant('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$),
    ('activate_subscription', $q$SELECT public.activate_subscription('b0000000-0000-0000-0000-00000000000b','78000000-0000-0000-0000-000000000008')::text$q$),
    ('record_match_result', $q$SELECT public.record_match_result('d1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a',8000,0,1000000)::text$q$)
  ) AS t(fn, sql) LOOP
    BEGIN
      r := pg_temp.q(NULL, c.sql, 'anon');
      v_ok := (r LIKE 'ERR:%' OR coalesce(pg_temp.js(r, 'success'), 'false') = 'false')
              AND pg_temp.bal('e0000000-0000-0000-0000-00000000000e') = 0
              AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1000
              AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 1000
              AND pg_temp.pts('a0000000-0000-0000-0000-00000000000a') = 100;
      RAISE EXCEPTION '__rb__';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; r := SQLERRM; END IF;
    END;
    PERFORM pg_temp.ok('S: anon não consegue nada via ' || c.fn, v_ok, r);
  END LOOP;
END $$;

-- S4: torneio legado sem dono (created_by NULL): qualquer um pagaria o prêmio
DO $$
DECLARE r text; v_ok boolean := false; v_d text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['distribute_tournament_prize','finalize_tournament_and_pay_winner'] LOOP
    BEGIN
      r := pg_temp.q('e0000000-0000-0000-0000-00000000000e',
        format($q$SELECT public.%I('73000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-00000000000e')::text$q$, f));
      v_ok := coalesce(pg_temp.js(r, 'success'), 'false') = 'false'
              AND pg_temp.bal('e0000000-0000-0000-0000-00000000000e') = 0
              AND (SELECT status FROM public.tournaments WHERE id = '73000000-0000-0000-0000-000000000003') = 'active';
      v_d := r;
      RAISE EXCEPTION '__rb__';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
    END;
    PERFORM pg_temp.ok('S: torneio sem dono (created_by NULL) não é pago por qualquer um via ' || f, v_ok, v_d);
  END LOOP;
END $$;

-- S5: criador paga quem não é participante (frank) / a si mesmo
DO $$
DECLARE r text; v_ok boolean := false; v_d text; c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('distribute_tournament_prize(frank)', $q$SELECT public.distribute_tournament_prize('71000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-00000000000f')::text$q$, 'f0000000-0000-0000-0000-00000000000f'::uuid, 0),
    ('finalize_tournament_and_pay_winner(frank)', $q$SELECT public.finalize_tournament_and_pay_winner('71000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-00000000000f')::text$q$, 'f0000000-0000-0000-0000-00000000000f'::uuid, 0),
    ('tournament_pay_winner(frank)', $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-00000000000f',500)::text$q$, 'f0000000-0000-0000-0000-00000000000f'::uuid, 0),
    ('tournament_pay_winner(a própria criadora)', $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c',500)::text$q$, 'c0000000-0000-0000-0000-00000000000c'::uuid, 2000)
  ) AS t(label, sql, who, bal0) LOOP
    BEGIN
      r := pg_temp.q('c0000000-0000-0000-0000-00000000000c', c.sql);
      v_ok := coalesce(pg_temp.js(r, 'success'), 'false') = 'false' AND pg_temp.bal(c.who) = c.bal0;
      v_d := r;
      RAISE EXCEPTION '__rb__';
    EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
    END;
    PERFORM pg_temp.ok('S: criadora não paga não-participante via ' || c.label, v_ok, v_d);
  END LOOP;
END $$;

-- S6: tournament_pay_winner por não-criador
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('e0000000-0000-0000-0000-00000000000e',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000e',500)::text$q$);
    v_ok := coalesce(pg_temp.js(r, 'success'), 'false') = 'false' AND pg_temp.bal('e0000000-0000-0000-0000-00000000000e') = 0;
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: não-criador não paga via tournament_pay_winner', v_ok, v_d);
END $$;

-- S7: pagar o mesmo vencedor 2x / vários participantes acima do pool / valor acima do pool
DO $$
DECLARE r1 text; r2 text; r3 text; v_ok boolean := false; v_d text; v_paid int;
BEGIN
  BEGIN
    r1 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',500)::text$q$);
    r2 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',500)::text$q$);
    r3 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a',500)::text$q$);
    SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.duelcoins_transactions
     WHERE tournament_id = '71000000-0000-0000-0000-000000000001' AND transaction_type = 'tournament_prize';
    v_ok := coalesce(pg_temp.js(r2, 'success'), 'false') = 'false'
        AND coalesce(pg_temp.js(r3, 'success'), 'false') = 'false'
        AND v_paid <= 500
        AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1000;
    v_d := format('1a=%s | 2a(mesmo)=%s | 3a(alice)=%s | total pago=%s (pool 500)', r1, r2, r3, v_paid);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: tournament_pay_winner não paga 2x nem acima do pool (soma de todos os pagamentos)', v_ok, v_d);
END $$;

DO $$
DECLARE r text; v_ok boolean := false; v_d text; v_paid int;
BEGIN
  BEGIN
    r := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',1000000)::text$q$);
    SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.duelcoins_transactions
     WHERE tournament_id = '71000000-0000-0000-0000-000000000001' AND transaction_type = 'tournament_prize';
    v_ok := v_paid <= 500 AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') <= 1500;
    v_d := format('%s | pago=%s', r, v_paid);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: tournament_pay_winner com p_amount=1.000.000 não passa do pool', v_ok, v_d);
END $$;

-- S8: prêmio pago por um caminho não pode ser pago de novo pelo outro
DO $$
DECLARE r1 text; r2 text; r3 text; v_ok boolean := false; v_d text; v_paid int;
BEGIN
  BEGIN
    r1 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',500)::text$q$);
    r2 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.finalize_tournament_and_pay_winner('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$);
    r3 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.distribute_tournament_prize('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$);
    SELECT coalesce(sum(amount), 0) INTO v_paid FROM public.duelcoins_transactions
     WHERE tournament_id = '71000000-0000-0000-0000-000000000001' AND transaction_type = 'tournament_prize';
    v_ok := pg_temp.js(r1, 'success') = 'true'
        AND coalesce(pg_temp.js(r2, 'success'), 'false') = 'false'
        AND coalesce(pg_temp.js(r3, 'success'), 'false') = 'false'
        AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1000;
    v_d := format('pay=%s | finalize=%s | distribute=%s | total=%s', r1, r2, r3, v_paid);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: depois de tournament_pay_winner, finalize/distribute não pagam de novo', v_ok, v_d);
END $$;

-- S9: reembolso: não-criador; quem nunca pagou (inscrição direta na tabela); 2x a mesma inscrição
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('e0000000-0000-0000-0000-00000000000e',
      $q$SELECT public.tournament_refund_participant('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$);
    v_ok := coalesce(pg_temp.js(r, 'success'), 'false') = 'false' AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1000;
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: não-criador não reembolsa', v_ok, v_d);
END $$;

DO $$
DECLARE r text; r2 text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    -- eve: inscrita direto na tabela (policy permite), nunca pagou
    r := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_refund_participant('71000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-00000000000e')::text$q$);
    -- criadora "reembolsa" a si mesma (nunca se inscreveu)
    r2 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_refund_participant('71000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000c')::text$q$);
    v_ok := pg_temp.bal('e0000000-0000-0000-0000-00000000000e') = 0 AND pg_temp.bal('c0000000-0000-0000-0000-00000000000c') = 2000;
    v_d := format('eve=%s | carol=%s', r, r2);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: reembolso para quem não pagou inscrição não cria DuelCoins', v_ok, v_d);
END $$;

DO $$
DECLARE r1 text; r2 text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r1 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_refund_participant('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$);
    r2 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_refund_participant('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$);
    v_ok := pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1100;
    v_d := format('1o=%s | 2o=%s | saldo alice=%s (esperado 1100)', r1, r2, pg_temp.bal('a0000000-0000-0000-0000-00000000000a'));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: mesma inscrição não é reembolsada 2x', v_ok, v_d);
END $$;

-- S10: activate_subscription com o saldo de outra pessoa
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('e0000000-0000-0000-0000-00000000000e',
      $q$SELECT public.activate_subscription('b0000000-0000-0000-0000-00000000000b','78000000-0000-0000-0000-000000000008')::text$q$);
    v_ok := coalesce(pg_temp.js(r, 'success'), 'false') = 'false'
        AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 1000
        AND (SELECT account_type FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b') = 'free';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: activate_subscription não debita saldo de terceiro', v_ok, v_d);
END $$;

-- S11: INSERT/UPDATE direto em user_subscriptions
DO $$
DECLARE r text; r2 text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('f0000000-0000-0000-0000-00000000000f',
      $q$INSERT INTO public.user_subscriptions (user_id, plan_id, is_active, starts_at, expires_at)
         VALUES (auth.uid(), '78000000-0000-0000-0000-000000000008', true, now(), '2099-01-01') RETURNING id::text$q$);
    r2 := pg_temp.q('e0000000-0000-0000-0000-00000000000e',
      $q$WITH u AS (UPDATE public.user_subscriptions SET expires_at = '2099-01-01', is_active = true WHERE user_id = auth.uid() RETURNING 1) SELECT count(*)::text FROM u$q$);
    v_ok := r LIKE 'ERR:%'
        AND (r2 LIKE 'ERR:%' OR r2 = '0')
        AND NOT EXISTS (SELECT 1 FROM public.user_subscriptions WHERE expires_at > now() + interval '10 years');
    v_d := format('insert=%s | update=%s', r, r2);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: cliente não insere/estende assinatura direto na tabela', v_ok, v_d);
END $$;

-- S12: record_match_result chamado direto com p_bet_amount forjado (duelo finalizado sem vencedor)
DO $$
DECLARE r text; v_ok boolean := false; v_d text; p0 int;
BEGIN
  BEGIN
    UPDATE public.live_duels SET status = 'finished' WHERE id = 'd2000000-0000-0000-0000-000000000002';
    p0 := pg_temp.pts('a0000000-0000-0000-0000-00000000000a');
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$SELECT public.record_match_result('d2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a',8000,0,1000000)::text$q$);
    v_ok := pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0 <= 110;
    v_d := format('%s | +%s pontos', r, pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: record_match_result direto ignora p_bet_amount forjado', v_ok, v_d);
END $$;

-- S13: record_match_result direto com p_player1_score forjado (duelo em andamento)
DO $$
DECLARE r text; v_ok boolean := false; v_d text; p0 int;
BEGIN
  BEGIN
    p0 := pg_temp.pts('a0000000-0000-0000-0000-00000000000a');
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$SELECT public.record_match_result('d2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a',100000000,0,0)::text$q$);
    v_ok := pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0 <= 110;
    v_d := format('%s | +%s pontos', r, pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: record_match_result direto com p_player1_score=100.000.000 não gera pontos absurdos', v_ok, v_d);
END $$;

-- S14: duelo em andamento: chamada direta com aposta E score forjados
--      (declarar o resultado continua possível no modelo atual; o que não pode é
--      inflar pontos)
DO $$
DECLARE r text; v_ok boolean := false; v_d text; p0 int;
BEGIN
  BEGIN
    p0 := pg_temp.pts('a0000000-0000-0000-0000-00000000000a');
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$SELECT public.record_match_result('d2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a',2147483647,0,2147483647)::text$q$);
    v_ok := pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0 <= 110
        AND coalesce((SELECT bet_amount FROM public.match_history WHERE duel_id = 'd2000000-0000-0000-0000-000000000002'), 0) = 0;
    v_d := format('%s | +%s pontos', r, pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: record_match_result direto em duelo em andamento com bet/score INT_MAX não infla pontos', v_ok, v_d);
END $$;

-- S15: vencedor divergente do registrado em live_duels (perdedor reescreve o resultado)
DO $$
DECLARE r text; v_ok boolean := false; v_d text; w0 int;
BEGIN
  BEGIN
    -- bob vence (trigger pontua bob)
    PERFORM pg_temp.q('b0000000-0000-0000-0000-00000000000b',
      $q$UPDATE public.live_duels SET status = 'finished', winner_id = 'b0000000-0000-0000-0000-00000000000b', player1_lp = 0 WHERE id = 'd2000000-0000-0000-0000-000000000002' RETURNING 'x'$q$);
    w0 := pg_temp.wins('a0000000-0000-0000-0000-00000000000a');
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$SELECT public.record_match_result('d2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a',8000,0,0)::text$q$);
    v_ok := pg_temp.wins('a0000000-0000-0000-0000-00000000000a') = w0
        AND (SELECT winner_id FROM public.match_history WHERE duel_id = 'd2000000-0000-0000-0000-000000000002') = 'b0000000-0000-0000-0000-00000000000b';
    v_d := format('%s | winner no histórico=%s', r, (SELECT winner_id FROM public.match_history WHERE duel_id = 'd2000000-0000-0000-0000-000000000002'));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: perdedor não reescreve vencedor/pontos chamando record_match_result', v_ok, v_d);
END $$;

-- S16: duelo alheio (eve não participa)
DO $$
DECLARE r text; r2 text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    UPDATE public.live_duels SET status = 'finished' WHERE id = 'd2000000-0000-0000-0000-000000000002';
    r := pg_temp.q('e0000000-0000-0000-0000-00000000000e',
      $q$SELECT public.record_match_result('d2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a',8000,0,0)::text$q$);
    r2 := pg_temp.q('e0000000-0000-0000-0000-00000000000e',
      $q$SELECT public.record_match_result('d2000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-00000000000e','b0000000-0000-0000-0000-00000000000b','e0000000-0000-0000-0000-00000000000e',8000,0,0)::text$q$);
    v_ok := r LIKE 'ERR:%' AND r2 LIKE 'ERR:%' AND pg_temp.wins('e0000000-0000-0000-0000-00000000000e') = 0;
    v_d := format('%s | %s', r, r2);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: record_match_result de duelo alheio é rejeitado', v_ok, v_d);
END $$;

-- S17: pelo trigger: participante infla live_duels.bet_amount / LP e finaliza
DO $$
DECLARE r text; v_ok boolean := false; v_d text; p0 int;
BEGIN
  BEGIN
    p0 := pg_temp.pts('a0000000-0000-0000-0000-00000000000a');
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$UPDATE public.live_duels SET bet_amount = 1000000 WHERE id = 'd2000000-0000-0000-0000-000000000002' RETURNING 'updated'$q$);
    PERFORM pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$UPDATE public.live_duels SET status = 'finished', winner_id = auth.uid() WHERE id = 'd2000000-0000-0000-0000-000000000002' RETURNING 'x'$q$);
    v_ok := pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0 <= 110;
    v_d := format('update bet=%s | +%s pontos', r, pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: UPDATE live_duels.bet_amount=1.000.000 + fim de duelo não gera pontos absurdos', v_ok, v_d);
END $$;

DO $$
DECLARE r text; v_ok boolean := false; v_d text; p0 int;
BEGIN
  BEGIN
    p0 := pg_temp.pts('a0000000-0000-0000-0000-00000000000a');
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$UPDATE public.live_duels SET status = 'finished', winner_id = auth.uid(), player1_lp = 100000000 WHERE id = 'd2000000-0000-0000-0000-000000000002' RETURNING 'x'$q$);
    v_ok := pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0 <= 110;
    v_d := format('%s | +%s pontos', r, pg_temp.pts('a0000000-0000-0000-0000-00000000000a') - p0);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: fim de duelo com player1_lp=100.000.000 não gera pontos absurdos', v_ok, v_d);
END $$;

DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$INSERT INTO public.live_duels (creator_id, opponent_id, status, is_ranked, max_players, tcg_type, bet_amount)
         VALUES (auth.uid(), 'b0000000-0000-0000-0000-00000000000b', 'in_progress', true, 2, 'yugioh', 1000000) RETURNING bet_amount::text$q$);
    v_ok := r LIKE 'ERR:%' OR r = '0';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('S: cliente não cria duelo com bet_amount forjado', v_ok, v_d);
END $$;

-- ===========================================================================
-- L. CAMINHOS LEGÍTIMOS
-- ===========================================================================

-- L1: TournamentWinnerSelector: criadora paga p_amount = tournament.prize_pool
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',500)::text$q$);
    v_ok := pg_temp.js(r, 'success') = 'true' AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 1500;
    v_d := format('%s | saldo bob=%s (esperado 1500)', r, pg_temp.bal('b0000000-0000-0000-0000-00000000000b'));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: criadora paga o prize_pool (500) do torneio normal via tournament_pay_winner', v_ok, v_d);
END $$;

-- L2: dividir o prêmio entre colocados (soma <= pool)
DO $$
DECLARE r1 text; r2 text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r1 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',300)::text$q$);
    r2 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a',200)::text$q$);
    v_ok := pg_temp.js(r1, 'success') = 'true' AND pg_temp.js(r2, 'success') = 'true'
        AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 1300 AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1200;
    v_d := format('1o=%s | 2o=%s', r1, r2);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: vários colocados (300 + 200 de um pool de 500)', v_ok, v_d);
END $$;

-- L3: admin paga o prêmio de torneio de outra pessoa
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('d0000000-0000-0000-0000-00000000000d',
      $q$SELECT public.tournament_pay_winner('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a',500)::text$q$);
    v_ok := pg_temp.js(r, 'success') = 'true' AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1500;
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: admin paga prêmio via tournament_pay_winner', v_ok, v_d);
END $$;

-- L4: edge function distribute-tournament-prize (JWT do criador) -> finalize_tournament_and_pay_winner
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.finalize_tournament_and_pay_winner('71000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b')::text$q$);
    v_ok := pg_temp.js(r, 'success') = 'true'
        AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 1000 + (pg_temp.js(r, 'prize_amount'))::int
        AND (pg_temp.js(r, 'prize_amount'))::int > 0
        AND (SELECT status FROM public.tournaments WHERE id = '71000000-0000-0000-0000-000000000001') = 'completed'
        AND (SELECT status FROM public.tournament_participants WHERE tournament_id = '71000000-0000-0000-0000-000000000001' AND user_id = 'b0000000-0000-0000-0000-00000000000b') = 'winner';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: criadora finaliza e paga via finalize_tournament_and_pay_winner (edge function)', v_ok, v_d);
END $$;

-- L5: distribute_tournament_prize pela criadora e pelo admin
DO $$
DECLARE r text; r2 text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.distribute_tournament_prize('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$);
    v_ok := pg_temp.js(r, 'success') = 'true' AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1200;
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: criadora distribui (taxas = 200) via distribute_tournament_prize', v_ok, v_d);
  BEGIN
    r2 := pg_temp.q('d0000000-0000-0000-0000-00000000000d',
      $q$SELECT public.finalize_tournament_and_pay_winner('73000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-00000000000e')::text$q$);
    v_ok := pg_temp.js(r2, 'success') = 'true' AND pg_temp.bal('e0000000-0000-0000-0000-00000000000e') = 1000;
    v_d := r2;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: admin finaliza torneio legado sem dono', v_ok, v_d);
END $$;

-- L6: torneio SEMANAL ponta a ponta: criar (debita prêmio), entrar (debita taxa), premiar
DO $$
DECLARE r text; r2 text; r3 text; v_tid uuid; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.create_weekly_tournament('t_semanal', 'x', 300, 10, 32)::text$q$);
    v_tid := (pg_temp.js(r, 'tournament_id'))::uuid;
    r2 := pg_temp.q('b0000000-0000-0000-0000-00000000000b',
      format($q$SELECT public.join_weekly_tournament(%L)::text$q$, v_tid));
    r3 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      format($q$SELECT public.tournament_pay_winner(%L,'b0000000-0000-0000-0000-00000000000b',300)::text$q$, v_tid));
    v_ok := pg_temp.js(r, 'success') = 'true' AND pg_temp.js(r2, 'success') = 'true' AND pg_temp.js(r3, 'success') = 'true'
        AND pg_temp.bal('c0000000-0000-0000-0000-00000000000c') = 1700
        AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 1000 - 10 + 300;
    v_d := format('create=%s | join=%s | pay=%s | carol=%s bob=%s', r, r2, r3,
                  pg_temp.bal('c0000000-0000-0000-0000-00000000000c'), pg_temp.bal('b0000000-0000-0000-0000-00000000000b'));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: torneio semanal: criar, entrar e premiar (300)', v_ok, v_d);
END $$;

-- L7: torneio NORMAL ponta a ponta (create_normal_tournament + charge-tournament-entry-fee simulado)
--     A edge function debita o saldo com o JWT do usuário e grava o lançamento
--     com service_role (o INSERT em duelcoins_transactions é bloqueado para authenticated).
DO $$
DECLARE r text; r2 text; v_tid uuid; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.create_normal_tournament('t_normal2', 'x', now(), now() + interval '2 days', 400, 50, 8, 'single_elimination', false)::text$q$);
    v_tid := (pg_temp.js(r, 'tournament_id'))::uuid;
    PERFORM pg_temp.q('b0000000-0000-0000-0000-00000000000b',
      $q$UPDATE public.profiles SET duelcoins_balance = duelcoins_balance - 50 WHERE user_id = auth.uid() RETURNING 'x'$q$);
    PERFORM pg_temp.q(NULL, format($q$INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description)
      VALUES ('b0000000-0000-0000-0000-00000000000b', NULL, 50, 'tournament_entry', %L, 'Inscrição') RETURNING 'x'$q$, v_tid), 'service_role');
    PERFORM pg_temp.q('b0000000-0000-0000-0000-00000000000b',
      format($q$INSERT INTO public.tournament_participants (tournament_id, user_id, status) VALUES (%L, auth.uid(), 'registered') RETURNING 'x'$q$, v_tid));
    r2 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      format($q$SELECT public.tournament_pay_winner(%L,'b0000000-0000-0000-0000-00000000000b',400)::text$q$, v_tid));
    v_ok := pg_temp.js(r, 'success') = 'true' AND pg_temp.js(r2, 'success') = 'true'
        AND pg_temp.bal('c0000000-0000-0000-0000-00000000000c') = 1600
        AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 1000 - 50 + 400;
    v_d := format('create=%s | pay=%s | bob=%s', r, r2, pg_temp.bal('b0000000-0000-0000-0000-00000000000b'));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: torneio normal: criar (prêmio 400), entrar (50) e premiar (400)', v_ok, v_d);
END $$;

-- L8: TournamentDetail.removeParticipant: criadora apaga a inscrição e depois reembolsa (semanal)
DO $$
DECLARE r text; r2 text; r3 text; v_tid uuid; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.create_weekly_tournament('t_semanal2', 'x', 100, 10, 32)::text$q$);
    v_tid := (pg_temp.js(r, 'tournament_id'))::uuid;
    PERFORM pg_temp.q('b0000000-0000-0000-0000-00000000000b', format($q$SELECT public.join_weekly_tournament(%L)::text$q$, v_tid));
    r2 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      format($q$WITH d AS (DELETE FROM public.tournament_participants WHERE tournament_id = %L AND user_id = 'b0000000-0000-0000-0000-00000000000b' RETURNING 1) SELECT count(*)::text FROM d$q$, v_tid));
    r3 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      format($q$SELECT public.tournament_refund_participant(%L,'b0000000-0000-0000-0000-00000000000b')::text$q$, v_tid));
    v_ok := r2 = '1' AND pg_temp.js(r3, 'success') = 'true' AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 1000;
    v_d := format('delete=%s | refund=%s | bob=%s (esperado 1000)', r2, r3, pg_temp.bal('b0000000-0000-0000-0000-00000000000b'));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: remoção + reembolso da taxa em torneio semanal', v_ok, v_d);
END $$;

-- L9: reembolso em torneio normal; participante volta, paga de novo e é removido de novo
DO $$
DECLARE r1 text; r2 text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    PERFORM pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$DELETE FROM public.tournament_participants WHERE tournament_id = '71000000-0000-0000-0000-000000000001' AND user_id = 'a0000000-0000-0000-0000-00000000000a' RETURNING 'x'$q$);
    r1 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_refund_participant('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$);
    -- volta (edge function: débito com JWT, lançamento com service_role)
    PERFORM pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$UPDATE public.profiles SET duelcoins_balance = duelcoins_balance - 100 WHERE user_id = auth.uid() RETURNING 'x'$q$);
    PERFORM pg_temp.q(NULL, $q$INSERT INTO public.duelcoins_transactions (sender_id, amount, transaction_type, tournament_id, description)
      VALUES ('a0000000-0000-0000-0000-00000000000a', 100, 'tournament_entry', '71000000-0000-0000-0000-000000000001', 'Inscrição') RETURNING 'x'$q$, 'service_role');
    PERFORM pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$INSERT INTO public.tournament_participants (tournament_id, user_id, status) VALUES ('71000000-0000-0000-0000-000000000001', auth.uid(), 'registered') RETURNING 'x'$q$);
    PERFORM pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$DELETE FROM public.tournament_participants WHERE tournament_id = '71000000-0000-0000-0000-000000000001' AND user_id = 'a0000000-0000-0000-0000-00000000000a' RETURNING 'x'$q$);
    r2 := pg_temp.q('c0000000-0000-0000-0000-00000000000c',
      $q$SELECT public.tournament_refund_participant('71000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a')::text$q$);
    -- alice pagou 100 (fixture) + 100 (volta) = 200; recebeu 2 reembolsos de 100
    v_ok := pg_temp.js(r1, 'success') = 'true' AND pg_temp.js(r2, 'success') = 'true'
        AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1100;
    v_d := format('1o=%s | 2o=%s | alice=%s (esperado 1100)', r1, r2, pg_temp.bal('a0000000-0000-0000-0000-00000000000a'));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: reembolso em torneio normal, inclusive 2a inscrição paga e removida', v_ok, v_d);
END $$;

-- L10: GoPro / ProPlansSection: activate_subscription({p_user_id: userId, p_plan_id})
DO $$
DECLARE r text; v_ok boolean := false; v_d text; v_pro text;
BEGIN
  BEGIN
    r := pg_temp.q('b0000000-0000-0000-0000-00000000000b',
      $q$SELECT public.activate_subscription(auth.uid(),'78000000-0000-0000-0000-000000000008')::text$q$);
    v_pro := pg_temp.q('b0000000-0000-0000-0000-00000000000b', $q$SELECT public.is_user_pro(auth.uid())::text$q$);
    v_ok := pg_temp.js(r, 'success') = 'true' AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 800
        AND (SELECT account_type FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b') = 'pro'
        AND v_pro = 'true';
    v_d := format('%s | is_user_pro=%s', r, v_pro);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: usuário ativa assinatura com o próprio saldo (+ is_user_pro)', v_ok, v_d);
END $$;

-- L11: BattlePass: bp_purchase_pro
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('b0000000-0000-0000-0000-00000000000b',
      $q$SELECT public.bp_purchase_pro('75000000-0000-0000-0000-000000000005')::text$q$);
    v_ok := pg_temp.js(r, 'success') = 'true' AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 950;
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: bp_purchase_pro', v_ok, v_d);
END $$;

-- L12: useSubscriptionExpirationCheck: check_expired_subscriptions (expira a da eve, mantém a do bob)
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    PERFORM pg_temp.q('b0000000-0000-0000-0000-00000000000b',
      $q$SELECT public.activate_subscription(auth.uid(),'78000000-0000-0000-0000-000000000008')::text$q$);
    r := pg_temp.q('b0000000-0000-0000-0000-00000000000b', $q$SELECT public.check_expired_subscriptions()::text$q$);
    v_ok := r NOT LIKE 'ERR:%'
        AND (SELECT account_type FROM public.profiles WHERE user_id = 'e0000000-0000-0000-0000-00000000000e') = 'free'
        AND NOT (SELECT is_active FROM public.user_subscriptions WHERE id = '79000000-0000-0000-0000-000000000009')
        AND (SELECT account_type FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b') = 'pro';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: check_expired_subscriptions expira a vencida e mantém a ativa', v_ok, v_d);
END $$;

-- L13: admin dá PRO (edge function admin-toggle-pro usa service_role) e is_user_pro
DO $$
DECLARE r text; v_pro text; v_free text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q(NULL, $q$UPDATE public.profiles SET account_type = 'pro' WHERE user_id = 'f0000000-0000-0000-0000-00000000000f' RETURNING account_type::text$q$, 'service_role');
    v_pro  := pg_temp.q('f0000000-0000-0000-0000-00000000000f', $q$SELECT public.is_user_pro('f0000000-0000-0000-0000-00000000000f')::text$q$);
    v_free := pg_temp.q('f0000000-0000-0000-0000-00000000000f', $q$SELECT public.is_user_pro('a0000000-0000-0000-0000-00000000000a')::text$q$);
    v_ok := r = 'pro' AND v_pro = 'true' AND v_free = 'false';
    v_d := format('update=%s | is_user_pro(frank)=%s | is_user_pro(alice)=%s', r, v_pro, v_free);
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: admin dá PRO (service_role) e is_user_pro responde certo', v_ok, v_d);
END $$;

-- L14: DuelRoom.endDuel: UPDATE live_duels (authenticated) dispara o trigger que pontua;
--      depois o front chama record_match_result com duel.bet_amount (0)
DO $$
DECLARE r text; r2 text; v_ok boolean := false; v_d text; mh record; tp record;
BEGIN
  BEGIN
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$UPDATE public.live_duels SET status = 'finished', finished_at = now(), winner_id = 'a0000000-0000-0000-0000-00000000000a', player1_lp = 6500, player2_lp = 0
         WHERE id = 'd1000000-0000-0000-0000-000000000001' RETURNING status::text$q$);
    r2 := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$SELECT public.record_match_result('d1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a',6500,0,0)::text$q$);
    SELECT * INTO mh FROM public.match_history WHERE duel_id = 'd1000000-0000-0000-0000-000000000001';
    SELECT * INTO tp FROM public.tcg_profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a' AND tcg_type = 'yugioh';
    -- 10 + 6500/100 = 75 para alice; bob perde 75/2 = 37 (20 -> 0)
    v_ok := r = 'finished' AND r2 NOT LIKE 'ERR:%'
        AND pg_temp.wins('a0000000-0000-0000-0000-00000000000a') = 1 AND pg_temp.pts('a0000000-0000-0000-0000-00000000000a') = 175
        AND pg_temp.losses('b0000000-0000-0000-0000-00000000000b') = 1 AND pg_temp.pts('b0000000-0000-0000-0000-00000000000b') = 0
        AND pg_temp.wins('b0000000-0000-0000-0000-00000000000b') = 0
        AND mh.ranked_points_awarded AND mh.ranked_points_change = 75 AND mh.winner_id = 'a0000000-0000-0000-0000-00000000000a'
        AND tp.wins = 1 AND tp.points = 75;
    v_d := format('update=%s | rpc=%s | alice w=%s p=%s | bob l=%s p=%s | mh=%s', r, r2,
                  pg_temp.wins('a0000000-0000-0000-0000-00000000000a'), pg_temp.pts('a0000000-0000-0000-0000-00000000000a'),
                  pg_temp.losses('b0000000-0000-0000-0000-00000000000b'), pg_temp.pts('b0000000-0000-0000-0000-00000000000b'),
                  row_to_json(mh));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: fim de duelo ranqueado (trigger + chamada do front) pontua 1x e certo', v_ok, v_d);
END $$;

-- L15: vitória do opponent (player2) pelo trigger, UPDATE feito pelo perdedor
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$UPDATE public.live_duels SET status = 'finished', winner_id = 'b0000000-0000-0000-0000-00000000000b', player1_lp = 0, player2_lp = 8000
         WHERE id = 'd1000000-0000-0000-0000-000000000001' RETURNING status::text$q$);
    -- bob: +90 (10 + 8000/100); alice: 100 - 45 = 55
    v_ok := pg_temp.wins('b0000000-0000-0000-0000-00000000000b') = 1 AND pg_temp.pts('b0000000-0000-0000-0000-00000000000b') = 110
        AND pg_temp.losses('a0000000-0000-0000-0000-00000000000a') = 1 AND pg_temp.pts('a0000000-0000-0000-0000-00000000000a') = 55;
    v_d := format('%s | bob w=%s p=%s | alice l=%s p=%s', r,
      pg_temp.wins('b0000000-0000-0000-0000-00000000000b'), pg_temp.pts('b0000000-0000-0000-0000-00000000000b'),
      pg_temp.losses('a0000000-0000-0000-0000-00000000000a'), pg_temp.pts('a0000000-0000-0000-0000-00000000000a'));
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: vitória do player2 pelo trigger (UPDATE do perdedor)', v_ok, v_d);
END $$;

-- L16: empate: UPDATE sem winner + chamada do front com p_winner_id NULL
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    PERFORM pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$UPDATE public.live_duels SET status = 'finished', finished_at = now(), winner_id = NULL WHERE id = 'd1000000-0000-0000-0000-000000000001' RETURNING 'x'$q$);
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$SELECT public.record_match_result('d1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b',NULL,8000,8000,0)::text$q$);
    v_ok := r NOT LIKE 'ERR:%'
        AND EXISTS (SELECT 1 FROM public.match_history WHERE duel_id = 'd1000000-0000-0000-0000-000000000001' AND winner_id IS NULL AND NOT ranked_points_awarded)
        AND pg_temp.wins('a0000000-0000-0000-0000-00000000000a') = 0 AND pg_temp.pts('a0000000-0000-0000-0000-00000000000a') = 100;
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: empate registra histórico sem pontos', v_ok, v_d);
END $$;

-- L17: duelo casual: vitória conta, pontos não
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('b0000000-0000-0000-0000-00000000000b',
      $q$UPDATE public.live_duels SET status = 'finished', winner_id = 'b0000000-0000-0000-0000-00000000000b', player2_lp = 8000 WHERE id = 'd3000000-0000-0000-0000-000000000003' RETURNING 'x'$q$);
    v_ok := pg_temp.wins('b0000000-0000-0000-0000-00000000000b') = 1 AND pg_temp.pts('b0000000-0000-0000-0000-00000000000b') = 20
        AND pg_temp.losses('a0000000-0000-0000-0000-00000000000a') = 1 AND pg_temp.pts('a0000000-0000-0000-0000-00000000000a') = 100;
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: duelo casual conta vitória/derrota sem pontos', v_ok, v_d);
END $$;

-- L18: matchmake (SECURITY DEFINER) continua criando duelo (bet_amount = 0)
DO $$
DECLARE r text; v_ok boolean := false; v_d text;
BEGIN
  BEGIN
    r := pg_temp.q('a0000000-0000-0000-0000-00000000000a',
      $q$INSERT INTO public.live_duels (creator_id, status, is_ranked, max_players, tcg_type) VALUES (auth.uid(), 'waiting', true, 2, 'yugioh') RETURNING bet_amount::text$q$);
    v_ok := r = '0';
    v_d := r;
    RAISE EXCEPTION '__rb__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rb__' THEN v_ok := false; v_d := SQLERRM; END IF;
  END;
  PERFORM pg_temp.ok('L: cliente cria sala de duelo (Duels.tsx) sem informar bet_amount', v_ok, v_d);
END $$;

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
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
