# Guia de Implantação - Correções de Segurança HIGH

## ⚠️ IMPORTANTE: Leia antes de aplicar

Estas correções de segurança resolvem duas vulnerabilidades HIGH identificadas no audit:
- **A) DuelCoins**: RLS bypass no INSERT, webhooks sem validação adequada
- **B) Tournament Matches**: Política RLS permissiva demais

## 📋 Pré-requisitos

1. ⚠️ **BACKUP COMPLETO** do banco de dados de produção
2. Acesso ao Supabase Dashboard (para configurar env vars)
3. Acesso ao repositório para redeploy das edge functions
4. Tempo de manutenção agendado (estimado: 15-30 minutos)

## 🔧 Passos de Implantação (via Lovable)

### ⚠️ NOTA CRÍTICA: Lovable Auto-Deploy

**Ao fazer merge para `main`, o Lovable irá automaticamente:**
1. ✅ Aplicar a migração SQL (`supabase/migrations/20261002084339_...sql`)
2. ✅ Redeploy das edge functions modificadas

**NÃO execute a migração manualmente** - o Lovable fará isso automaticamente.

### 1. Configurar Variáveis de Ambiente (ANTES DO MERGE)

No Supabase Dashboard → Settings → Edge Functions, configure:

```bash
# ✅ OBRIGATÓRIAS - Verifique que existem:
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
STRIPE_WEBHOOK_SECRET=whsec_...

# Opcional (Stripe internacional):
STRIPE_SECRET_KEY=sk_...
```

**NOTA sobre CartPanda:**
- ⚠️ Owner não usa mais CartPanda
- Webhook desabilitado permanentemente (sempre retorna 410)
- Não é necessário configurar `CARTPANDA_WEBHOOK_SECRET`

### 2. Migração SQL (Auto-Aplicada pelo Lovable)

**O Lovable aplicará automaticamente** a migração quando o PR for mergeado.
A migração é idempotente e pode ser aplicada múltiplas vezes sem problemas.

**O que a migração faz:**
1. ✅ Remove política RLS que permite INSERT direto em `duelcoins_orders`
2. ✅ Adiciona 'purchase' ao constraint de `transaction_type`
3. ✅ Cria RPC `service_credit_duelcoins` (restrito a service_role, idempotente, concurrency-safe)
4. ✅ Remove políticas permissivas em `tournament_matches`:
   - Drop "System can manage tournament matches" (FOR ALL USING true)
   - Drop "Players can update own match result" (permitia UPDATE de winner_id)
5. ✅ Cria políticas restritas (apenas criadores/admins podem UPDATE)

### 3. Edge Functions (Auto-Deployed pelo Lovable)

**Lovable redeploy automático** das seguintes functions modificadas:

**Alterações por função:**

- **cartpanda-webhook**: 
  - ✅ DESABILITADO permanentemente (retorna 410)
  - ✅ Owner não usa mais CartPanda

- **mercadopago-webhook**:
  - ✅ Valida payment via API do Mercado Pago
  - ✅ Match estrito por external_reference (UUID do order)
  - ✅ Valida amount pago = amount do pedido (margem 0.01)
  - ✅ Valida currency = BRL
  - ✅ Usa `service_credit_duelcoins` (concurrency-safe, idempotente)
  - ✅ Retorna 200 em amount mismatch (não 400) para evitar retry infinito

- **mercadopago-create-pix** & **mercadopago-create-checkout**:
  - ✅ INSERT direto com service_role (cliente bloqueado por RLS)
  - ✅ Preço e cupom computados server-side
  - ✅ external_reference = order.id (UUID) para match estrito

- **stripe-webhook**:
  - ✅ Requer `STRIPE_WEBHOOK_SECRET` (falha se não configurado)
  - ✅ Verifica assinatura com `constructEventAsync` (Deno-compatível)
  - ✅ Valida `payment_status === 'paid'` antes de creditar
  - ✅ Usa `service_credit_duelcoins` (idempotente)
  - ✅ Suporta `checkout.session.async_payment_succeeded`

- **stripe-create-checkout**:
  - ✅ INSERT direto com service_role (cliente bloqueado por RLS)
  - ✅ Preço computado server-side

### 4. Verificar Funcionamento

Após o deploy, teste:

1. **Compra de DuelCoins via PIX:**
   - Criar pedido PIX
   - Webhook MercadoPago deve processar pagamento
   - Verificar crédito no saldo
   - Logs devem mostrar "Successfully credited X DuelCoins"

2. **Compra via Cartão (MercadoPago Checkout):**
   - Criar pedido cartão
   - Completar checkout
   - Webhook deve processar
   - Verificar crédito

3. **Tournament Matches:**
   - Jogadores devem conseguir reportar resultados (via edge function)
   - Criadores de torneio devem conseguir gerenciar partidas
   - Usuários NÃO devem conseguir UPDATE direto do winner_id sem permissão

### 4. Reconciliação de Pedidos Passados (CRÍTICO)

⚠️ **Execute APÓS o merge e deploy automático**

Consulte `docs/security/RECONCILIATION_QUERIES.sql` para queries detalhadas.

**Query #1 - Identificar pedidos pagos sem transação:**
Mostra pedidos marcados 'paid' mas sem transação registrada.
Antes da migração: webhooks falhavam ao creditar (is_admin false para service_role).

**Para creditar manualmente pedidos não creditados:**

```sql
-- Use a função admin_credit_paid_order (criada no arquivo RECONCILIATION_QUERIES.sql)
-- Esta função está no arquivo docs/security/RECONCILIATION_QUERIES.sql
SELECT admin_credit_paid_order('order-uuid-aqui'::uuid);
```

⚠️ **NUNCA use `service_credit_duelcoins` em pedidos já 'paid'**
- Ele retorna `already_paid=true` e NÃO credita
- Use `admin_credit_paid_order` (no RECONCILIATION_QUERIES.sql) para reconciliação manual

## ⚠️ Comportamento Modificado

### Antes vs. Depois

**DuelCoins Orders:**
- ❌ **ANTES**: Cliente podia fazer INSERT direto em duelcoins_orders (inseguro)
- ✅ **DEPOIS**: Apenas edge functions (via RPC) criam pedidos, com validação server-side

**Webhooks:**
- ❌ **ANTES**: CartPanda sem verificação de assinatura
- ✅ **DEPOIS**: CartPanda desabilitado até configurar secret

- ❌ **ANTES**: MercadoPago podia creditar sem validar amount
- ✅ **DEPOIS**: MercadoPago valida amount e currency do pagamento vs. pedido

- ❌ **ANTES**: admin_manage_duelcoins não funciona com service_role
- ✅ **DEPOIS**: service_credit_duelcoins é restrito a service_role e idempotente

**Tournament Matches:**
- ❌ **ANTES**: Qualquer um podia UPDATE/DELETE com USING(true)
- ✅ **DEPOIS**: Apenas criadores, admins e participantes podem UPDATE; participantes não podem setar winner_id diretamente

## 🔍 Monitoramento

Após o deploy, monitore:

1. **Logs das Edge Functions** (Supabase Dashboard → Edge Functions → Logs)
   - Verificar se webhooks estão sendo processados com sucesso
   - Alertar se aparecer "Amount mismatch" ou "Secret inválido"

2. **Pedidos Pendentes**
   ```sql
   SELECT COUNT(*) FROM duelcoins_orders WHERE status = 'pending' AND created_at > now() - interval '1 hour';
   ```
   - Se houver muitos pendentes recentes, investigar webhooks

3. **Tentativas de INSERT direto** (devem falhar)
   - Monitorar logs do cliente para erros de permissão em duelcoins_orders

## 🆘 Rollback de Emergência

Se algo der errado, reverter é simples:

1. **Reverter Edge Functions:**
   ```bash
   git checkout main
   supabase functions deploy cartpanda-webhook
   # ... outras functions
   ```

2. **Reverter Migração SQL:**
   ```sql
   -- Restaurar políticas antigas
   DROP POLICY IF EXISTS "Tournament creators can create matches" ON tournament_matches;
   DROP POLICY IF EXISTS "Tournament matches update by organizers and participants" ON tournament_matches;
   DROP POLICY IF EXISTS "Tournament creators can delete matches" ON tournament_matches;
   
   CREATE POLICY "System can manage tournament matches"
     ON tournament_matches FOR ALL
     USING (true) WITH CHECK (true);
   
   CREATE POLICY "Users can create own orders" 
     ON duelcoins_orders FOR INSERT 
     WITH CHECK (auth.uid() = user_id);
   ```

3. **Notificar equipe** e analisar logs para identificar causa

## 📞 Suporte

Se encontrar problemas durante o deploy:
1. Consulte os logs das edge functions
2. Execute as queries de reconciliação
3. Verifique que todas as env vars estão configuradas
4. Em último caso, faça rollback e investigue

## ✅ Checklist Final

Antes de finalizar:
- [ ] Migração SQL aplicada com sucesso
- [ ] Env vars configuradas (especialmente CARTPANDA_WEBHOOK_SECRET)
- [ ] Todas as 6 edge functions redeployadas
- [ ] Teste de compra PIX realizado
- [ ] Teste de compra cartão realizado
- [ ] Queries de reconciliação executadas
- [ ] Pedidos antigos não creditados foram processados
- [ ] Monitoramento ativo configurado
- [ ] Equipe notificada sobre mudanças

## 📊 Métricas de Sucesso

Após 24h do deploy:
- Webhooks processando 100% dos pagamentos
- Zero pedidos pagos sem crédito
- Zero tentativas bem-sucedidas de bypass RLS
- Zero updates indevidos em tournament_matches

---

**Data do Deploy:** _________  
**Responsável:** _________  
**Notas:** _________
