-- ============================================================================
-- Testes de integração: guards de public.profiles
--   (20261002210000_fix_profile_guards_invoker.sql)
-- ============================================================================
--
-- Roda contra um banco com o schema REAL (todas as migrations aplicadas, com
-- stubs mínimos do Supabase: roles anon/authenticated/service_role, schema auth
-- com auth.uid()/auth.role() lendo request.jwt.claims, como no PostgREST).
-- Simula requests do PostgREST com SET LOCAL ROLE + request.jwt.claims.
-- Tudo roda numa transação com ROLLBACK no final: não deixa resíduo.
--
--   psql -v ON_ERROR_STOP=1 -d <db> -f tests/sql/test_profile_guards.sql
--
-- Sai com erro (exit != 0) se QUALQUER caso falhar; a última linha
-- "TODOS OS TESTES PASSARAM" só aparece se tudo passou.
--
-- Cobre:
--   S*: exploit fechado (todas as colunas protegidas, flag forjado, vazamento
--       na mesma transação, saldo negativo, perfil de terceiros, estrutura).
--   L*: caminhos legítimos (RPCs SECURITY DEFINER chamadas por usuário comum,
--       trigger de duelo ranqueado, service_role, admin, cron/SQL editor,
--       cadastro, edição de perfil pelo cliente, cobrança de inscrição).
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

CREATE FUNCTION pg_temp.bal(p_uid uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT duelcoins_balance FROM public.profiles WHERE user_id = p_uid;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (triggers desligados só durante o setup, para não depender do guard)
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
  ('e0000000-0000-0000-0000-00000000000e', 'seller@t.local','{}');

INSERT INTO public.profiles (user_id, username, duelcoins_balance, account_type) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 't_alice',  1000, 'free'),
  ('b0000000-0000-0000-0000-00000000000b', 't_bob',     100, 'free'),
  ('c0000000-0000-0000-0000-00000000000c', 't_carol',   500, 'pro'),
  ('d0000000-0000-0000-0000-00000000000d', 't_admin',     0, 'free'),
  ('e0000000-0000-0000-0000-00000000000e', 't_seller',    0, 'free');

INSERT INTO public.user_roles (user_id, role) VALUES
  ('a0000000-0000-0000-0000-00000000000a', 'user'),
  ('b0000000-0000-0000-0000-00000000000b', 'user'),
  ('c0000000-0000-0000-0000-00000000000c', 'user'),
  ('d0000000-0000-0000-0000-00000000000d', 'admin'),
  ('e0000000-0000-0000-0000-00000000000e', 'user');

-- torneio semanal da carol (bob se inscreve), torneio ativo da alice (premiação)
INSERT INTO public.tournaments (id, name, start_date, end_date, max_participants, prize_pool, entry_fee, created_by, status, is_weekly) VALUES
  ('f1000000-0000-0000-0000-000000000001', 't_weekly', now(), now() + interval '7 days', 32, 0, 10, 'c0000000-0000-0000-0000-00000000000c', 'upcoming', true),
  ('f2000000-0000-0000-0000-000000000002', 't_active', now() - interval '2 days', now() + interval '1 day',   8, 300, 0, 'a0000000-0000-0000-0000-00000000000a', 'active', false);
INSERT INTO public.tournament_participants (tournament_id, user_id, status) VALUES
  ('f2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', 'registered');

-- duelo ranqueado alice x bob em andamento
INSERT INTO public.live_duels (id, creator_id, opponent_id, status, is_ranked, max_players, tcg_type, bet_amount, player1_lp, player2_lp)
VALUES ('f3000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b',
        'in_progress', true, 2, 'yugioh', 0, 8000, 0);

-- log de juiz resolvido pela alice há 5 min
INSERT INTO public.judge_logs (id, match_id, player_id, judge_id, status, judge_entered_at)
VALUES ('f4000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000003',
        'b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'resolved', now() - interval '5 minutes');

-- battle pass
INSERT INTO public.battle_pass_seasons (id, name, season_number, is_active, pro_price_duelcoins, starts_at, ends_at)
VALUES ('f5000000-0000-0000-0000-000000000005', 't_season', 987654, true, 50, now() - interval '1 day', now() + interval '30 days');
INSERT INTO public.battle_pass_levels (season_id, level, wins_required) VALUES ('f5000000-0000-0000-0000-000000000005', 1, 0);
INSERT INTO public.battle_pass_rewards (id, season_id, level, track, reward_type, title, amount)
VALUES ('f6000000-0000-0000-0000-000000000006', 'f5000000-0000-0000-0000-000000000005', 1, 'free', 'duelcoins', 't_reward', 30);

-- marketplace: produto de vendedor terceiro
INSERT INTO public.marketplace_products (id, name, price_duelcoins, is_active, stock, product_type, category, seller_id, is_third_party_seller, is_approved)
VALUES ('f7000000-0000-0000-0000-000000000007', 't_product', 100, true, 10, 'digital', 'digital',
        'e0000000-0000-0000-0000-00000000000e', true, true);

-- PRO: plano; assinatura expirada da carol (PRO)
INSERT INTO public.subscription_plans (id, name, price_duelcoins, duration_days, is_active)
VALUES ('f8000000-0000-0000-0000-000000000008', 't_plan', 200, 30, true);
INSERT INTO public.user_subscriptions (user_id, plan_id, is_active, starts_at, expires_at)
VALUES ('c0000000-0000-0000-0000-00000000000c', 'f8000000-0000-0000-0000-000000000008', true, now() - interval '31 days', now() - interval '1 day');

-- pedido de DuelCoins pendente (crédito via webhook Mercado Pago/Stripe)
INSERT INTO public.duelcoins_packages (id, name, duelcoins_amount, price_brl) VALUES ('f9000000-0000-0000-0000-000000000009', 't_pkg', 500, 10);
INSERT INTO public.duelcoins_orders (id, user_id, package_id, amount_brl, duelcoins_amount, status)
VALUES ('fa000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a', 'f9000000-0000-0000-0000-000000000009', 10, 500, 'pending');

SET LOCAL session_replication_role = origin;

-- ===========================================================================
-- S. EXPLOIT FECHADO
-- ===========================================================================

-- S1..S11: cada coluna protegida, UPDATE direto do próprio usuário (PostgREST)
DO $$
DECLARE
  v_alice uuid := 'a0000000-0000-0000-0000-00000000000a';
  c record;
  v_blocked boolean;
  v_err text;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('duelcoins_balance (aumento)', 'duelcoins_balance = duelcoins_balance + 1000000'),
    ('account_type = pro',          $q$account_type = 'pro'$q$),
    ('is_banned',                   'is_banned = true'),
    ('is_verified',                 'is_verified = true'),
    ('verified_at',                 'verified_at = now()'),
    ('points',                      'points = points + 5000'),
    ('wins',                        'wins = wins + 99'),
    ('losses',                      'losses = losses + 1'),
    ('level',                       'level = 99'),
    ('user_id',                     $q$user_id = 'b0000000-0000-0000-0000-00000000000b'$q$),
    ('created_at',                  $q$created_at = now() - interval '5 years'$q$)
  ) AS t(label, setexpr)
  LOOP
    v_blocked := false; v_err := NULL;
    BEGIN
      PERFORM pg_temp.login(v_alice);
      EXECUTE format('UPDATE public.profiles SET %s WHERE user_id = auth.uid()', c.setexpr);
      RAISE EXCEPTION '__not_blocked__';
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_blocked := (SQLERRM <> '__not_blocked__');
    END;
    PERFORM pg_temp.ok('S: authenticated NÃO altera ' || c.label, v_blocked, v_err);
  END LOOP;
END $$;

-- S12: flag forjado (o PR original liberava qualquer um com app.bypass_profile_guard)
DO $$
DECLARE v_ok boolean := false; v_err text;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    PERFORM set_config('app.bypass_profile_guard', 'true', true);
    UPDATE public.profiles SET duelcoins_balance = 999999, account_type = 'pro' WHERE user_id = auth.uid();
    RAISE EXCEPTION '__not_blocked__';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := (SQLERRM <> '__not_blocked__');
  END;
  PERFORM pg_temp.ok('S: flag app.bypass_profile_guard forjado não libera', v_ok, v_err);
END $$;

-- S13: depois de uma RPC SECURITY DEFINER, a MESMA transação (ex.: 2 mutations
-- no pg_graphql) não herda privilégio
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.create_weekly_tournament('t_isca', 'x', 1, 0, 32);
    IF NOT coalesce((r->>'success')::boolean, false) THEN RAISE EXCEPTION 'setup: %', r; END IF;
    UPDATE public.profiles SET duelcoins_balance = 999999, account_type = 'pro' WHERE user_id = auth.uid();
    RAISE EXCEPTION '__not_blocked__';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := (SQLERRM <> '__not_blocked__' AND SQLERRM NOT LIKE 'setup:%');
  END;
  PERFORM pg_temp.ok('S: UPDATE após RPC na mesma transação continua bloqueado', v_ok, v_err);
END $$;

-- S14: reduzir o próprio saldo abaixo de zero
DO $$
DECLARE v_ok boolean := false; v_err text;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    UPDATE public.profiles SET duelcoins_balance = -1 WHERE user_id = auth.uid();
    RAISE EXCEPTION '__not_blocked__';
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := (SQLERRM <> '__not_blocked__');
  END;
  PERFORM pg_temp.ok('S: saldo próprio negativo bloqueado', v_ok, v_err);
END $$;

-- S15: perfil de terceiros (RLS) — nenhuma linha afetada
DO $$
DECLARE v_n int; v_err text; v_ok boolean;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    UPDATE public.profiles SET username = 'hacked_bob' WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    PERFORM pg_temp.logout();
    v_ok := (v_n = 0);
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; v_ok := true;
  END;
  PERFORM pg_temp.ok('S: não altera perfil de terceiros', v_ok, coalesce(v_err, 'rows=' || v_n));
END $$;

-- S16: estrutura — guards SECURITY INVOKER, ativos, sem duplicatas
DO $$
BEGIN
  PERFORM pg_temp.ok('S: guards são SECURITY INVOKER',
    NOT bool_or(prosecdef) AND count(*) = 2,
    string_agg(proname || '=' || CASE WHEN prosecdef THEN 'DEFINER' ELSE 'INVOKER' END, ', '))
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('prevent_profile_privilege_escalation', 'prevent_profile_tampering');

  PERFORM pg_temp.ok('S: exatamente 1 trigger ativo por guard em profiles',
    count(*) FILTER (WHERE p.proname = 'prevent_profile_privilege_escalation') = 1
    AND count(*) FILTER (WHERE p.proname = 'prevent_profile_tampering') = 1,
    string_agg(t.tgname, ', '))
  FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE t.tgrelid = 'public.profiles'::regclass AND NOT t.tgisinternal AND t.tgenabled <> 'D';

  -- S17: o modelo "current_user NOT IN (anon, authenticated)" pressupõe que
  -- nenhuma SECURITY DEFINER pertença a um papel de cliente
  PERFORM pg_temp.ok('S: nenhuma SECURITY DEFINER com dono anon/authenticated',
    count(*) = 0, string_agg(proname, ', '))
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace AND prosecdef
    AND pg_get_userbyid(proowner) IN ('anon', 'authenticated');
END $$;

-- ===========================================================================
-- L. CAMINHOS LEGÍTIMOS
-- ===========================================================================

-- L1: edição de perfil pelo cliente (AvatarUpload, LanguageSelector, useOnlineStatus, Navbar)
DO $$
DECLARE v_ok boolean := false; v_err text; p record;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    UPDATE public.profiles SET avatar_url = 'https://x/a.png?t=1' WHERE user_id = auth.uid();
    UPDATE public.profiles SET language_code = 'pt' WHERE user_id = auth.uid();
    UPDATE public.profiles SET country_code = 'BR' WHERE user_id = auth.uid();
    UPDATE public.profiles SET is_online = true, last_seen = now() WHERE user_id = auth.uid();
    UPDATE public.profiles SET is_online = false, last_seen = now(), updated_at = now() WHERE user_id = auth.uid();
    UPDATE public.profiles SET username = 't_alice2' WHERE user_id = auth.uid();
    SELECT * INTO p FROM public.profiles WHERE user_id = auth.uid();
    PERFORM pg_temp.logout();
    v_ok := p.avatar_url LIKE 'https://x/a.png%' AND p.language_code = 'pt' AND p.country_code = 'BR'
            AND p.username = 't_alice2' AND NOT p.is_online;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: usuário edita avatar/idioma/país/online/username', v_ok, v_err);
END $$;

-- L2: cobrança de inscrição pela edge function charge-tournament-entry-fee
-- (cliente supabase-js com o JWT do usuário: UPDATE direto reduzindo o próprio saldo)
DO $$
DECLARE v_ok boolean := false; v_err text; v_after int;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    UPDATE public.profiles SET duelcoins_balance = 1000 - 10 WHERE user_id = auth.uid();
    PERFORM pg_temp.logout();
    v_after := pg_temp.bal('a0000000-0000-0000-0000-00000000000a');
    v_ok := (v_after = 990);
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: edge charge-tournament-entry-fee (usuário reduz o próprio saldo)', v_ok, v_err);
END $$;

-- L3: create_weekly_tournament
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.create_weekly_tournament('t_w', 'd', 500, 10, 32);
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false) AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 500;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: create_weekly_tournament debita prêmio', v_ok, v_err);
END $$;

-- L4: join_weekly_tournament
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login('b0000000-0000-0000-0000-00000000000b');
    r := public.join_weekly_tournament('f1000000-0000-0000-0000-000000000001');
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false) AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 90;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: join_weekly_tournament debita inscrição', v_ok, v_err);
END $$;

-- L5: create_normal_tournament (assinatura usada em CreateTournament.tsx)
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.create_normal_tournament(p_name => 't_n', p_description => 'd', p_start_date => now(),
           p_end_date => now() + interval '1 day', p_prize_pool => 100, p_entry_fee => 5,
           p_max_participants => 8, p_tournament_type => 'single_elimination', p_requires_decklist => false);
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false) AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 900;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: create_normal_tournament debita prêmio', v_ok, v_err);
END $$;

-- L6: transfer_duelcoins
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.transfer_duelcoins('b0000000-0000-0000-0000-00000000000b', 50);
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false)
            AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 950
            AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 150;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: transfer_duelcoins', v_ok, v_err);
END $$;

-- L7: change_nickname (custa 20 DC)
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.change_nickname('t_alice_nick');
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false) AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 980;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: change_nickname', v_ok, v_err);
END $$;

-- L8: bp_claim_reward (+30 DC)
DO $$
DECLARE v_ok boolean := false; v_err text; r jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.bp_claim_reward('f6000000-0000-0000-0000-000000000006');
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false) AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1030;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: bp_claim_reward credita DuelCoins', v_ok, v_err);
END $$;

-- L9: bp_purchase_pro (-50 DC)
DO $$
DECLARE v_ok boolean := false; v_err text; r jsonb;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.bp_purchase_pro('f5000000-0000-0000-0000-000000000005');
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false) AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 950;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: bp_purchase_pro', v_ok, v_err);
END $$;

-- L10: purchase_marketplace_items (comprador -100, vendedor terceiro +100)
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.purchase_marketplace_items('[{"product_id":"f7000000-0000-0000-0000-000000000007","quantity":1}]'::jsonb, NULL, NULL);
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false)
            AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 900
            AND pg_temp.bal('e0000000-0000-0000-0000-00000000000e') = 100;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: purchase_marketplace_items (comprador e vendedor)', v_ok, v_err);
END $$;

-- L11: activate_subscription (PRO com DuelCoins: -200 e account_type = pro)
DO $$
DECLARE v_ok boolean := false; v_err text; r json; p record;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.activate_subscription('a0000000-0000-0000-0000-00000000000a', 'f8000000-0000-0000-0000-000000000008');
    PERFORM pg_temp.logout();
    SELECT * INTO p FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
    v_ok := coalesce((r->>'success')::boolean, false) AND p.duelcoins_balance = 800 AND p.account_type = 'pro';
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: activate_subscription vira PRO', v_ok, v_err);
END $$;

-- L12: check_expired_subscriptions chamado por qualquer usuário (useSubscriptionExpirationCheck)
DO $$
DECLARE v_ok boolean := false; v_err text; v_type text;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    PERFORM public.check_expired_subscriptions();
    PERFORM pg_temp.logout();
    SELECT account_type INTO v_type FROM public.profiles WHERE user_id = 'c0000000-0000-0000-0000-00000000000c';
    v_ok := (v_type = 'free');
    v_err := 'carol=' || v_type;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: check_expired_subscriptions rebaixa PRO expirado', v_ok, v_err);
END $$;

-- L13: duelo ranqueado finalizado pelo cliente (trigger -> record_match_result)
DO $$
DECLARE v_ok boolean := false; v_err text; a record; b record;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    UPDATE public.live_duels SET status = 'finished', winner_id = auth.uid(), finished_at = now()
     WHERE id = 'f3000000-0000-0000-0000-000000000003';
    PERFORM pg_temp.logout();
    SELECT wins, points INTO a FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
    SELECT losses INTO b FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    v_ok := a.wins = 1 AND a.points > 0 AND b.losses = 1;
    v_err := format('alice wins=%s points=%s bob losses=%s', a.wins, a.points, b.losses);
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: duelo ranqueado finalizado atualiza wins/points', v_ok, v_err);
END $$;

-- L14: record_match_result chamado direto (DuelRoom.tsx)
DO $$
DECLARE v_ok boolean := false; v_err text; v_w int;
BEGIN
  BEGIN
    UPDATE public.live_duels SET status = 'in_progress' WHERE id = 'f3000000-0000-0000-0000-000000000003';
    PERFORM pg_temp.login('b0000000-0000-0000-0000-00000000000b');
    PERFORM public.record_match_result('f3000000-0000-0000-0000-000000000003',
      'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b',
      'b0000000-0000-0000-0000-00000000000b', 0, 8000, 0);
    PERFORM pg_temp.logout();
    SELECT wins INTO v_w FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    v_ok := (v_w = 1);
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: record_match_result direto', v_ok, v_err);
END $$;

-- L15: premiação de torneio pelo criador (finalize_tournament_and_pay_winner,
-- usada pela edge distribute-tournament-prize com o JWT do usuário)
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.finalize_tournament_and_pay_winner('f2000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b');
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false) AND pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 400;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: premiação de torneio pelo criador', v_ok, v_err);
END $$;

-- L16: reward_judge_resolution (+2 DC)
DO $$
DECLARE v_ok boolean := false; v_err text; r boolean;
BEGIN
  BEGIN
    PERFORM pg_temp.login('a0000000-0000-0000-0000-00000000000a');
    r := public.reward_judge_resolution('a0000000-0000-0000-0000-00000000000a', 'f4000000-0000-0000-0000-000000000004');
    PERFORM pg_temp.logout();
    v_ok := r AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1002;
    v_err := 'ret=' || r;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: reward_judge_resolution', v_ok, v_err);
END $$;

-- L17: service_credit_duelcoins via service_role (webhooks Mercado Pago/Stripe/CartPanda)
DO $$
DECLARE v_ok boolean := false; v_err text; r json;
BEGIN
  BEGIN
    PERFORM pg_temp.login(NULL, 'service_role');
    r := public.service_credit_duelcoins('fa000000-0000-0000-0000-00000000000a', 'mp_123', 'pix');
    PERFORM pg_temp.logout();
    v_ok := coalesce((r->>'success')::boolean, false) AND pg_temp.bal('a0000000-0000-0000-0000-00000000000a') = 1500;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: service_credit_duelcoins (service_role)', v_ok, v_err);
END $$;

-- L18: service_role UPDATE direto (edge admin-toggle-pro)
DO $$
DECLARE v_ok boolean := false; v_err text; v_type text;
BEGIN
  BEGIN
    PERFORM pg_temp.login(NULL, 'service_role');
    UPDATE public.profiles SET account_type = 'pro' WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    PERFORM pg_temp.logout();
    SELECT account_type INTO v_type FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    v_ok := (v_type = 'pro');
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: service_role altera account_type (admin-toggle-pro)', v_ok, v_err);
END $$;

-- L19: admin pelo cliente: UPDATE direto de account_type (AdminUsers.tsx)
DO $$
DECLARE v_ok boolean := false; v_err text; v_type text;
BEGIN
  BEGIN
    PERFORM pg_temp.login('d0000000-0000-0000-0000-00000000000d');
    UPDATE public.profiles SET account_type = 'pro' WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    PERFORM pg_temp.logout();
    SELECT account_type INTO v_type FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    v_ok := (v_type = 'pro');
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: admin muda account_type pelo painel', v_ok, v_err);
END $$;

-- L20: admin_manage_duelcoins + admin_set_user_verified
DO $$
DECLARE v_ok boolean := false; v_err text; r json; v jsonb; p record;
BEGIN
  BEGIN
    PERFORM pg_temp.login('d0000000-0000-0000-0000-00000000000d');
    r := public.admin_manage_duelcoins('b0000000-0000-0000-0000-00000000000b', 25, 'add', 'teste');
    v := public.admin_set_user_verified('b0000000-0000-0000-0000-00000000000b', true);
    PERFORM pg_temp.logout();
    SELECT * INTO p FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    v_ok := coalesce((r->>'success')::boolean, false) AND p.duelcoins_balance = 125 AND p.is_verified;
    v_err := r::text;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: admin_manage_duelcoins / admin_set_user_verified', v_ok, v_err);
END $$;

-- L21: servidor sem JWT (pg_cron, SQL editor do dashboard)
DO $$
DECLARE v_ok boolean := false; v_err text;
BEGIN
  BEGIN
    PERFORM pg_temp.logout();
    UPDATE public.profiles SET duelcoins_balance = duelcoins_balance + 7, account_type = 'pro', points = 1
     WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
    v_ok := pg_temp.bal('b0000000-0000-0000-0000-00000000000b') = 107;
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: cron / SQL editor (postgres sem JWT) altera saldo', v_ok, v_err);
END $$;

-- L22: cadastro novo (trigger handle_new_user em auth.users)
DO $$
DECLARE v_ok boolean := false; v_err text; p record;
BEGIN
  BEGIN
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES ('ab000000-0000-0000-0000-0000000000ab', 'novo@t.local', '{"username":"t_novo","language_code":"pt"}');
    SELECT * INTO p FROM public.profiles WHERE user_id = 'ab000000-0000-0000-0000-0000000000ab';
    v_ok := p.user_id IS NOT NULL AND p.duelcoins_balance = 0 AND p.account_type = 'free' AND p.language_code = 'pt';
    v_err := format('profile=%s', row_to_json(p));
    RAISE EXCEPTION '__rollback__';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM <> '__rollback__' THEN v_err := SQLERRM; v_ok := false; END IF;
  END;
  PERFORM pg_temp.ok('L: cadastro novo cria profile', v_ok, v_err);
END $$;

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
SELECT n, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name,
       CASE WHEN ok THEN '' ELSE left(coalesce(detail, ''), 160) END AS detail
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
