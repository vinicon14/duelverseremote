-- =====================================================
-- Testes de Integração - Autorização de RPCs
-- =====================================================
-- 
-- Testes REAIS de autorização para as funções RPC corrigidas.
-- Requer Postgres local com:
-- - Roles: anon, authenticated, service_role
-- - Auth stubs: request.jwt.claims lendo auth.uid()/auth.role()
-- - Todas as migrations aplicadas
--
-- Executar: psql -d duelverse_test -f tests/sql/test_rpc_authz.sql
-- =====================================================

\set ON_ERROR_STOP on

BEGIN;

-- =====================================================
-- Setup: Criar usuários de teste
-- =====================================================

-- Limpar dados de teste anteriores
DELETE FROM public.duelcoins_transactions WHERE description LIKE '%TESTE%';
DELETE FROM public.tournament_participants WHERE tournament_id IN (
  SELECT id FROM public.tournaments WHERE name LIKE '%TESTE%'
);
DELETE FROM public.tournaments WHERE name LIKE '%TESTE%';
DELETE FROM public.user_subscriptions WHERE user_id IN (
  SELECT user_id FROM public.profiles WHERE username LIKE '%test_%'
);
DELETE FROM public.profiles WHERE username LIKE '%test_%';

-- Criar perfis de teste
INSERT INTO public.profiles (user_id, username, email, duelcoins_balance, account_type)
VALUES 
  ('00000000-0000-0000-0000-000000000001'::uuid, 'test_creator', 'creator@test.com', 10000, 'free'),
  ('00000000-0000-0000-0000-000000000002'::uuid, 'test_attacker', 'attacker@test.com', 5000, 'free'),
  ('00000000-0000-0000-0000-000000000003'::uuid, 'test_winner', 'winner@test.com', 1000, 'free'),
  ('00000000-0000-0000-0000-000000000004'::uuid, 'test_victim', 'victim@test.com', 20000, 'free'),
  ('00000000-0000-0000-0000-000000000005'::uuid, 'test_player1', 'player1@test.com', 500, 'free'),
  ('00000000-0000-0000-0000-000000000006'::uuid, 'test_player2', 'player2@test.com', 500, 'free')
ON CONFLICT (user_id) DO UPDATE SET
  duelcoins_balance = EXCLUDED.duelcoins_balance,
  account_type = 'free';

-- Criar torneio de teste
INSERT INTO public.tournaments (id, name, description, created_by, status, prize_pool, entry_fee, current_round, total_rounds)
VALUES (
  '10000000-0000-0000-0000-000000000001'::uuid,
  'Torneio TESTE',
  'Torneio para testes de segurança',
  '00000000-0000-0000-0000-000000000001'::uuid, -- test_creator
  'in_progress',
  5000,
  100,
  1,
  3
)
ON CONFLICT (id) DO UPDATE SET status = 'in_progress';

-- Adicionar participantes
INSERT INTO public.tournament_participants (tournament_id, user_id, status)
VALUES 
  ('10000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000003'::uuid, 'active'), -- test_winner
  ('10000000-0000-0000-0000-000000000001'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'active')  -- test_creator
ON CONFLICT (tournament_id, user_id) DO NOTHING;

-- Simular taxas de entrada pagas
INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, tournament_id, description)
VALUES 
  ('00000000-0000-0000-0000-000000000003'::uuid, NULL, 100, 'tournament_entry', '10000000-0000-0000-0000-000000000001'::uuid, 'Taxa TESTE'),
  ('00000000-0000-0000-0000-000000000001'::uuid, NULL, 100, 'tournament_entry', '10000000-0000-0000-0000-000000000001'::uuid, 'Taxa TESTE');

-- Criar plano de assinatura para testes
INSERT INTO public.subscription_plans (id, name, price_duelcoins, duration_days, is_active)
VALUES (
  '20000000-0000-0000-0000-000000000001'::uuid,
  'Plano Teste',
  1000,
  30,
  true
)
ON CONFLICT (id) DO UPDATE SET is_active = true;

-- Criar duelo ranqueado para testes de record_match_result
INSERT INTO public.live_duels (id, creator_id, opponent_id, status, is_ranked, bet_amount, tcg_type, max_players, player1_lp, player2_lp)
VALUES (
  '30000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000005'::uuid, -- test_player1
  '00000000-0000-0000-0000-000000000006'::uuid, -- test_player2
  'finished',
  true,
  50, -- aposta real: 50 pontos
  'yugioh',
  2,
  0,
  8000
)
ON CONFLICT (id) DO UPDATE SET status = 'finished', bet_amount = 50;

\echo '✓ Setup completo'
\echo ''

-- =====================================================
-- TESTE 1: distribute_tournament_prize - Ataque (não-criador)
-- =====================================================

\echo '=== TESTE 1: distribute_tournament_prize - Ataque (não-criador) ==='

-- Simular usuário authenticated que NÃO é o criador
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

DO $$
DECLARE
  v_result json;
BEGIN
  -- Tentar distribuir prêmio sendo atacante (não-criador)
  SELECT public.distribute_tournament_prize(
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid -- atacante tenta se pagar
  ) INTO v_result;

  IF v_result->>'success' = 'false' AND v_result->>'message' LIKE '%criador%' THEN
    RAISE NOTICE '✓ Ataque bloqueado: %', v_result->>'message';
  ELSE
    RAISE EXCEPTION '✗ FALHA: Atacante conseguiu distribuir prêmio! %', v_result;
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- TESTE 2: distribute_tournament_prize - Sucesso (criador legítimo)
-- =====================================================

\echo '=== TESTE 2: distribute_tournament_prize - Sucesso (criador legítimo) ==='

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

DO $$
DECLARE
  v_result json;
  v_balance_before int;
  v_balance_after int;
BEGIN
  SELECT duelcoins_balance INTO v_balance_before FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000003'::uuid;

  -- Criador distribui prêmio ao vencedor legítimo
  SELECT public.distribute_tournament_prize(
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid -- test_winner (participante)
  ) INTO v_result;

  IF v_result->>'success' = 'true' THEN
    SELECT duelcoins_balance INTO v_balance_after FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000003'::uuid;
    RAISE NOTICE '✓ Prêmio distribuído: % → % (+%)', v_balance_before, v_balance_after, v_balance_after - v_balance_before;
  ELSE
    RAISE EXCEPTION '✗ FALHA: Criador não conseguiu distribuir prêmio! %', v_result;
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- TESTE 3: distribute_tournament_prize - Idempotência
-- =====================================================

\echo '=== TESTE 3: distribute_tournament_prize - Idempotência ==='

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

DO $$
DECLARE
  v_result json;
BEGIN
  -- Tentar distribuir prêmio novamente (já foi pago no teste anterior)
  SELECT public.distribute_tournament_prize(
    '10000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid
  ) INTO v_result;

  IF v_result->>'success' = 'false' AND v_result->>'message' LIKE '%já foi%' THEN
    RAISE NOTICE '✓ Idempotência: %', v_result->>'message';
  ELSE
    RAISE EXCEPTION '✗ FALHA: Prêmio pago duas vezes! %', v_result;
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- TESTE 4: activate_subscription - Ataque (roubar DuelCoins)
-- =====================================================

\echo '=== TESTE 4: activate_subscription - Ataque (roubar DuelCoins) ==='

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

DO $$
DECLARE
  v_result json;
  v_balance_before int;
  v_balance_after int;
BEGIN
  SELECT duelcoins_balance INTO v_balance_before FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid;

  -- Atacante tenta ativar assinatura usando saldo da vítima
  SELECT public.activate_subscription(
    '00000000-0000-0000-0000-000000000004'::uuid, -- test_victim (20000 DuelCoins)
    '20000000-0000-0000-0000-000000000001'::uuid  -- plano de 1000 DuelCoins
  ) INTO v_result;

  IF v_result->>'success' = 'false' AND v_result->>'message' LIKE '%si mesmo%' THEN
    SELECT duelcoins_balance INTO v_balance_after FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid;
    IF v_balance_after = v_balance_before THEN
      RAISE NOTICE '✓ Ataque bloqueado: % (saldo preservado: %)', v_result->>'message', v_balance_after;
    ELSE
      RAISE EXCEPTION '✗ FALHA: Saldo alterado! % → %', v_balance_before, v_balance_after;
    END IF;
  ELSE
    RAISE EXCEPTION '✗ FALHA CRÍTICA: Atacante roubou DuelCoins! %', v_result;
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- TESTE 5: activate_subscription - Sucesso (próprio usuário)
-- =====================================================

\echo '=== TESTE 5: activate_subscription - Sucesso (próprio usuário) ==='

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}';

DO $$
DECLARE
  v_result json;
  v_balance_before int;
  v_balance_after int;
BEGIN
  SELECT duelcoins_balance INTO v_balance_before FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid;

  -- Usuário ativa assinatura com próprio saldo
  SELECT public.activate_subscription(
    '00000000-0000-0000-0000-000000000004'::uuid, -- próprio user_id
    '20000000-0000-0000-0000-000000000001'::uuid
  ) INTO v_result;

  IF v_result->>'success' = 'true' THEN
    SELECT duelcoins_balance INTO v_balance_after FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000004'::uuid;
    IF v_balance_after = v_balance_before - 1000 THEN
      RAISE NOTICE '✓ Assinatura ativada: % → % (-1000)', v_balance_before, v_balance_after;
    ELSE
      RAISE EXCEPTION '✗ FALHA: Valor debitado incorreto! % → %', v_balance_before, v_balance_after;
    END IF;
  ELSE
    RAISE EXCEPTION '✗ FALHA: Usuário não conseguiu ativar própria assinatura! %', v_result;
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- TESTE 6: record_match_result - Ataque (p_bet_amount inflado)
-- =====================================================

\echo '=== TESTE 6: record_match_result - Ataque (p_bet_amount inflado) ==='

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}';

DO $$
DECLARE
  v_match_id uuid;
  v_points_before int;
  v_points_after int;
  v_points_change int;
BEGIN
  SELECT points INTO v_points_before FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000005'::uuid;

  -- Atacante tenta registrar resultado com p_bet_amount inflado (1000000 em vez de 50)
  SELECT public.record_match_result(
    '30000000-0000-0000-0000-000000000001'::uuid, -- duelo com bet_amount = 50
    '00000000-0000-0000-0000-000000000005'::uuid, -- player1 (atacante, vencedor)
    '00000000-0000-0000-0000-000000000006'::uuid, -- player2
    '00000000-0000-0000-0000-000000000005'::uuid, -- winner = player1
    8000, -- player1_score
    0,    -- player2_score
    1000000 -- p_bet_amount INFLADO (real é 50)
  ) INTO v_match_id;

  SELECT points INTO v_points_after FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000005'::uuid;
  v_points_change := v_points_after - v_points_before;

  -- A função deve usar o valor REAL do banco (50), não o parâmetro (1000000)
  IF v_points_change = 50 THEN
    RAISE NOTICE '✓ Ataque bloqueado: pontos corretos (+50, não +1000000)';
  ELSIF v_points_change > 50 AND v_points_change <= 100 THEN
    -- Pode ter +10 base + score/100, mas nunca +1000000
    RAISE NOTICE '✓ Pontos dentro do esperado: +% (base+score, não bet inflado)', v_points_change;
  ELSIF v_points_change = 1000000 THEN
    RAISE EXCEPTION '✗ FALHA CRÍTICA: Atacante ganhou +1000000 pontos com bet inflado!';
  ELSE
    RAISE EXCEPTION '✗ Pontos inesperados: % → % (+%)', v_points_before, v_points_after, v_points_change;
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- TESTE 7: record_match_result - Trigger (valor correto do banco)
-- =====================================================

\echo '=== TESTE 7: record_match_result via trigger - Valor correto do banco ==='

-- Criar novo duelo para testar o trigger
INSERT INTO public.live_duels (id, creator_id, opponent_id, status, is_ranked, bet_amount, tcg_type, max_players, player1_lp, player2_lp, winner_id)
VALUES (
  '30000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000005'::uuid,
  '00000000-0000-0000-0000-000000000006'::uuid,
  'in_progress',
  true,
  75, -- aposta real
  'yugioh',
  2,
  8000,
  8000,
  NULL
)
ON CONFLICT (id) DO UPDATE SET status = 'in_progress', winner_id = NULL;

DO $$
DECLARE
  v_points_before int;
  v_points_after int;
  v_points_change int;
BEGIN
  SELECT points INTO v_points_before FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000006'::uuid;

  -- Trigger será disparado ao atualizar status e winner_id
  UPDATE public.live_duels
  SET status = 'finished', winner_id = '00000000-0000-0000-0000-000000000006'::uuid
  WHERE id = '30000000-0000-0000-0000-000000000002'::uuid;

  SELECT points INTO v_points_after FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000006'::uuid;
  v_points_change := v_points_after - v_points_before;

  -- Deve usar bet_amount = 75 do banco
  IF v_points_change = 75 THEN
    RAISE NOTICE '✓ Trigger: pontos corretos via banco (+75)';
  ELSIF v_points_change > 75 AND v_points_change <= 100 THEN
    RAISE NOTICE '✓ Trigger: pontos dentro do esperado (+%, base+score)', v_points_change;
  ELSE
    RAISE EXCEPTION '✗ Trigger: pontos inesperados (+%)', v_points_change;
  END IF;
END $$;

\echo ''

-- =====================================================
-- TESTE 8: tournament_pay_winner - Idempotência
-- =====================================================

\echo '=== TESTE 8: tournament_pay_winner - Idempotência ==='

-- Criar novo torneio para este teste (o anterior já foi usado)
INSERT INTO public.tournaments (id, name, created_by, status, prize_pool, entry_fee)
VALUES (
  '10000000-0000-0000-0000-000000000002'::uuid,
  'Torneio TESTE 2',
  '00000000-0000-0000-0000-000000000001'::uuid,
  'in_progress',
  1000,
  50
)
ON CONFLICT (id) DO UPDATE SET status = 'in_progress';

INSERT INTO public.tournament_participants (tournament_id, user_id, status)
VALUES ('10000000-0000-0000-0000-000000000002'::uuid, '00000000-0000-0000-0000-000000000003'::uuid, 'active')
ON CONFLICT (tournament_id, user_id) DO NOTHING;

INSERT INTO public.duelcoins_transactions (sender_id, amount, transaction_type, tournament_id)
VALUES ('00000000-0000-0000-0000-000000000003'::uuid, 50, 'tournament_entry', '10000000-0000-0000-0000-000000000002'::uuid);

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

DO $$
DECLARE
  v_result json;
  v_balance_after_first int;
  v_balance_after_second int;
BEGIN
  -- Primeira chamada: deve funcionar
  SELECT public.tournament_pay_winner(
    '10000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,
    50
  ) INTO v_result;

  IF v_result->>'success' <> 'true' THEN
    RAISE EXCEPTION '✗ Primeira chamada falhou: %', v_result;
  END IF;

  SELECT duelcoins_balance INTO v_balance_after_first FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000003'::uuid;

  -- Segunda chamada: deve ser bloqueada (idempotência)
  SELECT public.tournament_pay_winner(
    '10000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000003'::uuid,
    50
  ) INTO v_result;

  SELECT duelcoins_balance INTO v_balance_after_second FROM public.profiles WHERE user_id = '00000000-0000-0000-0000-000000000003'::uuid;

  IF v_result->>'success' = 'false' AND v_balance_after_first = v_balance_after_second THEN
    RAISE NOTICE '✓ Idempotência: segunda chamada bloqueada, saldo preservado';
  ELSE
    RAISE EXCEPTION '✗ FALHA: Prêmio pago duas vezes! saldo: % → %', v_balance_after_first, v_balance_after_second;
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- TESTE 9: tournament_refund_participant - Limite ao valor pago
-- =====================================================

\echo '=== TESTE 9: tournament_refund_participant - Limite ao valor pago ==='

-- Criar torneio com taxa de 100
INSERT INTO public.tournaments (id, name, created_by, status, entry_fee)
VALUES (
  '10000000-0000-0000-0000-000000000003'::uuid,
  'Torneio TESTE 3',
  '00000000-0000-0000-0000-000000000001'::uuid,
  'cancelled',
  100
)
ON CONFLICT (id) DO UPDATE SET status = 'cancelled', entry_fee = 100;

INSERT INTO public.tournament_participants (tournament_id, user_id)
VALUES ('10000000-0000-0000-0000-000000000003'::uuid, '00000000-0000-0000-0000-000000000002'::uuid)
ON CONFLICT (tournament_id, user_id) DO NOTHING;

-- Participante pagou apenas 50 (com desconto), não 100
INSERT INTO public.duelcoins_transactions (sender_id, amount, transaction_type, tournament_id)
VALUES ('00000000-0000-0000-0000-000000000002'::uuid, 50, 'tournament_entry', '10000000-0000-0000-0000-000000000003'::uuid);

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

DO $$
DECLARE
  v_result json;
  v_refunded int;
BEGIN
  SELECT public.tournament_refund_participant(
    '10000000-0000-0000-0000-000000000003'::uuid,
    '00000000-0000-0000-0000-000000000002'::uuid
  ) INTO v_result;

  v_refunded := (v_result->>'refunded')::int;

  -- Deve reembolsar 50 (o que foi pago), não 100 (entry_fee)
  IF v_refunded = 50 THEN
    RAISE NOTICE '✓ Reembolso limitado ao valor pago: 50 (não 100)';
  ELSE
    RAISE EXCEPTION '✗ FALHA: Reembolso incorreto: % (esperado 50)', v_refunded;
  END IF;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- TESTE 10: user_subscriptions - INSERT direto bloqueado
-- =====================================================

\echo '=== TESTE 10: user_subscriptions - INSERT direto bloqueado ==='

SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}';

DO $$
BEGIN
  -- Tentar inserir assinatura PRO ativa até 2099 diretamente
  BEGIN
    INSERT INTO public.user_subscriptions (user_id, plan_id, is_active, starts_at, expires_at)
    VALUES (
      '00000000-0000-0000-0000-000000000002'::uuid,
      '20000000-0000-0000-0000-000000000001'::uuid,
      true,
      now(),
      '2099-12-31'::timestamptz
    );
    RAISE EXCEPTION '✗ FALHA CRÍTICA: INSERT direto em user_subscriptions permitido!';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE '✓ INSERT direto bloqueado: %', SQLERRM;
  END;
END $$;

RESET ROLE;
RESET request.jwt.claims;

\echo ''

-- =====================================================
-- Resumo
-- =====================================================

\echo '========================================='
\echo 'RESUMO DOS TESTES'
\echo '========================================='
\echo '✓ TESTE 1: distribute_tournament_prize - Ataque bloqueado'
\echo '✓ TESTE 2: distribute_tournament_prize - Criador legítimo'
\echo '✓ TESTE 3: distribute_tournament_prize - Idempotência'
\echo '✓ TESTE 4: activate_subscription - Ataque bloqueado'
\echo '✓ TESTE 5: activate_subscription - Próprio usuário'
\echo '✓ TESTE 6: record_match_result - Ataque bloqueado'
\echo '✓ TESTE 7: record_match_result - Trigger correto'
\echo '✓ TESTE 8: tournament_pay_winner - Idempotência'
\echo '✓ TESTE 9: tournament_refund_participant - Limite'
\echo '✓ TESTE 10: user_subscriptions - INSERT bloqueado'
\echo '========================================='
\echo 'TODOS OS TESTES PASSARAM ✓'
\echo '========================================='

ROLLBACK;
