-- =====================================================================
-- QUERIES DE RECONCILIAÇÃO - Identificar Compras Não Creditadas
-- =====================================================================
-- Execute estas queries APÓS aplicar a migração de segurança
-- para identificar pedidos que possam ter sido pagos mas não creditados
-- =====================================================================

-- =====================================================================
-- 1. PEDIDOS COM STATUS "PAID" MAS SEM TRANSAÇÃO CORRESPONDENTE
-- =====================================================================
-- Estes pedidos foram marcados como pagos, mas pode não ter havido
-- uma transação registrada em duelcoins_transactions

SELECT 
  o.id AS order_id,
  o.user_id,
  p.username,
  p.email,
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
        AND t.transaction_type = 'purchase'
        AND t.amount = o.duelcoins_amount
        AND t.created_at >= o.paid_at - interval '5 minutes'
        AND t.created_at <= o.paid_at + interval '5 minutes'
    ) THEN 'TRANSACTION_FOUND'
    ELSE 'TRANSACTION_MISSING'
  END AS transaction_status
FROM duelcoins_orders o
JOIN profiles p ON p.user_id = o.user_id
WHERE o.status = 'paid'
ORDER BY o.paid_at DESC;

-- =====================================================================
-- 2. PEDIDOS PENDENTES COM MAIS DE 24 HORAS
-- =====================================================================
-- Estes podem ser pagamentos que falharam ou webhooks que não chegaram

SELECT 
  o.id AS order_id,
  o.user_id,
  p.username,
  p.email,
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
      'created_at', t.created_at
    ))
    FROM duelcoins_transactions t
    WHERE t.receiver_id = o.user_id
      AND t.transaction_type IN ('purchase', 'admin_add')
      AND t.created_at >= o.created_at - interval '1 hour'
      AND t.created_at <= COALESCE(o.paid_at, now()) + interval '1 hour'
  ) AS related_transactions
FROM duelcoins_orders o
JOIN profiles p ON p.user_id = o.user_id
WHERE o.external_payment_id = 'PAYMENT_ID_AQUI'
   OR o.external_order_id = 'PAYMENT_ID_AQUI';

-- =====================================================================
-- 4. SCRIPT PARA CREDITAR MANUALMENTE UM PEDIDO NÃO CREDITADO
-- =====================================================================
-- Se você identificar um pedido pago que não foi creditado, use este script
-- IMPORTANTE: Execute isto como serviço (service_role) ou admin

-- Exemplo de uso (substitua os valores):
-- SELECT service_credit_duelcoins(
--   'order-uuid-aqui'::uuid,
--   'external-payment-id',  -- opcional
--   'mercadopago'            -- opcional
-- );

-- Exemplo real:
-- SELECT service_credit_duelcoins(
--   '123e4567-e89b-12d3-a456-426614174000'::uuid,
--   'MP123456789',
--   'mercadopago'
-- );

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
  p.email,
  p.duelcoins_balance AS current_balance,
  COALESCE(uts.net_balance, 0) AS calculated_balance,
  p.duelcoins_balance - COALESCE(uts.net_balance, 0) AS difference,
  CASE 
    WHEN p.duelcoins_balance = COALESCE(uts.net_balance, 0) THEN '✓ OK'
    WHEN p.duelcoins_balance > COALESCE(uts.net_balance, 0) THEN '⚠ EXTRA BALANCE (user has more than transactions show)'
    ELSE '⚠ MISSING BALANCE (user has less than transactions show)'
  END AS status
FROM profiles p
LEFT JOIN user_transaction_summary uts ON uts.user_id = p.user_id
WHERE p.duelcoins_balance <> COALESCE(uts.net_balance, 0)
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
    WHERE transaction_type = 'purchase'
  ) AS total_purchase_transactions,
  (
    SELECT SUM(amount)
    FROM duelcoins_transactions 
    WHERE transaction_type = 'purchase'
  ) AS total_duelcoins_credited_via_purchase,
  SUM(duelcoins_amount) FILTER (WHERE status = 'paid') - (
    SELECT COALESCE(SUM(amount), 0)
    FROM duelcoins_transactions 
    WHERE transaction_type = 'purchase'
  ) AS duelcoins_difference
FROM duelcoins_orders;

-- =====================================================================
-- NOTAS IMPORTANTES:
-- =====================================================================
-- 
-- 1. Execute a query #1 para verificar se todos os pedidos pagos têm transação
-- 2. Se encontrar TRANSACTION_MISSING, use a query #4 para creditar
-- 3. Execute a query #5 para verificar integridade geral dos saldos
-- 4. A query #6 mostra um resumo financeiro geral
-- 
-- =====================================================================
