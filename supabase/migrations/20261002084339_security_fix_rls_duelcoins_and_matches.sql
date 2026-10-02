-- =====================================================================
-- CORREÇÕES DE SEGURANÇA HIGH: DuelCoins e Tournament Matches
-- =====================================================================
-- A) Pedidos de DuelCoins: bloquear INSERT do cliente, edge functions usam service_role
-- B) Webhooks: RPC restrito a service_role para creditar (concurrency-safe, idempotente)
-- C) Tournament matches: drop políticas permissivas, restringir a criadores/admins
-- =====================================================================

-- =====================================================================
-- PARTE A: DUELCOINS - BLOQUEAR INSERT DO CLIENTE E ADICIONAR 'purchase'
-- =====================================================================

-- 1. Drop da política que permitia INSERT direto do cliente
DROP POLICY IF EXISTS "Users can create own orders" ON public.duelcoins_orders;

-- 2. Adicionar 'purchase' ao constraint de transaction_type
-- (Edge functions criarão transações com type='purchase' quando creditarem)
ALTER TABLE public.duelcoins_transactions 
DROP CONSTRAINT IF EXISTS duelcoins_transactions_transaction_type_check;

ALTER TABLE public.duelcoins_transactions 
ADD CONSTRAINT duelcoins_transactions_transaction_type_check 
CHECK (transaction_type = ANY (ARRAY[
  'transfer',
  'admin_add',
  'admin_remove',
  'tournament_entry',
  'tournament_prize',
  'tournament_prize_deposit',
  'subscription',
  'marketplace_purchase',
  'judge_reward',
  'nickname_change',
  'battle_pass_reward',
  'battle_pass_mission',
  'battle_pass_pro',
  'purchase'
]));

-- 3. Criar RPC para creditar DuelCoins (SOMENTE service_role pode executar)
-- Este RPC recebe order_id, valida o pedido, credita as moedas e marca como pago
-- CONCURRENCY-SAFE: usa UPDATE...WHERE status<>'paid' RETURNING para lock atômico
-- IDEMPOTENTE: se já pago, retorna already_paid=true sem creditar novamente
-- PROTEÇÃO: GRANTs restringem execução a service_role (auth.role() pode ser NULL em SQL editor)
CREATE OR REPLACE FUNCTION public.service_credit_duelcoins(
  p_order_id UUID,
  p_external_payment_id TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_username TEXT;
BEGIN
  -- Validar que está sendo chamado pelo service_role
  -- NOTA: Esta proteção depende dos GRANTs no final (REVOKE ALL + GRANT service_role)
  IF auth.role() <> 'service_role' THEN
    RETURN json_build_object('success', false, 'message', 'Acesso negado: apenas service_role');
  END IF;

  -- CONCURRENCY-SAFE: Tenta marcar pedido como pago atomicamente
  -- Se já está pago (por outra chamada concorrente), UPDATE não retorna nada
  UPDATE public.duelcoins_orders
  SET
    status = 'paid',
    paid_at = NOW(),
    external_payment_id = COALESCE(p_external_payment_id, external_payment_id),
    payment_method = COALESCE(p_payment_method, payment_method)
  WHERE id = p_order_id 
    AND status <> 'paid'
  RETURNING * INTO v_order;

  -- Se UPDATE não retornou nada, pedido já estava pago ou não existe
  IF NOT FOUND THEN
    -- Verificar se pedido existe
    SELECT * INTO v_order
    FROM public.duelcoins_orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'message', 'Pedido não encontrado');
    END IF;

    -- Pedido existe mas já está pago (idempotência)
    IF v_order.status = 'paid' THEN
      RETURN json_build_object(
        'success', true, 
        'message', 'Pedido já foi creditado anteriormente', 
        'already_paid', true
      );
    END IF;

    -- Pedido existe mas não está pendente (ex: cancelado)
    RETURN json_build_object(
      'success', false, 
      'message', format('Pedido está com status: %s', v_order.status)
    );
  END IF;

  -- Neste ponto, conseguimos lock exclusivo do pedido (UPDATE bem-sucedido)
  -- Agora podemos creditar com segurança

  -- Creditar DuelCoins ao usuário
  UPDATE public.profiles
  SET duelcoins_balance = duelcoins_balance + v_order.duelcoins_amount
  WHERE user_id = v_order.user_id;

  -- Registrar transação
  INSERT INTO public.duelcoins_transactions (
    sender_id,
    receiver_id,
    amount,
    transaction_type,
    description
  ) VALUES (
    NULL,
    v_order.user_id,
    v_order.duelcoins_amount,
    'purchase',
    format('Compra - Pedido #%s', p_order_id)
  );

  -- Buscar username para retorno
  SELECT username INTO v_username
  FROM public.profiles
  WHERE user_id = v_order.user_id;

  RETURN json_build_object(
    'success', true,
    'message', format('Creditados %s DuelCoins para %s', v_order.duelcoins_amount, COALESCE(v_username, 'usuário')),
    'order_id', p_order_id,
    'user_id', v_order.user_id,
    'amount', v_order.duelcoins_amount,
    'already_paid', false
  );
END;
$$;

-- REVOGAR de todos, GRANT apenas para service_role
REVOKE ALL ON FUNCTION public.service_credit_duelcoins(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_credit_duelcoins(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.service_credit_duelcoins(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_credit_duelcoins(UUID, TEXT, TEXT) TO service_role;


-- =====================================================================
-- PARTE B: TOURNAMENT MATCHES - REMOVER POLÍTICAS PERMISSIVAS
-- =====================================================================

-- 4. Drop de todas as políticas permissivas
DROP POLICY IF EXISTS "System can manage tournament matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Players can update own match result" ON public.tournament_matches;

-- 5. Criar políticas restritas para tournament_matches (idempotentes)

-- SELECT: todos podem ver (política já existe, não recriar)
-- A política "Everyone can view tournament matches" já existe de migrações anteriores

-- INSERT: apenas criadores de torneios ou admins
DROP POLICY IF EXISTS "Tournament creators can create matches" ON public.tournament_matches;
CREATE POLICY "Tournament creators can create matches"
  ON public.tournament_matches
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND (t.created_by = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

-- UPDATE: APENAS criadores do torneio ou admins
-- Participantes NÃO podem UPDATE diretamente (previne setar winner_id)
-- Edge functions player-report-match-result e report-match-result usam service_role
-- RPCs generate_next_round/regenerate_tournament_bracket são SECURITY DEFINER
DROP POLICY IF EXISTS "Tournament matches update by organizers" ON public.tournament_matches;
CREATE POLICY "Tournament matches update by organizers"
  ON public.tournament_matches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND (t.created_by = auth.uid() OR public.is_admin(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND (t.created_by = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

-- DELETE: apenas criadores de torneios ou admins
DROP POLICY IF EXISTS "Tournament creators can delete matches" ON public.tournament_matches;
CREATE POLICY "Tournament creators can delete matches"
  ON public.tournament_matches
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND (t.created_by = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

-- =====================================================================
-- NOTAS DE IMPLANTAÇÃO (para o owner)
-- =====================================================================
-- 
-- 1. Rodar esta migração no banco de produção
-- 
-- 2. Redeloyar os edge functions:
--    - cartpanda-webhook (adicionar verificação de assinatura ou secret)
--    - mercadopago-webhook (validar payment ID e amount do servidor MP)
--    - mercadopago-create-pix (usar create_duelcoins_order em vez de INSERT direto)
--    - mercadopago-create-checkout (usar create_duelcoins_order em vez de INSERT direto)
-- 
-- 3. Configurar env vars:
--    - CARTPANDA_WEBHOOK_SECRET (se CartPanda suportar assinatura)
--    - MERCADOPAGO_ACCESS_TOKEN (já configurado, mas validar que está presente)
-- 
-- 4. Verificar se edge functions player-report-match-result e report-match-result
--    ainda funcionam com as novas políticas de tournament_matches (devem funcionar,
--    pois validam participação antes de UPDATE)
-- 
-- =====================================================================
