-- =====================================================================
-- QUERIES DE RECONCILIAÇÃO - Identificar Compras Não Creditadas
-- =====================================================================
-- Execute estas queries APÓS aplicar a migração de segurança
-- para identificar pedidos que possam ter sido pagos mas não creditados
-- =====================================================================
-- NOTA IMPORTANTE: Antes da migração, webhooks usavam admin_manage_duelcoins
-- com service_role, que FALHAVA (is_admin retorna false para service_role).
-- Resultado: pedidos marcados 'paid' sem transação correspondente.
-- =====================================================================

-- =====================================================================
-- 1. PEDIDOS PAGOS SEM TRANSAÇÃO CORRESPONDENTE (CRÍTICO)
-- =====================================================================
-- Identifica pedidos marcados como 'paid' mas sem transação registrada
-- Antes da migração: webhooks falhavam ao chamar admin_manage_duelcoins
-- Procura por transações 'admin_add' próximas ao paid_at OU com order_id na descrição

SELECT 
  o.id AS order_id,
  o.user_id,
  p.username,
  o.duelcoins_amount,
  o.amount_brl,
  o.status,
  o.paid_at,
  o.external_order_id,
  o.external_payment_id,
  o.payment_method,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM duelcoins_transactions t
      WHERE t.receiver_id = o.user_id
        AND t.transaction_type IN ('admin_add', 'purchase')
        AND t.amount = o.duelcoins_amount
        AND (
          -- Transação próxima ao paid_at (±10 minutos)
          (t.created_at >= o.paid_at - interval '10 minutes'
           AND t.created_at <= o.paid_at + interval '10 minutes')
          -- OU descrição menciona o order_id
          OR t.description ILIKE '%' || o.id::text || '%'
        )
    ) THEN 'HAS_TRANSACTION'
    ELSE '⚠️ MISSING_TRANSACTION'
  END AS credit_status
FROM duelcoins_orders o
JOIN profiles p ON p.user_id = o.user_id
WHERE o.status = 'paid'
ORDER BY 
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM duelcoins_transactions t
    WHERE t.receiver_id = o.user_id
      AND t.transaction_type IN ('admin_add', 'purchase')
      AND t.amount = o.duelcoins_amount
      AND (
        (t.created_at >= o.paid_at - interval '10 minutes'
         AND t.created_at <= o.paid_at + interval '10 minutes')
        OR t.description ILIKE '%' || o.id::text || '%'
      )
  ) THEN 0 ELSE 1 END,
  o.paid_at DESC;

-- =====================================================================
-- 2. PEDIDOS PENDENTES HÁ MAIS DE 24 HORAS
-- =====================================================================
-- Estes podem ser pagamentos que falharam ou webhooks que não chegaram

SELECT 
  o.id AS order_id,
  o.user_id,
  p.username,
  o.duelcoins_amount,
  o.amount_brl,
  o.status,
  o.created_at,
  o.external_order_id,
  o.payment_method,
  now() - o.created_at AS age
FROM duelcoins_orders o
JOIN profiles p ON p.user_id = o.user_id
WHERE o.status = 'pending'
  AND o.created_at < now() - interval '24 hours'
ORDER BY o.created_at DESC;

-- =====================================================================
-- 3. VERIFICAÇÃO MANUAL POR EXTERNAL_PAYMENT_ID
-- =====================================================================
-- Para verificar um pagamento específico do MercadoPago/CartPanda,
-- substitua 'PAYMENT_ID_AQUI' pelo ID do pagamento externo

SELECT 
  o.id AS order_id,
  o.user_id,
  p.username,
  o.duelcoins_amount,
  o.amount_brl,
  o.status,
  o.paid_at,
  o.external_order_id,
  o.external_payment_id,
  o.payment_method,
  (
    SELECT json_agg(json_build_object(
      'transaction_id', t.id,
      'amount', t.amount,
      'type', t.transaction_type,
      'description', t.description,
      'created_at', t.created_at
    ))
    FROM duelcoins_transactions t
    WHERE t.receiver_id = o.user_id
      AND t.transaction_type IN ('admin_add', 'purchase')
      AND t.created_at >= o.created_at - interval '1 hour'
      AND t.created_at <= COALESCE(o.paid_at, now()) + interval '1 hour'
  ) AS related_transactions
FROM duelcoins_orders o
JOIN profiles p ON p.user_id = o.user_id
WHERE o.external_payment_id = 'PAYMENT_ID_AQUI'
   OR o.external_order_id = 'PAYMENT_ID_AQUI';

-- =====================================================================
-- 4. CREDITAR MANUALMENTE UM PEDIDO PAGO NÃO CREDITADO
-- =====================================================================
-- ⚠️ NUNCA chame service_credit_duelcoins em pedido já 'paid'
-- Ele retorna already_paid=true e NÃO credita
-- 
-- Para creditar pedidos que foram marcados 'paid' mas não creditados:
-- Opção 1: Usar painel admin (se houver interface)
-- Opção 2: Criar função temporária para creditar pedidos já pagos:

CREATE OR REPLACE FUNCTION public.admin_credit_paid_order(p_order_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_username TEXT;
  v_existing_tx UUID;
BEGIN
  -- Apenas admins podem executar
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Acesso negado');
  END IF;

  -- Buscar pedido
  SELECT * INTO v_order FROM public.duelcoins_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Pedido não encontrado');
  END IF;

  -- Verificar se já existe transação para este pedido
  SELECT id INTO v_existing_tx 
  FROM duelcoins_transactions 
  WHERE receiver_id = v_order.user_id
    AND transaction_type IN ('admin_add', 'purchase')
    AND amount = v_order.duelcoins_amount
    AND (
      description ILIKE '%' || p_order_id::text || '%'
      OR (created_at >= v_order.paid_at - interval '10 minutes'
          AND created_at <= v_order.paid_at + interval '10 minutes')
    )
  LIMIT 1;

  IF v_existing_tx IS NOT NULL THEN
    RETURN json_build_object('success', false, 'message', 'Transação já existe', 'transaction_id', v_existing_tx);
  END IF;

  -- Creditar DuelCoins
  UPDATE public.profiles
  SET duelcoins_balance = duelcoins_balance + v_order.duelcoins_amount
  WHERE user_id = v_order.user_id;

  -- Registrar transação
  INSERT INTO public.duelcoins_transactions (
    sender_id, receiver_id, amount, transaction_type, description
  ) VALUES (
    NULL,
    v_order.user_id,
    v_order.duelcoins_amount,
    'admin_add',
    format('Reconciliação manual - Pedido #%s (pago mas não creditado)', p_order_id)
  );

  SELECT username INTO v_username FROM public.profiles WHERE user_id = v_order.user_id;

  RETURN json_build_object(
    'success', true,
    'message', format('Creditados %s DuelCoins para %s', v_order.duelcoins_amount, v_username),
    'order_id', p_order_id,
    'user_id', v_order.user_id,
    'amount', v_order.duelcoins_amount
  );
END;
$$;

-- Exemplo de uso (apenas admins):
-- SELECT admin_credit_paid_order('order-uuid-aqui'::uuid);

-- =====================================================================
-- 5. AUDITORIA COMPLETA: COMPARAR SALDO vs. TRANSAÇÕES
-- =====================================================================
-- Verifica se o saldo de cada usuário bate com suas transações registradas

WITH user_transaction_summary AS (
  SELECT 
    COALESCE(t.receiver_id, t.sender_id) AS user_id,
    SUM(CASE WHEN t.receiver_id IS NOT NULL THEN t.amount ELSE 0 END) AS total_received,
    SUM(CASE WHEN t.sender_id IS NOT NULL THEN t.amount ELSE 0 END) AS total_sent,
    SUM(CASE WHEN t.receiver_id IS NOT NULL THEN t.amount ELSE -t.amount END) AS net_balance
  FROM duelcoins_transactions t
  GROUP BY COALESCE(t.receiver_id, t.sender_id)
)
SELECT 
  p.user_id,
  p.username,
  p.duelcoins_balance AS current_balance,
  COALESCE(uts.net_balance, 0) AS calculated_balance,
  p.duelcoins_balance - COALESCE(uts.net_balance, 0) AS difference,
  CASE 
    WHEN p.duelcoins_balance = COALESCE(uts.net_balance, 0) THEN '✓ OK'
    WHEN p.duelcoins_balance > COALESCE(uts.net_balance, 0) THEN '⚠ EXTRA_BALANCE (user has more than transactions show)'
    ELSE '⚠ MISSING_BALANCE (user has less than transactions show)'
  END AS status
FROM profiles p
LEFT JOIN user_transaction_summary uts ON uts.user_id = p.user_id
WHERE p.duelcoins_balance <> COALESCE(uts.net_balance, 0)
  OR p.duelcoins_balance > 0 -- Include all users with balance
ORDER BY ABS(p.duelcoins_balance - COALESCE(uts.net_balance, 0)) DESC;

-- =====================================================================
-- 6. SUMÁRIO DE RECEITA vs. CRÉDITOS
-- =====================================================================
-- Verifica se o total de dinheiro recebido corresponde aos créditos dados

SELECT 
  COUNT(*) FILTER (WHERE status = 'paid') AS total_paid_orders,
  SUM(amount_brl) FILTER (WHERE status = 'paid') AS total_revenue_brl,
  SUM(duelcoins_amount) FILTER (WHERE status = 'paid') AS total_duelcoins_sold,
  (
    SELECT COUNT(*) 
    FROM duelcoins_transactions 
    WHERE transaction_type IN ('admin_add', 'purchase')
  ) AS total_credit_transactions,
  (
    SELECT SUM(amount)
    FROM duelcoins_transactions 
    WHERE transaction_type IN ('admin_add', 'purchase')
  ) AS total_duelcoins_credited,
  SUM(duelcoins_amount) FILTER (WHERE status = 'paid') - (
    SELECT COALESCE(SUM(amount), 0)
    FROM duelcoins_transactions 
    WHERE transaction_type IN ('admin_add', 'purchase')
  ) AS duelcoins_difference
FROM duelcoins_orders;

-- =====================================================================
-- NOTAS IMPORTANTES:
-- =====================================================================
-- 
-- 1. Execute a query #1 para ver pedidos pagos sem transação (CRÍTICO)
-- 2. Para cada pedido sem transação, use admin_credit_paid_order (query #4)
-- 3. Execute a query #5 para verificar integridade geral dos saldos
-- 4. A query #6 mostra um resumo financeiro geral
-- 5. NUNCA use service_credit_duelcoins em pedidos já 'paid'
-- 
-- =====================================================================
