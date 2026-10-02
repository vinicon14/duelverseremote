-- ============================================================================
-- SETUP MÍNIMO PARA TESTES DA RPC record_signup_attribution
-- ============================================================================
-- 
-- Este script cria o schema mínimo necessário para testar a migration
-- 20261002200000_signup_attribution.sql em um Postgres local.
--
-- Uso:
--   1. Criar banco: createdb test_duelverse
--   2. Rodar setup: psql -U postgres -d test_duelverse -f tests/sql/setup_test_db.sql
--   3. Rodar migration: psql -U postgres -d test_duelverse -f supabase/migrations/20261002200000_signup_attribution.sql
--   4. Rodar testes: psql -U postgres -d test_duelverse -f tests/sql/test_signup_attribution.sql
--
-- Ou via Docker:
--   docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15

-- Criar extensão pgcrypto (para gen_random_uuid)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- SCHEMA AUTH (stubs mínimos de Supabase Auth)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS auth;

-- Tabela auth.users (stub mínimo)
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz DEFAULT now(),
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  app_metadata jsonb DEFAULT '{}'::jsonb
);

-- Função auth.uid() (stub: retorna o 'sub' do request.jwt.claims)
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$;

-- Função auth.role() (stub: retorna 'authenticated' por padrão, 'service_role' se definido)
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::json->>'role', ''),
    'authenticated'
  );
$$;

-- ============================================================================
-- SCHEMA PUBLIC
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS public;

-- Tipo account_type (simplificado)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE public.account_type AS ENUM ('free', 'pro');
  END IF;
END $$;

-- Tabela public.profiles (versão mínima para testes)
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  avatar_url text,
  account_type public.account_type DEFAULT 'free' NOT NULL,
  points integer DEFAULT 0 NOT NULL,
  wins integer DEFAULT 0 NOT NULL,
  losses integer DEFAULT 0 NOT NULL,
  is_online boolean DEFAULT false NOT NULL,
  is_banned boolean DEFAULT false NOT NULL,
  last_seen timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  country_code text,
  language_code text,
  CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20)
);

-- Tabela public.user_roles (stub mínimo, se necessário para testes futuros)
-- Não é necessária para os testes de atribuição, mas incluída por completude
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, role)
);

-- ============================================================================
-- PERMISSÕES BÁSICAS
-- ============================================================================
-- Em um ambiente de teste local, geralmente rodamos como superuser,
-- mas vamos garantir que o schema public esteja acessível.

GRANT ALL ON SCHEMA public TO PUBLIC;
GRANT ALL ON ALL TABLES IN SCHEMA public TO PUBLIC;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO PUBLIC;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;

-- ============================================================================
-- PRONTO PARA RODAR A MIGRATION E OS TESTES
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SETUP COMPLETO!';
  RAISE NOTICE 'Rode agora a migration 20261002200000_signup_attribution.sql';
  RAISE NOTICE 'Depois rode o teste tests/sql/test_signup_attribution.sql';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;
