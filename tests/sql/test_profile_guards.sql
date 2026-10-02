-- ============================================================================
-- Teste de segurança: Profile Guards (SECURITY INVOKER)
-- ============================================================================
--
-- Este script testa que os triggers de profile guards bloqueiam corretamente
-- modificações não autorizadas em campos privilegiados após a correção para
-- SECURITY INVOKER.
--
-- Para rodar: psql -v ON_ERROR_STOP=1 -f tests/sql/test_profile_guards.sql
--
-- ============================================================================

\set ON_ERROR_STOP 1
\timing on

-- Limpar ambiente de teste
DROP SCHEMA IF EXISTS test CASCADE;
CREATE SCHEMA test;
SET search_path TO test, public;

-- ============================================================================
-- Setup: Criar roles e stubs mínimos de auth
-- ============================================================================

-- Roles padrão do Supabase (se não existirem)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

-- Schema auth para stubs
CREATE SCHEMA IF NOT EXISTS auth;

-- Stub: auth.users
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE
);

-- Stub: auth.uid() e auth.role()
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'sub',
    current_setting('test.auth.uid', true)
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::json->>'role',
    current_setting('test.auth.role', true),
    current_user::text
  );
$$;

-- ============================================================================
-- Setup: Tabelas e funções necessárias
-- ============================================================================

-- Tabela user_roles para is_admin
CREATE TABLE IF NOT EXISTS test.user_roles (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);
ALTER TABLE test.user_roles ENABLE ROW LEVEL SECURITY;

-- Função has_role (stub simplificado)
CREATE OR REPLACE FUNCTION test.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO test
AS $$
  SELECT EXISTS(SELECT 1 FROM test.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Função is_admin (SECURITY DEFINER, como na migration real)
CREATE OR REPLACE FUNCTION test.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO test
AS $$
  SELECT test.has_role(_user_id, 'admin');
$$;

-- Tabela profiles (campos principais)
CREATE TABLE test.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  avatar_url text,
  bio text,
  is_online boolean DEFAULT false,
  duelcoins_balance integer DEFAULT 0,
  account_type text DEFAULT 'free' CHECK (account_type IN ('free', 'pro')),
  is_banned boolean DEFAULT false,
  points integer DEFAULT 0,
  wins integer DEFAULT 0,
  losses integer DEFAULT 0,
  level integer DEFAULT 1,
  is_verified boolean DEFAULT false,
  verified_at timestamptz,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE test.profiles ENABLE ROW LEVEL SECURITY;

-- Tabela duelcoins_transactions
CREATE TABLE test.duelcoins_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  transaction_type text NOT NULL CHECK (transaction_type IN (
    'transfer', 'admin_add', 'admin_remove', 'tournament_entry', 
    'tournament_prize', 'tournament_prize_deposit', 'subscription',
    'marketplace_purchase', 'judge_reward', 'nickname_change',
    'battle_pass_reward', 'battle_pass_mission', 'battle_pass_pro'
  )),
  description text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE test.duelcoins_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Importar triggers de profile guards (versão INVOKER corrigida)
-- ============================================================================

CREATE OR REPLACE FUNCTION test.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO test
AS $function$
DECLARE
  v_bypass text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Verificar bypass flag
  v_bypass := current_setting('app.bypass_profile_guard', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  IF test.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance
     OR NEW.account_type    IS DISTINCT FROM OLD.account_type
     OR NEW.is_banned       IS DISTINCT FROM OLD.is_banned
     OR NEW.points          IS DISTINCT FROM OLD.points
     OR NEW.wins            IS DISTINCT FROM OLD.wins
     OR NEW.losses          IS DISTINCT FROM OLD.losses
     OR NEW.level           IS DISTINCT FROM OLD.level
     OR NEW.user_id         IS DISTINCT FROM OLD.user_id
  THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION test.prevent_profile_tampering()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO test
AS $function$
DECLARE
  v_is_admin boolean := false;
  v_is_self boolean := (auth.uid() = NEW.user_id);
  v_bypass text;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Verificar bypass flag
  v_bypass := current_setting('app.bypass_profile_guard', true);
  IF v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_is_admin := test.is_admin(auth.uid());
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;
  
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.duelcoins_balance IS DISTINCT FROM OLD.duelcoins_balance THEN
    IF NOT v_is_self OR NEW.duelcoins_balance > OLD.duelcoins_balance THEN
      RAISE EXCEPTION 'Alteração de saldo só pode ser feita pelo servidor.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.is_banned   IS DISTINCT FROM OLD.is_banned
     OR NEW.level       IS DISTINCT FROM OLD.level
     OR NEW.points      IS DISTINCT FROM OLD.points
     OR NEW.wins        IS DISTINCT FROM OLD.wins
     OR NEW.losses      IS DISTINCT FROM OLD.losses
  THEN
    RAISE EXCEPTION 'Campo protegido: estatísticas, nível, status ou tipo de conta só podem ser alterados pelo servidor.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER prevent_profile_privilege_escalation_trigger
  BEFORE UPDATE ON test.profiles
  FOR EACH ROW
  EXECUTE FUNCTION test.prevent_profile_privilege_escalation();

CREATE TRIGGER prevent_profile_tampering_trigger
  BEFORE UPDATE ON test.profiles
  FOR EACH ROW
  EXECUTE FUNCTION test.prevent_profile_tampering();

-- ============================================================================
-- RPC: create_weekly_tournament (SECURITY DEFINER, bypass dos guards)
-- ============================================================================

-- Tabela tournaments (simplificada)
CREATE TABLE test.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  max_participants integer NOT NULL,
  prize_pool integer NOT NULL,
  entry_fee integer NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  status text DEFAULT 'upcoming',
  is_weekly boolean DEFAULT false,
  tournament_type text DEFAULT 'single_elimination',
  total_rounds integer,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION test.create_weekly_tournament(
  p_name text,
  p_description text,
  p_prize_pool integer,
  p_entry_fee integer,
  p_max_participants integer DEFAULT 32
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO test
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

  SELECT duelcoins_balance INTO v_balance FROM test.profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_prize_pool THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
  END IF;

  v_start_date := now();
  v_end_date := now() + interval '7 days';

  -- Setar bypass flag para permitir UPDATE (função SECURITY DEFINER)
  PERFORM set_config('app.bypass_profile_guard', 'true', true);
  
  UPDATE test.profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool WHERE user_id = v_user_id;

  INSERT INTO test.duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Torneio Semanal: ' || p_name);

  INSERT INTO test.tournaments (name, description, start_date, end_date, prize_pool, entry_fee, max_participants, tournament_type, total_rounds, created_by, status, is_weekly)
  VALUES (p_name, p_description, v_start_date, v_end_date, p_prize_pool, p_entry_fee, p_max_participants, 'single_elimination', 5, v_user_id, 'upcoming', true)
  RETURNING id INTO v_tournament_id;

  RETURN json_build_object('success', true, 'message', 'Torneio semanal criado', 'tournament_id', v_tournament_id);
END;
$$;

GRANT EXECUTE ON FUNCTION test.create_weekly_tournament TO authenticated;

-- ============================================================================
-- Dados de teste
-- ============================================================================

-- Usuários de teste
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'admin@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'hacker@test.com')
ON CONFLICT (id) DO NOTHING;

-- Profiles
INSERT INTO test.profiles (user_id, username, duelcoins_balance, account_type) VALUES
  ('11111111-1111-1111-1111-111111111111', 'normal_user', 1000, 'free'),
  ('22222222-2222-2222-2222-222222222222', 'admin_user', 5000, 'pro'),
  ('33333333-3333-3333-3333-333333333333', 'hacker_user', 100, 'free');

-- Admin role
INSERT INTO test.user_roles (user_id, role) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin');

-- ============================================================================
-- TESTES
-- ============================================================================

\echo ''
\echo '=========================================='
\echo 'TESTE 1: authenticated NÃO consegue aumentar duelcoins_balance'
\echo '=========================================='

SET test.auth.uid = '33333333-3333-3333-3333-333333333333';
SET test.auth.role = 'authenticated';

DO $$
BEGIN
  UPDATE test.profiles 
  SET duelcoins_balance = 999999 
  WHERE user_id = '33333333-3333-3333-3333-333333333333';
  
  RAISE EXCEPTION 'FALHOU: hacker conseguiu aumentar saldo!';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%só pode ser feita pelo servidor%' OR 
       SQLERRM LIKE '%Not allowed to modify privileged%' THEN
      RAISE NOTICE '✓ PASSOU: authenticated bloqueado ao tentar aumentar saldo';
    ELSE
      RAISE EXCEPTION 'FALHOU: erro inesperado: %', SQLERRM;
    END IF;
END $$;

\echo ''
\echo '=========================================='
\echo 'TESTE 2: authenticated NÃO consegue mudar account_type'
\echo '=========================================='

DO $$
BEGIN
  UPDATE test.profiles 
  SET account_type = 'pro' 
  WHERE user_id = '33333333-3333-3333-3333-333333333333';
  
  RAISE EXCEPTION 'FALHOU: hacker virou PRO!';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%Campo protegido%' OR 
       SQLERRM LIKE '%Not allowed to modify privileged%' THEN
      RAISE NOTICE '✓ PASSOU: authenticated bloqueado ao tentar virar PRO';
    ELSE
      RAISE EXCEPTION 'FALHOU: erro inesperado: %', SQLERRM;
    END IF;
END $$;

\echo ''
\echo '=========================================='
\echo 'TESTE 3: authenticated CONSEGUE mudar username/bio'
\echo '=========================================='

UPDATE test.profiles 
SET username = 'novo_username', bio = 'Nova bio' 
WHERE user_id = '33333333-3333-3333-3333-333333333333';

SELECT username, bio 
FROM test.profiles 
WHERE user_id = '33333333-3333-3333-3333-333333333333';

DO $$
DECLARE
  v_username text;
BEGIN
  SELECT username INTO v_username 
  FROM test.profiles 
  WHERE user_id = '33333333-3333-3333-3333-333333333333';
  
  IF v_username = 'novo_username' THEN
    RAISE NOTICE '✓ PASSOU: authenticated pode mudar campos não protegidos';
  ELSE
    RAISE EXCEPTION 'FALHOU: username não foi atualizado';
  END IF;
END $$;

\echo ''
\echo '=========================================='
\echo 'TESTE 4: Admin CONSEGUE mudar account_type'
\echo '=========================================='

SET test.auth.uid = '22222222-2222-2222-2222-222222222222';
SET test.auth.role = 'authenticated';

UPDATE test.profiles 
SET account_type = 'pro' 
WHERE user_id = '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  v_account_type text;
BEGIN
  SELECT account_type INTO v_account_type 
  FROM test.profiles 
  WHERE user_id = '11111111-1111-1111-1111-111111111111';
  
  IF v_account_type = 'pro' THEN
    RAISE NOTICE '✓ PASSOU: admin pode mudar account_type via is_admin()';
  ELSE
    RAISE EXCEPTION 'FALHOU: admin não conseguiu mudar account_type';
  END IF;
END $$;

\echo ''
\echo '=========================================='
\echo 'TESTE 5: service_role CONSEGUE mudar qualquer coisa'
\echo '=========================================='

SET test.auth.uid = '11111111-1111-1111-1111-111111111111';
SET test.auth.role = 'service_role';

UPDATE test.profiles 
SET duelcoins_balance = 9999, points = 500, wins = 100 
WHERE user_id = '11111111-1111-1111-1111-111111111111';

DO $$
DECLARE
  v_balance integer;
  v_points integer;
BEGIN
  SELECT duelcoins_balance, points INTO v_balance, v_points 
  FROM test.profiles 
  WHERE user_id = '11111111-1111-1111-1111-111111111111';
  
  IF v_balance = 9999 AND v_points = 500 THEN
    RAISE NOTICE '✓ PASSOU: service_role passa pelos guards';
  ELSE
    RAISE EXCEPTION 'FALHOU: service_role bloqueado';
  END IF;
END $$;

\echo ''
\echo '=========================================='
\echo 'TESTE 6: RPC create_weekly_tournament (SECURITY DEFINER) funciona'
\echo '=========================================='

-- Reset do usuário normal
UPDATE test.profiles SET duelcoins_balance = 1000 WHERE user_id = '11111111-1111-1111-1111-111111111111';

SET test.auth.uid = '11111111-1111-1111-1111-111111111111';
SET test.auth.role = 'authenticated';

DO $$
DECLARE
  v_result json;
  v_success boolean;
  v_balance_before integer;
  v_balance_after integer;
  v_tx_count integer;
BEGIN
  SELECT duelcoins_balance INTO v_balance_before 
  FROM test.profiles 
  WHERE user_id = '11111111-1111-1111-1111-111111111111';

  SELECT test.create_weekly_tournament(
    'Torneio Teste',
    'Teste de segurança',
    500,
    10,
    32
  ) INTO v_result;

  v_success := (v_result->>'success')::boolean;

  IF NOT v_success THEN
    RAISE EXCEPTION 'FALHOU: RPC retornou sucesso=false: %', v_result;
  END IF;

  SELECT duelcoins_balance INTO v_balance_after 
  FROM test.profiles 
  WHERE user_id = '11111111-1111-1111-1111-111111111111';

  IF v_balance_after != v_balance_before - 500 THEN
    RAISE EXCEPTION 'FALHOU: saldo não foi debitado corretamente (antes: %, depois: %)', v_balance_before, v_balance_after;
  END IF;

  SELECT COUNT(*) INTO v_tx_count 
  FROM test.duelcoins_transactions 
  WHERE sender_id = '11111111-1111-1111-1111-111111111111' 
    AND transaction_type = 'tournament_prize';

  IF v_tx_count != 1 THEN
    RAISE EXCEPTION 'FALHOU: transação não foi registrada';
  END IF;

  RAISE NOTICE '✓ PASSOU: RPC SECURITY DEFINER debita saldo e cria torneio atomicamente';
END $$;

\echo ''
\echo '=========================================='
\echo 'TESTE 7: RPC recusa saldo insuficiente'
\echo '=========================================='

DO $$
DECLARE
  v_result json;
  v_success boolean;
BEGIN
  SELECT test.create_weekly_tournament(
    'Torneio Impossível',
    'Sem saldo',
    99999,
    10,
    32
  ) INTO v_result;

  v_success := (v_result->>'success')::boolean;

  IF v_success THEN
    RAISE EXCEPTION 'FALHOU: RPC aceitou criação com saldo insuficiente!';
  END IF;

  IF v_result->>'message' LIKE '%insuficiente%' THEN
    RAISE NOTICE '✓ PASSOU: RPC recusa saldo insuficiente';
  ELSE
    RAISE EXCEPTION 'FALHOU: mensagem de erro inesperada: %', v_result;
  END IF;
END $$;

\echo ''
\echo '=========================================='
\echo 'TODOS OS TESTES PASSARAM!'
\echo '=========================================='
\echo ''

-- Limpar
RESET test.auth.uid;
RESET test.auth.role;
DROP SCHEMA test CASCADE;
