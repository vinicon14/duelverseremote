-- =====================================================================
-- RECONCILIAÇÃO: pedidos de DuelCoins pagos e NÃO creditados
-- =====================================================================
-- Contexto: até o PR #98, os webhooks (Mercado Pago, Stripe, CartPanda) chamavam
-- admin_manage_duelcoins com a service role. Essa função exige is_admin(auth.uid())
-- e a service role não tem auth.uid(), então ela devolvia {success:false} SEM erro;
-- o webhook seguia e marcava o pedido como 'paid' sem creditar nada.
--
-- Rodar no SQL Editor do Supabase DEPOIS que o merge do PR #98 for publicado
-- (precisa da função public.service_credit_duelcoins e do tipo 'purchase').
--
-- Como um crédito pode ter sido registrado:
--   * 'purchase'  com descrição 'Compra - Pedido #<uuid do pedido>' (função nova)
--   * 'admin_add' 'Compra aprovada manualmente - Pedido #<8 primeiros chars>' (botão do painel admin)
--   * 'admin_add' 'Compra via MercadoPago (...) - Pagamento #<id do pagamento>' (webhook antigo, se tiver funcionado)
--   * 'admin_add' com o uuid do pedido na descrição (CartPanda antigo)
--   * 'admin_add' manual com outro texto: só dá para detectar por heurística
--     (mesmo usuário + mesmo valor perto da data) -> classificado como REVISAR.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PASSO 1 (somente leitura): classificar os pedidos pagos
--   CREDITADO      -> já tem crédito identificado pelo texto; nada a fazer
--   REVISAR        -> há admin_add de mesmo valor ao mesmo usuário em até 30 dias;
--                     pode ser crédito manual: conferir antes de creditar
--   NAO_CREDITADO  -> nenhum crédito encontrado; creditar no passo 2
-- ---------------------------------------------------------------------
WITH pagos AS (
  SELECT o.*,
         EXISTS (
           SELECT 1 FROM public.duelcoins_transactions t
           WHERE t.receiver_id = o.user_id
             AND (
               (t.transaction_type = 'purchase'  AND t.description LIKE '%' || o.id::text || '%')
               OR (t.transaction_type = 'admin_add' AND (
                     t.description LIKE '%' || o.id::text || '%'
                  OR t.description LIKE '%Pedido #' || left(o.id::text, 8) || '%'
                  OR (o.external_payment_id IS NOT NULL AND o.external_payment_id <> ''
                      AND t.description LIKE '%Pagamento #' || o.external_payment_id || '%')))
             )
         ) AS credito_por_texto,
         (
           SELECT string_agg(to_char(t.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI')
                             || ' ' || coalesce(t.description, ''), ' | ' ORDER BY t.created_at)
           FROM public.duelcoins_transactions t
           WHERE t.receiver_id = o.user_id
             AND t.transaction_type = 'admin_add'
             AND t.amount = o.duelcoins_amount
             AND t.created_at BETWEEN o.created_at - interval '1 day'
                                  AND coalesce(o.paid_at, o.created_at) + interval '30 days'
         ) AS admin_add_suspeitos
  FROM public.duelcoins_orders o
  WHERE o.status = 'paid'
)
SELECT
  CASE WHEN credito_por_texto THEN 'CREDITADO'
       WHEN admin_add_suspeitos IS NOT NULL THEN 'REVISAR'
       ELSE 'NAO_CREDITADO' END                    AS situacao,
  p.id                                             AS order_id,
  p.user_id,
  pr.username,
  p.duelcoins_amount,
  p.amount_brl,
  p.payment_method,
  p.external_order_id,
  p.external_payment_id,
  p.paid_at AT TIME ZONE 'America/Sao_Paulo'       AS paid_at_brt,
  pr.duelcoins_balance                             AS saldo_atual,
  p.admin_add_suspeitos
FROM pagos p
LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
ORDER BY 1 DESC, p.paid_at;

-- Resumo
-- SELECT situacao, count(*), sum(duelcoins_amount) FROM (<consulta acima>) s GROUP BY 1;


-- ---------------------------------------------------------------------
-- PASSO 2: creditar UM pedido (troque o uuid). Seguro rodar mais de uma vez.
-- service_credit_duelcoins só credita pedido com status <> 'paid'; por isso o
-- pedido é colocado em 'reconciling' e creditado na MESMA transação, e o paid_at
-- original é restaurado (dashboards de receita não mudam). Se já existir crédito
-- 'purchase' para o pedido, nada acontece.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_order_id uuid := '00000000-0000-0000-0000-000000000000';  -- <<< order_id aqui
  v_o record;
  v_res json;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  SELECT * INTO v_o FROM public.duelcoins_orders WHERE id = v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE NOTICE 'Pedido % não encontrado', v_order_id; RETURN; END IF;
  IF v_o.status <> 'paid' THEN
    RAISE NOTICE 'Pedido % não está pago (status=%); nada feito', v_order_id, v_o.status; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.duelcoins_transactions
             WHERE transaction_type = 'purchase' AND description LIKE '%' || v_order_id::text || '%') THEN
    RAISE NOTICE 'Pedido % já tem crédito purchase; nada feito', v_order_id; RETURN;
  END IF;
  UPDATE public.duelcoins_orders SET status = 'reconciling' WHERE id = v_order_id;
  v_res := public.service_credit_duelcoins(v_order_id, v_o.external_payment_id, v_o.payment_method);
  IF coalesce((v_res->>'success')::boolean, false) IS NOT TRUE OR (v_res->>'already_paid')::boolean THEN
    RAISE EXCEPTION 'Falha ao creditar %: %', v_order_id, v_res;  -- desfaz tudo
  END IF;
  UPDATE public.duelcoins_orders SET paid_at = v_o.paid_at WHERE id = v_order_id;
  BEGIN  -- notificação é opcional; falha aqui não desfaz o crédito
    PERFORM public.create_notification(p_user_id => v_o.user_id, p_type => 'purchase',
            p_title => '💰 DuelCoins Creditados!',
            p_message => format('Sua compra de %s DuelCoins foi confirmada!', v_o.duelcoins_amount),
            p_data => jsonb_build_object('order_id', v_order_id, 'amount', v_o.duelcoins_amount));
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'notificação não enviada: %', SQLERRM; END;
  RAISE NOTICE 'OK: %', v_res;
END $$;


-- ---------------------------------------------------------------------
-- PASSO 3 (lote): creditar TODOS os pedidos classificados como NAO_CREDITADO.
-- Não toca nos REVISAR (decida um a um com o passo 2). Tudo numa transação:
-- se qualquer crédito falhar, nada é aplicado. Re-executar é seguro.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_id uuid;
  v_o record;
  v_res json;
  v_n int := 0;
  v_total bigint := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  FOR v_id IN
    SELECT o.id FROM public.duelcoins_orders o
    WHERE o.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM public.duelcoins_transactions t
        WHERE t.receiver_id = o.user_id
          AND (
            (t.transaction_type = 'purchase'  AND t.description LIKE '%' || o.id::text || '%')
            OR (t.transaction_type = 'admin_add' AND (
                  t.description LIKE '%' || o.id::text || '%'
               OR t.description LIKE '%Pedido #' || left(o.id::text, 8) || '%'
               OR (o.external_payment_id IS NOT NULL AND o.external_payment_id <> ''
                   AND t.description LIKE '%Pagamento #' || o.external_payment_id || '%')))
            -- heurística REVISAR: admin_add de mesmo valor em até 30 dias
            OR (t.transaction_type = 'admin_add' AND t.amount = o.duelcoins_amount
                AND t.created_at BETWEEN o.created_at - interval '1 day'
                                     AND coalesce(o.paid_at, o.created_at) + interval '30 days')
          ))
    ORDER BY o.paid_at
  LOOP
    -- trava o pedido e re-confere com snapshot novo (protege contra execução concorrente)
    SELECT * INTO v_o FROM public.duelcoins_orders WHERE id = v_id FOR UPDATE;
    CONTINUE WHEN v_o.status <> 'paid';
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.duelcoins_transactions
                          WHERE transaction_type = 'purchase' AND description LIKE '%' || v_id::text || '%');
    UPDATE public.duelcoins_orders SET status = 'reconciling' WHERE id = v_id;
    v_res := public.service_credit_duelcoins(v_id, v_o.external_payment_id, v_o.payment_method);
    IF coalesce((v_res->>'success')::boolean, false) IS NOT TRUE OR (v_res->>'already_paid')::boolean THEN
      RAISE EXCEPTION 'Falha ao creditar %: %', v_id, v_res;
    END IF;
    UPDATE public.duelcoins_orders SET paid_at = v_o.paid_at WHERE id = v_id;
    BEGIN  -- notificação é opcional; falha aqui não desfaz o crédito
      PERFORM public.create_notification(p_user_id => v_o.user_id, p_type => 'purchase',
              p_title => '💰 DuelCoins Creditados!',
              p_message => format('Sua compra de %s DuelCoins foi confirmada!', v_o.duelcoins_amount),
              p_data => jsonb_build_object('order_id', v_id, 'amount', v_o.duelcoins_amount));
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'notificação não enviada: %', SQLERRM; END;
    v_n := v_n + 1; v_total := v_total + v_o.duelcoins_amount;
    RAISE NOTICE 'creditado pedido % (% DC para %)', v_id, v_o.duelcoins_amount, v_o.user_id;
  END LOOP;
  RAISE NOTICE 'Total: % pedidos, % DuelCoins', v_n, v_total;
END $$;
