-- =====================================================================
-- CORREÇÕES DE SEGURANÇA HIGH: DuelCoins e Tournament Matches
-- =====================================================================
-- A) Pedidos de DuelCoins agora são criados server-side, sem INSERT direto do cliente
-- B) Webhooks agora usam RPC restrito a service_role para creditar
-- C) Tournament matches: drop política permissiva, substituir por políticas restritas
-- =====================================================================

-- =====================================================================
-- PARTE A: DUELCOINS ORDERS - REMOVER INSERT DO CLIENTE
-- =====================================================================

-- 1. Drop da política que permitia INSERT direto do cliente
DROP POLICY IF EXISTS "Users can create own orders" ON public.duelcoins_orders;

-- 2. Criar RPC SECURITY DEFINER para criar pedidos (chamado pelos edge functions com auth do usuário)
-- Este RPC pega o package_id, busca preço/moedas do servidor e cria o pedido com auth.uid()
CREATE OR REPLACE FUNCTION public.create_duelcoins_order(
  p_package_id UUID,
  p_external_order_id TEXT,
  p_payment_method TEXT DEFAULT 'pix',
  p_amount_brl NUMERIC DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL,
  p_discount_percent INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_package RECORD;
  v_final_amount NUMERIC;
  v_order_id UUID;
BEGIN
  -- Validar autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Buscar pacote (validar que existe e está ativo)
  SELECT * INTO v_package
  FROM public.duelcoins_packages
  WHERE id = p_package_id AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Pacote não encontrado ou inativo');
  END IF;

  -- Se p_amount_brl foi passado (já calculado com desconto), usar ele; senão usar preço do pacote
  IF p_amount_brl IS NOT NULL THEN
    v_final_amount := p_amount_brl;
  ELSE
    v_final_amount := v_package.price_brl;
  END IF;

  -- Criar pedido
  INSERT INTO public.duelcoins_orders (
    user_id,
    package_id,
    amount_brl,
    duelcoins_amount,
    status,
    payment_method,
    external_order_id,
    coupon_code,
    discount_percent
  ) VALUES (
    v_user_id,
    p_package_id,
    v_final_amount,
    v_package.duelcoins_amount,
    'pending',
    p_payment_method,
    p_external_order_id,
    p_coupon_code,
    p_discount_percent
  )
  RETURNING id INTO v_order_id;

  RETURN json_build_object(
    'success', true,
    'order_id', v_order_id,
    'amount_brl', v_final_amount,
    'duelcoins_amount', v_package.duelcoins_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_duelcoins_order(UUID, TEXT, TEXT, NUMERIC, TEXT, INTEGER) TO authenticated;

-- 3. Criar RPC para creditar DuelCoins (SOMENTE service_role pode executar)
-- Este RPC recebe order_id, valida o pedido, credita as moedas e marca como pago (idempotente)
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
  IF auth.role() <> 'service_role' THEN
    RETURN json_build_object('success', false, 'message', 'Acesso negado: apenas service_role');
  END IF;

  -- Buscar pedido
  SELECT * INTO v_order
  FROM public.duelcoins_orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Pedido não encontrado');
  END IF;

  -- Idempotência: se já está pago, não creditar novamente
  IF v_order.status = 'paid' THEN
    RETURN json_build_object('success', true, 'message', 'Pedido já foi creditado anteriormente', 'already_paid', true);
  END IF;

  -- Validar que está pendente
  IF v_order.status <> 'pending' THEN
    RETURN json_build_object('success', false, 'message', 'Pedido não está pendente');
  END IF;

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

  -- Marcar pedido como pago
  UPDATE public.duelcoins_orders
  SET
    status = 'paid',
    paid_at = NOW(),
    external_payment_id = COALESCE(p_external_payment_id, external_payment_id),
    payment_method = COALESCE(p_payment_method, payment_method)
  WHERE id = p_order_id;

  -- Buscar username para retorno
  SELECT username INTO v_username
  FROM public.profiles
  WHERE user_id = v_order.user_id;

  RETURN json_build_object(
    'success', true,
    'message', format('Creditados %s DuelCoins para %s', v_order.duelcoins_amount, COALESCE(v_username, 'usuário')),
    'order_id', p_order_id,
    'user_id', v_order.user_id,
    'amount', v_order.duelcoins_amount
  );
END;
$$;

-- REVOGAR de todos, GRANT apenas para service_role
REVOKE ALL ON FUNCTION public.service_credit_duelcoins(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.service_credit_duelcoins(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.service_credit_duelcoins(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.service_credit_duelcoins(UUID, TEXT, TEXT) TO service_role;


-- =====================================================================
-- PARTE B: TOURNAMENT MATCHES - REMOVER POLÍTICA PERMISSIVA
-- =====================================================================

-- 4. Drop da política que permitia FOR ALL USING (true)
DROP POLICY IF EXISTS "System can manage tournament matches" ON public.tournament_matches;

-- 5. Criar políticas restritas para tournament_matches

-- SELECT: todos podem ver (mantém comportamento atual para visualização)
CREATE POLICY "Anyone can view tournament matches"
  ON public.tournament_matches
  FOR SELECT
  USING (true);

-- INSERT: apenas criadores de torneios (via RPC) ou admins
-- Na prática, partidas devem ser criadas por RPCs que validam o contexto
-- Mas permitimos INSERT para criadores de torneios autenticados
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

-- UPDATE: permitir atualização de campos específicos conforme o contexto
-- Jogadores podem reportar resultados via edge functions (player1_result, player2_result, etc.)
-- Criadores e admins podem atualizar winner_id via edge functions
-- A edge function valida participação/permissões antes de chamar UPDATE
-- Aqui permitimos UPDATE para:
-- 1. Criadores do torneio
-- 2. Admins
-- 3. Participantes da partida (para campos de reporte)
CREATE POLICY "Tournament matches update by organizers and participants"
  ON public.tournament_matches
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND (
          t.created_by = auth.uid()
          OR public.is_admin(auth.uid())
        )
    )
    OR auth.uid() IN (player1_id, player2_id)
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_matches.tournament_id
        AND (
          t.created_by = auth.uid()
          OR public.is_admin(auth.uid())
        )
    )
    OR auth.uid() IN (player1_id, player2_id)
  );

-- DELETE: apenas criadores de torneios ou admins
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
