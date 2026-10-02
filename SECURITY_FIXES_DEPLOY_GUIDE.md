# Guia de Implantação - Correções de Segurança HIGH

## ⚠️ IMPORTANTE: Leia antes de aplicar

Estas correções de segurança resolvem duas vulnerabilidades HIGH identificadas no audit:
- **A) DuelCoins**: RLS bypass no INSERT, webhooks sem validação adequada
- **B) Tournament Matches**: Política RLS permissiva demais

## 📋 Pré-requisitos

1. Backup completo do banco de dados de produção
2. Acesso ao Supabase Dashboard (para configurar env vars)
3. Acesso ao repositório para redeploy das edge functions
4. Tempo de manutenção agendado (estimado: 15-30 minutos)

## 🔧 Passos de Implantação

### 1. Configurar Variáveis de Ambiente

No Supabase Dashboard → Settings → Edge Functions, adicione/verifique:

```bash
# Obrigatórias (já devem existir):
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...

# Nova variável (opcional, mas RECOMENDADO para CartPanda):
CARTPANDA_WEBHOOK_SECRET=seu-secret-aqui

# Se usar Stripe:
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**NOTA IMPORTANTE sobre CartPanda:**
- Se `CARTPANDA_WEBHOOK_SECRET` NÃO for configurado, o webhook CartPanda será DESABILITADO (retorna 410)
- Configure este secret no painel da CartPanda se suportado, ou use um UUID aleatório e configure em ambos os lados
- O webhook valida o secret via header `X-CartPanda-Secret` ou `Authorization`

### 2. Aplicar Migração SQL

Execute a migração no banco de produção:

```bash
# Via Supabase CLI
supabase db push

# OU manualmente via SQL Editor no Dashboard
# Copie o conteúdo de: supabase/migrations/20261002084339_security_fix_rls_duelcoins_and_matches.sql
```

**O que esta migração faz:**
1. ✅ Remove política RLS que permite INSERT direto em `duelcoins_orders`
2. ✅ Cria RPC `create_duelcoins_order` (para edge functions criarem pedidos com validação)
3. ✅ Cria RPC `service_credit_duelcoins` (restrito a service_role, idempotente)
4. ✅ Remove política permissiva em `tournament_matches` (FOR ALL USING true)
5. ✅ Cria políticas restritas para tournament_matches (SELECT, INSERT, UPDATE, DELETE)

### 3. Redeploy das Edge Functions

As seguintes functions foram atualizadas e DEVEM ser redeployadas:

```bash
# Todas de uma vez:
supabase functions deploy cartpanda-webhook
supabase functions deploy mercadopago-webhook
supabase functions deploy mercadopago-create-pix
supabase functions deploy mercadopago-create-checkout
supabase functions deploy stripe-webhook
supabase functions deploy stripe-create-checkout

# OU individualmente conforme necessário
```

**Alterações por função:**

- **cartpanda-webhook**: 
  - ✅ Adiciona verificação de secret (header X-CartPanda-Secret)
  - ✅ Usa `service_credit_duelcoins` em vez de `admin_manage_duelcoins`
  - ✅ Retorna 410 se secret não configurado (desabilitado por segurança)

- **mercadopago-webhook**:
  - ✅ Valida payment do API do Mercado Pago (já estava fazendo)
  - ✅ Match estrito por external_reference (nosso order ID)
  - ✅ Valida que amount pago = amount do pedido (margem 0.01)
  - ✅ Valida currency = BRL
  - ✅ Usa `service_credit_duelcoins` (idempotente)

- **mercadopago-create-pix** & **mercadopago-create-checkout**:
  - ✅ Usa `create_duelcoins_order` RPC em vez de INSERT direto
  - ✅ Valida package do lado do servidor

- **stripe-webhook**:
  - ✅ Busca order antes de creditar
  - ✅ Usa `service_credit_duelcoins` (idempotente)

- **stripe-create-checkout**:
  - ✅ Usa `create_duelcoins_order` RPC em vez de INSERT direto

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

### 5. Reconciliação de Pedidos Passados

Execute as queries em `RECONCILIATION_QUERIES.sql` para identificar:
- Pedidos pagos mas não creditados
- Discrepâncias entre saldos e transações
- Pedidos pendentes há mais de 24h

**Para creditar manualmente pedidos não processados:**

```sql
-- Exemplo: creditar pedido que foi pago mas não creditado
SELECT service_credit_duelcoins(
  'order-uuid-aqui'::uuid,
  'payment-id-externo',  -- opcional
  'mercadopago'          -- opcional
);
```

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
