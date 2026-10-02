# Guia de implantação: correções de segurança (PR #98)

## O que muda

**DuelCoins**
- O cliente não insere nem altera mais `duelcoins_orders` (a policy "Users can create own orders" foi removida). Quem cria pedidos são as edge functions `mercadopago-create-pix`, `mercadopago-create-checkout` e `stripe-create-checkout`, usando a service role. Preço e cupom são calculados no servidor a partir de `duelcoins_packages`.
- O crédito é feito por `public.service_credit_duelcoins(order_id, external_payment_id, payment_method)`:
  - é `SECURITY DEFINER` com `search_path` fixo;
  - o EXECUTE é só da `service_role` (revogado de PUBLIC, anon e authenticated);
  - é idempotente e seguro sob concorrência: `UPDATE ... WHERE status <> 'paid' RETURNING` e o crédito acontecem na mesma transação;
  - grava uma transação `purchase` com a descrição `Compra - Pedido #<uuid>`.
- A constraint `transaction_type` passa a aceitar `purchase`. A migration `20261002130000` acrescenta os valores legados `tournament_refund`, `tournament_surplus` e `tournament_entry_fee` (superconjunto da anterior).

**Webhooks**
- `mercadopago-webhook` consulta `GET /v1/payments/:id` com `MERCADOPAGO_ACCESS_TOKEN` e não confia no body. Só credita se `status = approved`, a moeda for BRL e o valor bater com o pedido (tolerância de 0,01). Quando o valor diverge, responde 200 e marca o pedido como `amount_mismatch` para revisão manual. O pedido é localizado pelo id do pagamento (PIX) ou por `external_reference = order.id` (Checkout Pro).
- `stripe-webhook` exige `STRIPE_WEBHOOK_SECRET`; sem ele, responde 500. Também exige o header `stripe-signature`; sem ele, responde 400. A assinatura é verificada com `constructEventAsync` e o `SubtleCryptoProvider`. O webhook só credita se `payment_status = paid` e trata `checkout.session.async_payment_succeeded`.
- `cartpanda-webhook` está desativado e sempre responde 410.

**tournament_matches**
- As policies "System can manage tournament matches" (FOR ALL USING true) e "Players can update own match result" foram removidas.
- INSERT, UPDATE e DELETE ficam restritos ao criador do torneio e aos admins. As policies antigas de admin e juiz continuam valendo.
- Os jogadores reportam resultado pela edge function `player-report-match-result` (service role). As RPCs `set_match_result`, `generate_next_round` etc. são SECURITY DEFINER e não mudam.

## Deploy

O merge na `main` publica automaticamente pelo Lovable: a migration
`supabase/migrations/20261002084339_security_fix_rls_duelcoins_and_matches.sql` e as edge functions vão juntas.
**Não rode a migration à mão.** Ela é idempotente e foi testada aplicando duas vezes.

### Secrets (Supabase → Edge Functions → Secrets)
- `MERCADOPAGO_ACCESS_TOKEN`: obrigatório. Sem ele, o webhook do MP responde 500 e o MP reenvia depois.
- `STRIPE_WEBHOOK_SECRET` (`whsec_...`, em Stripe Dashboard → Developers → Webhooks → endpoint `.../functions/v1/stripe-webhook`): obrigatório para creditar compras Stripe. No endpoint, assine os eventos `checkout.session.completed` e `checkout.session.async_payment_succeeded`.
- `STRIPE_SECRET_KEY`: o mesmo de hoje.

### Depois do deploy
1. Faça uma compra PIX de teste (de valor baixo) e confira o saldo e a transação `purchase`.
2. Rode a reconciliação: `docs/security/RECONCILIATION_QUERIES.sql`, no SQL Editor.
   - Passo 1: só lê e classifica cada pedido pago como `CREDITADO`, `REVISAR` ou `NAO_CREDITADO`.
   - Passo 2: credita um pedido (para os casos `REVISAR`, depois de conferir).
   - Passo 3: credita em lote todos os `NAO_CREDITADO`. Re-executar é seguro.
   - Por que é necessário: até este PR, os webhooks chamavam `admin_manage_duelcoins` com a service role. Essa função exige `is_admin(auth.uid())`, devolvia `success:false` sem erro, e o pedido era marcado `paid` sem crédito.
   - **Nunca** chame `service_credit_duelcoins` direto num pedido que já está `paid`, porque ele responde `already_paid` e não credita. Use os passos 2 e 3, que tratam isso e preservam o `paid_at` original.

## Rollback (emergência)
Recriar as policies antigas, o que reabre as falhas:
```sql
CREATE POLICY "Users can create own orders" ON public.duelcoins_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Tournament creators can create matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Tournament matches update by organizers" ON public.tournament_matches;
DROP POLICY IF EXISTS "Tournament creators can delete matches" ON public.tournament_matches;
CREATE POLICY "System can manage tournament matches" ON public.tournament_matches FOR ALL USING (true) WITH CHECK (true);
```
As edge functions voltam com o revert do commit na `main`.
