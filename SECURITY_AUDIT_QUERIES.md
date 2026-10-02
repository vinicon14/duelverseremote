# Auditoria: exploração dos guards de `profiles`

## Contexto

Os triggers `prevent_profile_privilege_escalation()` e `prevent_profile_tampering()` eram
`SECURITY DEFINER` e liberavam quando `current_user IN ('postgres', ...)`. Dentro de uma função
`SECURITY DEFINER`, `current_user` é sempre o dono (postgres), então os guards nunca bloqueavam:
qualquer usuário logado conseguia fazer, pelo supabase-js,
`update profiles set duelcoins_balance = ..., account_type = 'pro', points = ..., is_verified = true`.

Janelas de risco (pelas migrations; ajuste pela data real do deploy):

| Período | Situação |
|---|---|
| até 2026-05-12 (`20260512154740`) | não havia guard nenhum: `profiles` era 100% editável pelo dono |
| 2026-05-12 → 2026-08-07 | guards bloqueavam o cliente (e também quebravam RPCs) |
| 2026-08-07 (`20260807001435`) → deploy da correção | guards inoperantes (bug do `current_user`) |

Como as janelas são longas, as queries abaixo **não filtram por data**: elas reconciliam o estado
atual com os registros do servidor.

Rode no SQL editor (papel postgres). Elas só leem dados.

## 1. Saldo acima do razão (`duelcoins_transactions`)

Todo crédito legítimo feito pelo servidor registra uma linha em `duelcoins_transactions`
(`purchase` do webhook, `admin_add`, `transfer`, `tournament_prize`, `tournament_refund`,
`battle_pass_*`, `judge_reward`, venda no marketplace etc.). O saldo inicial é 0.
Então `saldo atual - (créditos - débitos)` > 0 indica crédito que não passou pelo servidor.

```sql
WITH ledger AS (
  SELECT user_id, SUM(credit) AS credits, SUM(debit) AS debits
  FROM (
    SELECT receiver_id AS user_id, amount AS credit, 0 AS debit
      FROM public.duelcoins_transactions WHERE receiver_id IS NOT NULL
    UNION ALL
    SELECT sender_id, 0, amount
      FROM public.duelcoins_transactions WHERE sender_id IS NOT NULL
  ) x
  GROUP BY user_id
)
SELECT p.user_id,
       p.username,
       u.email,
       p.account_type,
       p.duelcoins_balance,
       COALESCE(l.credits, 0)                          AS creditos_registrados,
       COALESCE(l.debits, 0)                           AS debitos_registrados,
       COALESCE(l.credits, 0) - COALESCE(l.debits, 0)  AS saldo_esperado,
       p.duelcoins_balance - (COALESCE(l.credits, 0) - COALESCE(l.debits, 0)) AS excesso,
       p.created_at,
       p.updated_at
FROM public.profiles p
LEFT JOIN ledger l     ON l.user_id = p.user_id
LEFT JOIN auth.users u ON u.id = p.user_id
WHERE p.duelcoins_balance > COALESCE(l.credits, 0) - COALESCE(l.debits, 0)
ORDER BY excesso DESC;
```

Notas:
- Transferências creditam o `receiver_id` e debitam o `sender_id` (a versão anterior desta query
  agrupava por `COALESCE(sender_id, receiver_id)` e marcava todo destinatário de transferência como
  suspeito, além de usar `p.email`, coluna que não existe em `profiles`).
- Débitos não registrados (ex.: a edge function `charge-tournament-entry-fee` tenta inserir a
  transação com o JWT do usuário e a policy `Only through functions` bloqueia) só **reduzem** o
  saldo, então não geram falso positivo. Mas podem mascarar parte de um excesso.
- Falsos positivos possíveis: ajustes manuais feitos direto no SQL editor sem registrar transação.
- Para detalhar um usuário:

```sql
SELECT created_at, transaction_type, amount,
       CASE WHEN receiver_id = :'uid' THEN 'credito' ELSE 'debito' END AS sentido,
       sender_id, receiver_id, tournament_id, description
FROM public.duelcoins_transactions
WHERE sender_id = :'uid' OR receiver_id = :'uid'
ORDER BY created_at;
```

## 2. PRO sem assinatura paga correspondente

PRO legítimo: `activate_subscription` (debita DuelCoins, grava `transaction_type = 'subscription'`
e cria `user_subscriptions` no mesmo instante), ou concessão manual por admin
(`admin-toggle-pro` / painel). Admins são PRO por padrão.

```sql
SELECT p.user_id,
       p.username,
       u.email,
       p.updated_at,
       s.id         AS assinatura_ativa,
       s.starts_at,
       s.expires_at,
       (SELECT max(t.created_at) FROM public.duelcoins_transactions t
         WHERE t.sender_id = p.user_id AND t.transaction_type = 'subscription') AS ultima_compra_pro
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.user_id
LEFT JOIN LATERAL (
  SELECT * FROM public.user_subscriptions s
   WHERE s.user_id = p.user_id AND s.is_active AND s.expires_at >= now()
   ORDER BY s.expires_at DESC LIMIT 1
) s ON true
WHERE p.account_type = 'pro'
  AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role = 'admin')
  AND (
    s.id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.duelcoins_transactions t
       WHERE t.sender_id = p.user_id
         AND t.transaction_type = 'subscription'
         AND t.created_at BETWEEN s.starts_at - interval '5 minutes' AND s.starts_at + interval '5 minutes'
    )
  )
ORDER BY p.updated_at DESC;
```

O resultado inclui PRO concedido manualmente por admin (sem assinatura): confira com quem concedeu.

## 3. Assinaturas ativas sem pagamento

O frontend (`useAccountType`, `is_user_pro`) também considera PRO quem tem uma linha ativa em
`user_subscriptions`, mesmo com `account_type = 'free'`.

```sql
SELECT s.id, s.user_id, p.username, p.account_type, s.plan_id, s.starts_at, s.expires_at, s.created_at
FROM public.user_subscriptions s
JOIN public.profiles p ON p.user_id = s.user_id
WHERE s.is_active
  AND s.expires_at >= now()
  AND NOT EXISTS (
    SELECT 1 FROM public.duelcoins_transactions t
     WHERE t.sender_id = s.user_id
       AND t.transaction_type = 'subscription'
       AND t.created_at BETWEEN s.starts_at - interval '5 minutes' AND s.starts_at + interval '5 minutes'
  )
ORDER BY s.expires_at DESC;

-- Usuário comum consegue inserir a própria assinatura? (não deveria existir policy de INSERT para authenticated)
SELECT policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'user_subscriptions';
```

## 4. Estatísticas e verificação

```sql
-- vitórias/derrotas acima do histórico de partidas (match_history é gravado por record_match_result)
SELECT p.user_id, p.username, p.wins, p.losses, p.points, h.wins_hist, h.losses_hist
FROM public.profiles p
CROSS JOIN LATERAL (
  SELECT count(*) FILTER (WHERE m.winner_id = p.user_id) AS wins_hist,
         count(*) FILTER (WHERE m.winner_id IS NOT NULL AND m.winner_id <> p.user_id) AS losses_hist
  FROM public.match_history m
  WHERE p.user_id IN (m.player1_id, m.player2_id)
) h
WHERE p.wins > h.wins_hist OR p.losses > h.losses_hist
ORDER BY p.wins - h.wins_hist DESC;

-- selo de verificado sem pedido aprovado (admin_set_user_verified também concede sem pedido)
SELECT p.user_id, p.username, p.verified_at
FROM public.profiles p
WHERE p.is_verified
  AND NOT EXISTS (SELECT 1 FROM public.verification_requests v
                   WHERE v.user_id = p.user_id AND v.status = 'approved');
```

## Ações recomendadas

**Não corrija saldos ou contas automaticamente sem investigação manual.**

1. Rode as queries e investigue cada caso.
2. Para fraude confirmada, ajuste pelo painel admin (`admin_manage_duelcoins`, operação `remove`,
   que registra `admin_remove` no razão) e rebaixe o `account_type` pelo painel.
3. Considere reverter torneios, compras ou transferências feitos com saldo fraudulento
   (o saldo pode ter sido "lavado" via `transfer_duelcoins` para outra conta: veja as transferências
   que saem de cada conta suspeita).
4. Documente os casos.
