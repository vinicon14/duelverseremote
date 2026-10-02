-- ============================================================================
-- Testes da RPC record_signup_attribution e do trigger protect_signup_attribution
-- ============================================================================
-- Simula o PostgREST: cada "request" é uma transação com SET LOCAL ROLE
-- (anon/authenticated/service_role) + request.jwt.claims.
-- Rode com ON_ERROR_STOP (qualquer falha aborta com exit code != 0):
--   psql -v ON_ERROR_STOP=1 -d <db> -f tests/sql/test_signup_attribution.sql
-- Pré-requisito: schema com profiles + migration aplicada (ver tests/sql/README.md).
\set ON_ERROR_STOP 1
\set QUIET 1
SET client_min_messages = notice;

\set alice '''a0000000-0000-0000-0000-00000000000a'''
\set bob   '''b0000000-0000-0000-0000-00000000000b'''
\set carol '''c0000000-0000-0000-0000-00000000000c'''
\set dave  '''d0000000-0000-0000-0000-00000000000d'''

-- Limpeza e fixtures (como postgres)
DELETE FROM public.profiles WHERE user_id IN (:alice, :bob, :carol, :dave);
DELETE FROM auth.users WHERE id IN (:alice, :bob, :carol, :dave);
INSERT INTO auth.users (id, email, created_at) VALUES
  (:alice, 'sa_alice@test.com', now() - interval '1 hour'),
  (:bob,   'sa_bob@test.com',   now() - interval '25 hours'),
  (:carol, 'sa_carol@test.com', now()),
  (:dave,  'sa_dave@test.com',  now());
-- Perfis: no schema real o handle_new_user cria; no setup mínimo, cria aqui.
INSERT INTO public.profiles (user_id, username) VALUES
  (:alice, 'sa_alice'), (:bob, 'sa_bob'), (:dave, 'sa_dave')
ON CONFLICT (user_id) DO NOTHING;
DELETE FROM public.profiles WHERE user_id = :carol;  -- carol: perfil ainda não existe

-- ---------------------------------------------------------------------------
-- 1. Dono edita o próprio perfil (username/avatar) -> funciona
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :alice, 'role', 'authenticated')::text, true) \gset
UPDATE public.profiles SET username = 'sa_alice2', avatar_url = 'https://x/a.png' WHERE user_id = auth.uid();
COMMIT;
DO $$ BEGIN
  IF (SELECT username FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a') <> 'sa_alice2' THEN
    RAISE EXCEPTION 'T1 FALHOU: update legítimo do perfil não aplicou';
  END IF;
  RAISE NOTICE 'T1 ok: dono edita username/avatar';
END $$;

-- 2. Dono tenta escrever signup_* direto (inclusive forjando o flag) -> revertido em silêncio
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :alice, 'role', 'authenticated')::text, true) \gset
SELECT set_config('duelverse.signup_attribution_write', 'on', true) \gset
UPDATE public.profiles
   SET signup_source = 'hacked', signup_attributed_at = now(), username = 'sa_alice3'
 WHERE user_id = auth.uid();
COMMIT;
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
  IF r.signup_source IS NOT NULL OR r.signup_attributed_at IS NOT NULL THEN
    RAISE EXCEPTION 'T2 FALHOU: cliente conseguiu escrever signup_* (source=%)', r.signup_source;
  END IF;
  IF r.username <> 'sa_alice3' THEN
    RAISE EXCEPTION 'T2 FALHOU: as outras colunas do mesmo UPDATE deveriam ser aplicadas';
  END IF;
  RAISE NOTICE 'T2 ok: cliente não altera signup_* (nem com flag forjado); resto do UPDATE aplica';
END $$;

-- 3. RPC grava na primeira chamada (com sanitização e limites)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :alice, 'role', 'authenticated')::text, true) \gset
SELECT set_config('t.r1', coalesce((public.record_signup_attribution(
  p_source := '  tiktok' || chr(10) || chr(1), p_medium := 'social', p_campaign := repeat('c', 300),
  p_content := 'video1', p_ref := 'creator42', p_referrer := repeat('r', 400), p_landing := '/comece'
))::text, 'null'), false) \gset
COMMIT;
DO $$ DECLARE r record; BEGIN
  IF NOT current_setting('t.r1')::boolean THEN RAISE EXCEPTION 'T3 FALHOU: 1a chamada deveria retornar true'; END IF;
  SELECT * INTO r FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
  IF r.signup_source IS DISTINCT FROM 'tiktok' OR r.signup_medium IS DISTINCT FROM 'social'
     OR length(r.signup_campaign) <> 100 OR r.signup_content IS DISTINCT FROM 'video1'
     OR r.signup_ref IS DISTINCT FROM 'creator42' OR length(r.signup_referrer) <> 255
     OR r.signup_landing IS DISTINCT FROM '/comece' OR r.signup_attributed_at IS NULL THEN
    RAISE EXCEPTION 'T3 FALHOU: dados gravados incorretos: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'T3 ok: RPC grava (true), sanitiza controle/trim e limita 100/255';
END $$;

-- 4. Segunda chamada -> false e nada muda (write-once)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :alice, 'role', 'authenticated')::text, true) \gset
SELECT set_config('t.r2', coalesce((public.record_signup_attribution(p_source := 'google'))::text, 'null'), false) \gset
COMMIT;
DO $$ BEGIN
  IF current_setting('t.r2')::boolean THEN RAISE EXCEPTION 'T4 FALHOU: 2a chamada deveria retornar false'; END IF;
  IF (SELECT signup_source FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a') <> 'tiktok' THEN
    RAISE EXCEPTION 'T4 FALHOU: atribuição foi sobrescrita';
  END IF;
  RAISE NOTICE 'T4 ok: RPC escreve uma única vez';
END $$;

-- 5. Depois de gravado, o dono não consegue apagar/alterar
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :alice, 'role', 'authenticated')::text, true) \gset
UPDATE public.profiles SET signup_source = NULL, signup_attributed_at = NULL WHERE user_id = auth.uid();
COMMIT;
DO $$ BEGIN
  IF (SELECT signup_source FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a') IS DISTINCT FROM 'tiktok' THEN
    RAISE EXCEPTION 'T5 FALHOU: dono apagou a atribuição';
  END IF;
  RAISE NOTICE 'T5 ok: dono não apaga atribuição gravada';
END $$;

-- 6. Usuário criado há mais de 24h -> false, nada gravado
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :bob, 'role', 'authenticated')::text, true) \gset
SELECT set_config('t.r6', coalesce((public.record_signup_attribution(p_source := 'google'))::text, 'null'), false) \gset
COMMIT;
DO $$ BEGIN
  IF current_setting('t.r6')::boolean THEN RAISE EXCEPTION 'T6 FALHOU: usuário > 24h não deveria ser atribuído'; END IF;
  IF (SELECT signup_attributed_at FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b') IS NOT NULL THEN
    RAISE EXCEPTION 'T6 FALHOU: gravou para usuário > 24h';
  END IF;
  RAISE NOTICE 'T6 ok: usuário > 24h rejeitado';
END $$;

-- 7. Perfil ainda não existe -> NULL (cliente tenta de novo)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :carol, 'role', 'authenticated')::text, true) \gset
SELECT set_config('t.r7', coalesce((public.record_signup_attribution(p_source := 'google') IS NULL)::text, 'null'), false) \gset
COMMIT;
DO $$ BEGIN
  IF NOT current_setting('t.r7')::boolean THEN RAISE EXCEPTION 'T7 FALHOU: sem perfil deveria retornar NULL'; END IF;
  RAISE NOTICE 'T7 ok: sem perfil -> NULL (retry no cliente)';
END $$;

-- 8. Sem parâmetros -> 'direct'; só referrer -> host + 'referral'
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :dave, 'role', 'authenticated')::text, true) \gset
SELECT set_config('t.r8', coalesce((public.record_signup_attribution())::text, 'null'), false) \gset
COMMIT;
DO $$ BEGIN
  IF NOT current_setting('t.r8')::boolean OR (SELECT signup_source FROM public.profiles WHERE user_id = 'd0000000-0000-0000-0000-00000000000d') <> 'direct' THEN
    RAISE EXCEPTION 'T8 FALHOU: sem parâmetros deveria gravar direct';
  END IF;
  RAISE NOTICE 'T8 ok: sem parâmetros grava direct';
END $$;
-- (referrer-only: reseta dave como postgres e chama de novo)
UPDATE public.profiles SET signup_source = NULL, signup_medium = NULL, signup_attributed_at = NULL
 WHERE user_id = 'd0000000-0000-0000-0000-00000000000d';
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :dave, 'role', 'authenticated')::text, true) \gset
SELECT set_config('t.r8b', coalesce((public.record_signup_attribution(p_referrer := 'reddit.com'))::text, 'null'), false) \gset
COMMIT;
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.profiles WHERE user_id = 'd0000000-0000-0000-0000-00000000000d';
  IF NOT current_setting('t.r8b')::boolean OR r.signup_source <> 'reddit.com' OR r.signup_medium <> 'referral' THEN
    RAISE EXCEPTION 'T8b FALHOU: %', row_to_json(r);
  END IF;
  RAISE NOTICE 'T8b ok: só referrer -> source=host, medium=referral';
END $$;

-- 9. anon não executa a RPC
DO $$ BEGIN
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  BEGIN
    PERFORM public.record_signup_attribution(p_source := 'google');
    RAISE EXCEPTION 'T9 FALHOU: anon executou a RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'T9 ok: anon -> permission denied';
  END;
  RESET ROLE;
END $$;
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.record_signup_attribution(text,text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.record_signup_attribution(text,text,text,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.record_signup_attribution(text,text,text,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'T9b FALHOU: grants incorretos';
  END IF;
  RAISE NOTICE 'T9b ok: EXECUTE só para authenticated (não PUBLIC/anon)';
END $$;

-- 10. service_role pode alterar signup_* (correções/backfill)
BEGIN;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true) \gset
UPDATE public.profiles SET signup_source = 'fixed_by_service', signup_attributed_at = now()
 WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
COMMIT;
DO $$ BEGIN
  IF (SELECT signup_source FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b') IS DISTINCT FROM 'fixed_by_service' THEN
    RAISE EXCEPTION 'T10 FALHOU: service_role não conseguiu alterar signup_*';
  END IF;
  RAISE NOTICE 'T10 ok: service_role altera signup_*';
END $$;

-- 11. SQL direto (postgres, sem JWT: migrations/SQL editor) pode alterar
UPDATE public.profiles SET signup_campaign = 'backfill' WHERE user_id = 'b0000000-0000-0000-0000-00000000000b';
DO $$ BEGIN
  IF (SELECT signup_campaign FROM public.profiles WHERE user_id = 'b0000000-0000-0000-0000-00000000000b') IS DISTINCT FROM 'backfill' THEN
    RAISE EXCEPTION 'T11 FALHOU: SQL direto não conseguiu alterar signup_*';
  END IF;
  RAISE NOTICE 'T11 ok: SQL direto (sem JWT) altera signup_*';
END $$;

-- 12. Outra função SECURITY DEFINER chamada pelo cliente continua atualizando profiles,
--     e não consegue mexer em signup_*
CREATE OR REPLACE FUNCTION public.__test_definer_touch_profile(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  UPDATE public.profiles SET is_online = true, last_seen = now(), signup_source = 'via_other_definer'
   WHERE user_id = p_user;
END $f$;
GRANT EXECUTE ON FUNCTION public.__test_definer_touch_profile(uuid) TO authenticated;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :alice, 'role', 'authenticated')::text, true) \gset
SELECT public.__test_definer_touch_profile(auth.uid()) \gset
COMMIT;
DROP FUNCTION public.__test_definer_touch_profile(uuid);
DO $$ DECLARE r record; BEGIN
  SELECT * INTO r FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a';
  IF NOT r.is_online OR r.signup_source <> 'tiktok' THEN
    RAISE EXCEPTION 'T12 FALHOU: is_online=% source=%', r.is_online, r.signup_source;
  END IF;
  RAISE NOTICE 'T12 ok: outra função DEFINER atualiza profiles; signup_* preservadas';
END $$;

-- 13. Update frequente do cliente (is_online) sem tocar em signup_* continua funcionando
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', :alice, 'role', 'authenticated')::text, true) \gset
UPDATE public.profiles SET is_online = false, last_seen = now() WHERE user_id = auth.uid();
COMMIT;
DO $$ BEGIN
  IF (SELECT is_online FROM public.profiles WHERE user_id = 'a0000000-0000-0000-0000-00000000000a') THEN
    RAISE EXCEPTION 'T13 FALHOU: update de is_online não aplicou';
  END IF;
  RAISE NOTICE 'T13 ok: update de is_online/last_seen do cliente funciona';
END $$;

-- Limpeza
DELETE FROM public.profiles WHERE user_id IN (:alice, :bob, :carol, :dave);
DELETE FROM auth.users WHERE id IN (:alice, :bob, :carol, :dave);
\echo 'TODOS OS TESTES PASSARAM'
