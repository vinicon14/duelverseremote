# Queries de Auditoria - Correção de Segurança dos Profile Guards

## Contexto

Foi corrigida uma vulnerabilidade crítica nos triggers `prevent_profile_privilege_escalation` e `prevent_profile_tampering` que permitia usuários autenticados modificarem campos privilegiados de seus próprios perfis (saldo de DuelCoins, tipo de conta, estatísticas, etc.).

Os triggers eram `SECURITY DEFINER` e verificavam `current_user IN ('postgres','supabase_admin','service_role')`, mas como `current_user` dentro de uma função `SECURITY DEFINER` sempre retorna o dono da função (postgres), a verificação nunca bloqueava nada.

## Queries de Auditoria

### 1. Verificar perfis com saldo suspeito (maior que transações)

Identifica usuários cujo `duelcoins_balance` atual é maior do que a soma de todas as suas transações de crédito menos débito.

```sql
WITH user_transactions AS (
  SELECT 
    COALESCE(t.sender_id, t.receiver_id) as user_id,
    SUM(
      CASE 
        WHEN t.receiver_id = COALESCE(t.sender_id, t.receiver_id) THEN t.amount
        WHEN t.sender_id = COALESCE(t.sender_id, t.receiver_id) THEN -t.amount
        ELSE 0
      END
    ) as calculated_balance
  FROM duelcoins_transactions t
  GROUP BY COALESCE(t.sender_id, t.receiver_id)
)
SELECT 
  p.user_id,
  p.username,
  p.email,
  p.duelcoins_balance as current_balance,
  COALESCE(ut.calculated_balance, 0) as transaction_balance,
  p.duelcoins_balance - COALESCE(ut.calculated_balance, 0) as discrepancy,
  p.created_at,
  p.updated_at
FROM profiles p
LEFT JOIN user_transactions ut ON p.user_id = ut.user_id
LEFT JOIN auth.users u ON p.user_id = u.id
WHERE p.duelcoins_balance > COALESCE(ut.calculated_balance, 0) + 100
  -- Margem de 100 DC para compensar possíveis bonus/rewards não registrados
ORDER BY (p.duelcoins_balance - COALESCE(ut.calculated_balance, 0)) DESC;
```

### 2. Verificar contas PRO sem assinatura ou pagamento

Identifica usuários com `account_type = 'pro'` mas sem registro de pagamento/assinatura correspondente.

```sql
SELECT 
  p.user_id,
  p.username,
  p.email,
  p.account_type,
  p.created_at,
  p.updated_at,
  COUNT(t.id) as subscription_transactions,
  MAX(t.created_at) as last_subscription_date
FROM profiles p
LEFT JOIN auth.users u ON p.user_id = u.id
LEFT JOIN duelcoins_transactions t ON 
  (t.sender_id = p.user_id OR t.receiver_id = p.user_id) 
  AND t.transaction_type = 'subscription'
WHERE p.account_type = 'pro'
GROUP BY p.user_id, p.username, p.email, p.account_type, p.created_at, p.updated_at
HAVING COUNT(t.id) = 0
ORDER BY p.updated_at DESC;
```

### 3. Verificar modificações recentes em campos protegidos

Identifica perfis que foram atualizados recentemente e podem ter sido afetados pela vulnerabilidade.

```sql
SELECT 
  p.user_id,
  p.username,
  p.email,
  p.duelcoins_balance,
  p.account_type,
  p.points,
  p.wins,
  p.losses,
  p.level,
  p.is_banned,
  p.updated_at,
  p.created_at,
  EXTRACT(EPOCH FROM (p.updated_at - p.created_at)) / 86400 as days_since_creation
FROM profiles p
LEFT JOIN auth.users u ON p.user_id = u.id
WHERE p.updated_at > NOW() - INTERVAL '30 days'
  AND (
    p.duelcoins_balance > 10000
    OR p.account_type = 'pro'
    OR p.points > 5000
  )
ORDER BY p.updated_at DESC;
```

### 4. Verificar usuários com estatísticas suspeitas

Identifica usuários com wins/losses/pontos muito altos que podem ter sido manipulados.

```sql
SELECT 
  p.user_id,
  p.username,
  p.email,
  p.wins,
  p.losses,
  p.points,
  p.level,
  p.created_at,
  p.updated_at,
  EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400 as account_age_days,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400 > 0 
    THEN (p.wins + p.losses) / (EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400)
    ELSE 0 
  END as matches_per_day
FROM profiles p
LEFT JOIN auth.users u ON p.user_id = u.id
WHERE (
  p.wins > 1000 
  OR p.losses > 1000 
  OR p.points > 10000
  OR (
    EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400 > 0 
    AND (p.wins + p.losses) / (EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 86400) > 50
  )
)
ORDER BY p.points DESC, p.wins DESC;
```

### 5. Histórico de updates no log (se disponível)

Se o Supabase tiver logs de auditoria habilitados, procure por:

```sql
-- Esta query depende de ter audit logging habilitado
-- Ajuste conforme o sistema de logging do seu Supabase
SELECT 
  *
FROM audit.record_version
WHERE table_name = 'profiles'
  AND operation = 'UPDATE'
  AND record_id IN (
    SELECT user_id::text 
    FROM profiles 
    WHERE duelcoins_balance > 5000 OR account_type = 'pro'
  )
ORDER BY created_at DESC;
```

## Ações Recomendadas

**NÃO EXECUTE correções automáticas de saldos ou contas sem investigação manual.**

1. Execute cada query acima
2. Investigue manualmente cada caso suspeito
3. Verifique logs do Supabase (se disponíveis) para confirmar modificações não autorizadas
4. Para casos confirmados de fraude:
   - Revogue privilégios/bans conforme política
   - Corrija saldos manualmente via RPC `service_credit_duelcoins` ou admin panel
   - Considere rollback de torneios/compras fraudulentas
5. Documente todos os casos encontrados

## Período de Risco

A vulnerabilidade existia desde a criação dos triggers em `20260807001435_a8065fe8-c54c-4754-9411-cd962aed0a72.sql`. 

Foque a auditoria no período entre essa migration e a aplicação da correção (migration `20261002210000_fix_profile_guards_invoker.sql`).
