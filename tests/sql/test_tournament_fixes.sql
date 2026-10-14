-- =====================================================
-- Testes: Correções do fluxo de torneio
-- Data: 2026-10-05
-- =====================================================

-- Setup: criar usuários de teste
DO $$
DECLARE
  v_creator_id UUID := '00000000-0000-0000-0000-000000000001';
  v_player1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_player2_id UUID := '00000000-0000-0000-0000-000000000003';
  v_admin_id UUID := '00000000-0000-0000-0000-000000000099';
  v_tournament_id UUID := '10000000-0000-0000-0000-000000000001';
  v_plan_id UUID := '20000000-0000-0000-0000-000000000001';
BEGIN
  -- Limpa dados de teste anteriores
  DELETE FROM tournament_participants WHERE tournament_id = v_tournament_id;
  DELETE FROM tournaments WHERE id = v_tournament_id;
  DELETE FROM user_subscriptions WHERE user_id IN (v_creator_id, v_player1_id, v_player2_id, v_admin_id);
  DELETE FROM user_roles WHERE user_id = v_admin_id;
  DELETE FROM profiles WHERE user_id IN (v_creator_id, v_player1_id, v_player2_id, v_admin_id);
  DELETE FROM subscription_plans WHERE id = v_plan_id;

  -- Cria usuários de teste
  INSERT INTO profiles (user_id, username, duelcoins_balance, account_type)
  VALUES 
    (v_creator_id, 'criador_teste', 1000, 'pro'),
    (v_player1_id, 'jogador1_teste', 500, 'free'),
    (v_player2_id, 'jogador2_teste', 100, 'free'),
    (v_admin_id, 'admin_teste', 10000, 'pro');

  -- Cria admin
  INSERT INTO user_roles (user_id, role)
  VALUES (v_admin_id, 'admin');

  -- Cria plano de teste
  INSERT INTO subscription_plans (id, name, price_duelcoins, duration_days, is_active)
  VALUES (v_plan_id, 'Plano Teste', 100, 30, true);

  -- Cria torneio de teste (entry_fee = 50)
  INSERT INTO tournaments (
    id, 
    name, 
    description, 
    created_by, 
    entry_fee, 
    prize_pool, 
    min_participants, 
    max_participants, 
    status,
    tcg_type
  ) VALUES (
    v_tournament_id,
    'Torneio Teste Pago',
    'Torneio para testar correções de segurança',
    v_creator_id,
    50,  -- entry_fee
    200, -- prize_pool
    2,
    8,
    'upcoming',
    'yugioh'
  );

  RAISE NOTICE 'Setup completo: criador=%, jogador1=%, jogador2=%, admin=%, torneio=%',
    v_creator_id, v_player1_id, v_player2_id, v_admin_id, v_tournament_id;
END $$;

-- =====================================================
-- TESTE 1: INSERT direto em tournament_participants deve FALHAR
-- =====================================================
DO $$
DECLARE
  v_player1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_tournament_id UUID := '10000000-0000-0000-0000-000000000001';
  v_error_msg TEXT;
BEGIN
  -- Simula sessão do player1
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_player1_id)::text, true);

  -- Tenta INSERT direto (deve falhar)
  BEGIN
    INSERT INTO tournament_participants (tournament_id, user_id, status)
    VALUES (v_tournament_id, v_player1_id, 'registered');
    
    RAISE EXCEPTION 'TESTE 1 FALHOU: INSERT direto não deveria ter sido permitido!';
  EXCEPTION
    WHEN insufficient_privilege OR check_violation THEN
      RAISE NOTICE 'TESTE 1 OK: INSERT direto bloqueado corretamente (%))', SQLERRM;
  END;
END $$;

-- =====================================================
-- TESTE 2: join_weekly_tournament deve funcionar e cobrar entry_fee
-- =====================================================
DO $$
DECLARE
  v_player1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_tournament_id UUID := '10000000-0000-0000-0000-000000000001';
  v_result JSON;
  v_balance_before INT;
  v_balance_after INT;
BEGIN
  -- Simula sessão do player1
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_player1_id)::text, true);

  -- Saldo antes
  SELECT duelcoins_balance INTO v_balance_before FROM profiles WHERE user_id = v_player1_id;

  -- Inscreve via RPC
  SELECT join_weekly_tournament(v_tournament_id) INTO v_result;

  IF NOT (v_result->>'success')::BOOLEAN THEN
    RAISE EXCEPTION 'TESTE 2 FALHOU: join_weekly_tournament retornou erro: %', v_result->>'message';
  END IF;

  -- Saldo depois
  SELECT duelcoins_balance INTO v_balance_after FROM profiles WHERE user_id = v_player1_id;

  -- Verifica cobrança
  IF v_balance_after <> v_balance_before - 50 THEN
    RAISE EXCEPTION 'TESTE 2 FALHOU: entry_fee não foi cobrado corretamente (antes=%, depois=%)', 
      v_balance_before, v_balance_after;
  END IF;

  -- Verifica participante registrado
  IF NOT EXISTS (
    SELECT 1 FROM tournament_participants 
    WHERE tournament_id = v_tournament_id AND user_id = v_player1_id
  ) THEN
    RAISE EXCEPTION 'TESTE 2 FALHOU: Participante não foi registrado';
  END IF;

  -- Verifica transação registrada
  IF NOT EXISTS (
    SELECT 1 FROM duelcoins_transactions
    WHERE tournament_id = v_tournament_id 
      AND sender_id = v_player1_id
      AND transaction_type = 'tournament_entry'
      AND amount = 50
  ) THEN
    RAISE EXCEPTION 'TESTE 2 FALHOU: Transação de entry_fee não foi registrada';
  END IF;

  RAISE NOTICE 'TESTE 2 OK: join_weekly_tournament funcionou e cobrou entry_fee corretamente';
END $$;

-- =====================================================
-- TESTE 3: tournament_finalize_winner deve pagar e finalizar
-- =====================================================
DO $$
DECLARE
  v_creator_id UUID := '00000000-0000-0000-0000-000000000001';
  v_player1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_tournament_id UUID := '10000000-0000-0000-0000-000000000001';
  v_result JSON;
  v_balance_before INT;
  v_balance_after INT;
  v_tournament_status TEXT;
BEGIN
  -- Simula sessão do criador
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_creator_id)::text, true);

  -- Ativa torneio (só para teste)
  UPDATE tournaments SET status = 'active' WHERE id = v_tournament_id;

  -- Saldo do vencedor antes
  SELECT duelcoins_balance INTO v_balance_before FROM profiles WHERE user_id = v_player1_id;

  -- Finaliza torneio com player1 como vencedor
  SELECT tournament_finalize_winner(v_tournament_id, v_player1_id) INTO v_result;

  IF NOT (v_result->>'success')::BOOLEAN THEN
    RAISE EXCEPTION 'TESTE 3 FALHOU: tournament_finalize_winner retornou erro: %', v_result->>'message';
  END IF;

  -- Saldo do vencedor depois
  SELECT duelcoins_balance INTO v_balance_after FROM profiles WHERE user_id = v_player1_id;

  -- Verifica pagamento (prize_pool = 200)
  IF v_balance_after <> v_balance_before + 200 THEN
    RAISE EXCEPTION 'TESTE 3 FALHOU: Prêmio não foi pago corretamente (antes=%, depois=%, esperado=%)', 
      v_balance_before, v_balance_after, v_balance_before + 200;
  END IF;

  -- Verifica status do torneio
  SELECT status INTO v_tournament_status FROM tournaments WHERE id = v_tournament_id;
  IF v_tournament_status <> 'completed' THEN
    RAISE EXCEPTION 'TESTE 3 FALHOU: Torneio não foi marcado como completed (status=%)', v_tournament_status;
  END IF;

  -- Verifica vencedor marcado
  IF NOT EXISTS (
    SELECT 1 FROM tournament_participants
    WHERE tournament_id = v_tournament_id 
      AND user_id = v_player1_id
      AND status = 'winner'
  ) THEN
    RAISE EXCEPTION 'TESTE 3 FALHOU: Vencedor não foi marcado corretamente';
  END IF;

  RAISE NOTICE 'TESTE 3 OK: tournament_finalize_winner pagou prêmio e finalizou torneio';
END $$;

-- =====================================================
-- TESTE 4: grant_pro_subscription preserva PRO na expiração
-- =====================================================
DO $$
DECLARE
  v_admin_id UUID := '00000000-0000-0000-0000-000000000099';
  v_player2_id UUID := '00000000-0000-0000-0000-000000000003';
  v_result JSON;
  v_account_type TEXT;
BEGIN
  -- Simula sessão do admin
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id)::text, true);

  -- Admin concede PRO ao player2
  SELECT grant_pro_subscription(v_player2_id, 365) INTO v_result;

  IF NOT (v_result->>'success')::BOOLEAN THEN
    RAISE EXCEPTION 'TESTE 4 FALHOU: grant_pro_subscription retornou erro: %', v_result->>'message';
  END IF;

  -- Verifica PRO ativado
  SELECT account_type INTO v_account_type FROM profiles WHERE user_id = v_player2_id;
  IF v_account_type <> 'pro' THEN
    RAISE EXCEPTION 'TESTE 4 FALHOU: PRO não foi ativado (account_type=%)', v_account_type;
  END IF;

  -- Verifica subscription com granted_by
  IF NOT EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE user_id = v_player2_id
      AND granted_by = v_admin_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'TESTE 4 FALHOU: Subscription concedida não foi criada com granted_by';
  END IF;

  -- Simula expiração de outras assinaturas (forçando check_expired_subscriptions)
  -- A assinatura concedida não deve expirar o PRO
  PERFORM check_expired_subscriptions();

  -- PRO deve ser mantido
  SELECT account_type INTO v_account_type FROM profiles WHERE user_id = v_player2_id;
  IF v_account_type <> 'pro' THEN
    RAISE EXCEPTION 'TESTE 4 FALHOU: PRO foi removido indevidamente após check_expired_subscriptions';
  END IF;

  RAISE NOTICE 'TESTE 4 OK: grant_pro_subscription preservou PRO na expiração';
END $$;

-- =====================================================
-- TESTE 5: Verificar que admin sempre mantém PRO
-- =====================================================
DO $$
DECLARE
  v_admin_id UUID := '00000000-0000-0000-0000-000000000099';
  v_account_type TEXT;
BEGIN
  -- Expira todas as assinaturas do admin
  UPDATE user_subscriptions 
  SET is_active = false, expires_at = now() - interval '1 day'
  WHERE user_id = v_admin_id;

  -- Roda check_expired_subscriptions
  PERFORM check_expired_subscriptions();

  -- Admin deve manter PRO
  SELECT account_type INTO v_account_type FROM profiles WHERE user_id = v_admin_id;
  IF v_account_type <> 'pro' THEN
    RAISE EXCEPTION 'TESTE 5 FALHOU: PRO do admin foi removido indevidamente';
  END IF;

  RAISE NOTICE 'TESTE 5 OK: Admin manteve PRO mesmo sem subscription ativa';
END $$;

-- Cleanup
DO $$
DECLARE
  v_creator_id UUID := '00000000-0000-0000-0000-000000000001';
  v_player1_id UUID := '00000000-0000-0000-0000-000000000002';
  v_player2_id UUID := '00000000-0000-0000-0000-000000000003';
  v_admin_id UUID := '00000000-0000-0000-0000-000000000099';
  v_tournament_id UUID := '10000000-0000-0000-0000-000000000001';
  v_plan_id UUID := '20000000-0000-0000-0000-000000000001';
BEGIN
  DELETE FROM duelcoins_transactions WHERE tournament_id = v_tournament_id;
  DELETE FROM tournament_participants WHERE tournament_id = v_tournament_id;
  DELETE FROM tournaments WHERE id = v_tournament_id;
  DELETE FROM user_subscriptions WHERE user_id IN (v_creator_id, v_player1_id, v_player2_id, v_admin_id);
  DELETE FROM user_roles WHERE user_id = v_admin_id;
  DELETE FROM profiles WHERE user_id IN (v_creator_id, v_player1_id, v_player2_id, v_admin_id);
  DELETE FROM subscription_plans WHERE id = v_plan_id;
  
  RAISE NOTICE 'Cleanup completo';
END $$;

-- =====================================================
-- RESULTADO FINAL
-- =====================================================
SELECT 
  'Todos os testes passaram! ✓' as resultado,
  'As correções do fluxo de torneio estão funcionando corretamente.' as detalhes;
