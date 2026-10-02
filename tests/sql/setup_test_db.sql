-- ============================================================================
-- SETUP MÍNIMO PARA TESTES DA RPC record_signup_attribution
-- ============================================================================
-- Cria (de forma idempotente) o mínimo da plataforma Supabase + a tabela profiles
-- com as MESMAS policies RLS e guards de produção relevantes para o teste.
--
-- Uso (Postgres local, como superuser):
--   createdb test_duelverse
--   psql -v ON_ERROR_STOP=1 -d test_duelverse -f tests/sql/setup_test_db.sql
--   psql -v ON_ERROR_STOP=1 -d test_duelverse -f supabase/migrations/20261002200000_signup_attribution.sql
--   psql -v ON_ERROR_STOP=1 -d test_duelverse -f tests/sql/test_signup_attribution.sql

-- Roles do Supabase (globais no cluster)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- auth (definições iguais às do Supabase)
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz DEFAULT now(),
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- public.profiles (colunas relevantes do schema real)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_type') THEN
    CREATE TYPE public.account_type AS ENUM ('free', 'pro');
  END IF;
END $$;
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
  duelcoins_balance integer DEFAULT 0,
  level integer DEFAULT 1,
  country_code text,
  language_code text,
  CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20)
);

-- Privilégios padrão do Supabase + RLS como em produção
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public profile data viewable by all" ON public.profiles;
CREATE POLICY "Public profile data viewable by all" ON public.profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
