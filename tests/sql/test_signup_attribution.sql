-- ============================================================================
-- TESTE DA RPC record_signup_attribution E TRIGGER protect_signup_attribution
-- ============================================================================
-- 
-- Este script pode ser rodado em um Postgres local com Docker ou apt install postgresql.
-- 
-- Setup mínimo:
-- 1. Criar extensão pgcrypto (para gen_random_uuid)
-- 2. Criar schema auth com stubs mínimos de auth.users, auth.uid(), auth.role()
-- 3. Criar schema public com a tabela profiles
-- 4. Rodar a migration 20261002200000_signup_attribution.sql
-- 5. Rodar este script
--
-- Exemplo:
--   psql -U postgres -d test_duelverse -f tests/sql/test_signup_attribution.sql

-- Preparação: limpar dados de teste anteriores
DO $$
BEGIN
  -- Limpar tabelas de teste
  DELETE FROM public.profiles WHERE username LIKE 'test_%';
  DELETE FROM auth.users WHERE email LIKE 'test_%@test.com';
END $$;

-- ============================================================================
-- TESTE 1: RPC grava atribuição na primeira chamada
-- ============================================================================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_result boolean;
BEGIN
  -- Criar usuário em auth.users (criado agora, < 24h)
  INSERT INTO auth.users (id, email, created_at)
  VALUES (v_user_id, 'test_user1@test.com', now());

  -- Criar profile
  INSERT INTO public.profiles (user_id, username)
  VALUES (v_user_id, 'test_user1');

  -- Simular contexto autenticado (forçar auth.uid() a retornar v_user_id)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  -- Chamar RPC record_signup_attribution
  SELECT public.record_signup_attribution(
    p_source := 'google',
    p_medium := 'cpc',
    p_campaign := 'summer2026',
    p_content := 'ad1',
    p_ref := 'influencer123',
    p_referrer := 'https://google.com/search',
    p_landing := '/comece'
  ) INTO v_result;

  -- Verificar que retornou true
  IF v_result != true THEN
    RAISE EXCEPTION 'TESTE 1 FALHOU: RPC deveria retornar true, retornou %', v_result;
  END IF;

  -- Verificar que gravou os dados
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_user_id
      AND signup_source = 'google'
      AND signup_medium = 'cpc'
      AND signup_campaign = 'summer2026'
      AND signup_content = 'ad1'
      AND signup_ref = 'influencer123'
      AND signup_referrer = 'https://google.com/search'
      AND signup_landing = '/comece'
      AND signup_attributed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TESTE 1 FALHOU: Dados não foram gravados corretamente';
  END IF;

  RAISE NOTICE 'TESTE 1 PASSOU: RPC gravou atribuição corretamente';
END $$;

-- ============================================================================
-- TESTE 2: RPC NÃO grava na segunda chamada (first-touch)
-- ============================================================================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_result boolean;
BEGIN
  -- Criar usuário em auth.users
  INSERT INTO auth.users (id, email, created_at)
  VALUES (v_user_id, 'test_user2@test.com', now());

  -- Criar profile
  INSERT INTO public.profiles (user_id, username)
  VALUES (v_user_id, 'test_user2');

  -- Simular contexto autenticado
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  -- Primeira chamada (deve gravar)
  SELECT public.record_signup_attribution(
    p_source := 'facebook',
    p_medium := 'social'
  ) INTO v_result;

  IF v_result != true THEN
    RAISE EXCEPTION 'TESTE 2 FALHOU: Primeira chamada deveria retornar true';
  END IF;

  -- Segunda chamada (NÃO deve gravar)
  SELECT public.record_signup_attribution(
    p_source := 'google',
    p_medium := 'cpc'
  ) INTO v_result;

  IF v_result != false THEN
    RAISE EXCEPTION 'TESTE 2 FALHOU: Segunda chamada deveria retornar false, retornou %', v_result;
  END IF;

  -- Verificar que manteve os dados da primeira chamada
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_user_id
      AND signup_source = 'facebook'
      AND signup_medium = 'social'
  ) THEN
    RAISE EXCEPTION 'TESTE 2 FALHOU: Dados da primeira chamada foram alterados';
  END IF;

  RAISE NOTICE 'TESTE 2 PASSOU: RPC não sobrescreve atribuição (first-touch)';
END $$;

-- ============================================================================
-- TESTE 3: RPC NÃO grava para usuário criado há mais de 24h
-- ============================================================================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_result boolean;
BEGIN
  -- Criar usuário em auth.users (criado há 25 horas)
  INSERT INTO auth.users (id, email, created_at)
  VALUES (v_user_id, 'test_user3@test.com', now() - interval '25 hours');

  -- Criar profile
  INSERT INTO public.profiles (user_id, username)
  VALUES (v_user_id, 'test_user3');

  -- Simular contexto autenticado
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  -- Chamar RPC (não deve gravar)
  SELECT public.record_signup_attribution(
    p_source := 'google'
  ) INTO v_result;

  IF v_result != false THEN
    RAISE EXCEPTION 'TESTE 3 FALHOU: RPC deveria retornar false para usuário > 24h, retornou %', v_result;
  END IF;

  -- Verificar que não gravou
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_user_id
      AND signup_attributed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TESTE 3 FALHOU: RPC gravou para usuário criado há mais de 24h';
  END IF;

  RAISE NOTICE 'TESTE 3 PASSOU: RPC não grava para usuário > 24h';
END $$;

-- ============================================================================
-- TESTE 4: RPC grava 'direct' quando não vem nenhum parâmetro
-- ============================================================================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_result boolean;
BEGIN
  -- Criar usuário em auth.users
  INSERT INTO auth.users (id, email, created_at)
  VALUES (v_user_id, 'test_user4@test.com', now());

  -- Criar profile
  INSERT INTO public.profiles (user_id, username)
  VALUES (v_user_id, 'test_user4');

  -- Simular contexto autenticado
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  -- Chamar RPC sem parâmetros
  SELECT public.record_signup_attribution() INTO v_result;

  IF v_result != true THEN
    RAISE EXCEPTION 'TESTE 4 FALHOU: RPC deveria retornar true';
  END IF;

  -- Verificar que gravou 'direct'
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_user_id
      AND signup_source = 'direct'
      AND signup_attributed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TESTE 4 FALHOU: RPC deveria gravar signup_source = ''direct''';
  END IF;

  RAISE NOTICE 'TESTE 4 PASSOU: RPC grava ''direct'' quando não vem nenhum parâmetro';
END $$;

-- ============================================================================
-- TESTE 5: RPC aplica limites de tamanho
-- ============================================================================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_long_string text := repeat('a', 200);
  v_result boolean;
BEGIN
  -- Criar usuário em auth.users
  INSERT INTO auth.users (id, email, created_at)
  VALUES (v_user_id, 'test_user5@test.com', now());

  -- Criar profile
  INSERT INTO public.profiles (user_id, username)
  VALUES (v_user_id, 'test_user5');

  -- Simular contexto autenticado
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id)::text, true);

  -- Chamar RPC com strings longas
  SELECT public.record_signup_attribution(
    p_source := v_long_string,
    p_referrer := v_long_string
  ) INTO v_result;

  IF v_result != true THEN
    RAISE EXCEPTION 'TESTE 5 FALHOU: RPC deveria retornar true';
  END IF;

  -- Verificar que truncou para 100 chars (source) e 255 chars (referrer)
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_user_id
      AND char_length(signup_source) = 100
      AND char_length(signup_referrer) = 255
  ) THEN
    RAISE EXCEPTION 'TESTE 5 FALHOU: RPC não aplicou limites de tamanho corretamente';
  END IF;

  RAISE NOTICE 'TESTE 5 PASSOU: RPC aplica limites de tamanho';
END $$;

-- ============================================================================
-- TESTE 6: Usuário NÃO pode alterar colunas signup_* diretamente
-- ============================================================================
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
BEGIN
  -- Criar usuário em auth.users
  INSERT INTO auth.users (id, email, created_at)
  VALUES (v_user_id, 'test_user6@test.com', now());

  -- Criar profile com atribuição
  INSERT INTO public.profiles (user_id, username, signup_source, signup_attributed_at)
  VALUES (v_user_id, 'test_user6', 'google', now());

  -- Simular contexto autenticado (authenticated, não service_role)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);

  -- Tentar alterar signup_source via UPDATE direto
  -- O trigger protect_signup_attribution deve impedir a alteração
  UPDATE public.profiles
  SET signup_source = 'forged_source', username = 'test_user6_updated'
  WHERE user_id = v_user_id;

  -- Verificar que signup_source não foi alterado, mas username foi
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_user_id
      AND signup_source = 'google' -- Manteve o original
      AND username = 'test_user6_updated' -- Atualizou o username
  ) THEN
    RAISE EXCEPTION 'TESTE 6 FALHOU: Trigger não protegeu colunas signup_*';
  END IF;

  RAISE NOTICE 'TESTE 6 PASSOU: Usuário não pode alterar colunas signup_*';
END $$;

-- ============================================================================
-- TESTE 7: RPC NÃO executa para anon (sem autenticação)
-- ============================================================================
DO $$
DECLARE
  v_result boolean;
BEGIN
  -- Limpar contexto autenticado (simular anon)
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Tentar chamar RPC sem auth.uid()
  SELECT public.record_signup_attribution(p_source := 'google') INTO v_result;

  IF v_result != false THEN
    RAISE EXCEPTION 'TESTE 7 FALHOU: RPC deveria retornar false para anon, retornou %', v_result;
  END IF;

  RAISE NOTICE 'TESTE 7 PASSOU: RPC não executa para anon';
END $$;

-- ============================================================================
-- RESUMO
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'TODOS OS TESTES PASSARAM!';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
END $$;
