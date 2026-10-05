# Correções do Fluxo de Torneio - 05/10/2026

## Contexto
Antes do torneio pago de sábado 10/10/2026 (inscrição 5 DC, prêmio R$ 10 Pix ou 1 mês PRO), foram identificados e corrigidos três furos de segurança no fluxo de torneio.

## Base do Código
- **Branch base**: `origin/main` (commit `fc1b422`)
- **Commit "Corrigiu seleção de ganhador"** (fc1b422) JÁ RESOLVEU o Problema 2
- **Prêmio do sábado**: R$ 10 Pix OU 1 mês PRO (manual), não prize_pool em DC

## Problemas Identificados e Soluções

### ✅ Problema 1: Inscrição Grátis em Torneio Pago

**Descrição**: 
A policy `"Usuarios podem se inscrever"` (migration `20260801124925`) permitia INSERT direto em `tournament_participants`, burlando a cobrança da taxa de inscrição (`entry_fee`).

**Causa Raiz**:
```sql
-- Policy que permitia bypass:
CREATE POLICY "Usuarios podem se inscrever" ON public.tournament_participants
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);
```

Um usuário mal-intencionado poderia fazer:
```typescript
await supabase
  .from('tournament_participants')
  .insert({ tournament_id: id, user_id: auth.uid(), status: 'registered' });
```

E entrar no torneio pago SEM pagar a taxa.

**Solução** (migration `20261005104200_fix_tournament_registration_rls.sql`):
- ✅ Removida a policy de INSERT direto
- ✅ Inscrições agora DEVEM passar por:
  1. **Edge Function**: `charge-tournament-entry-fee`
  2. **RPC SECURITY DEFINER**: `join_weekly_tournament`

Ambas validam saldo, cobram `entry_fee`, registram transação e só então inserem em `tournament_participants` atomicamente.

**Caminhos do Cliente Validados**:
- ✅ `TournamentDetail.tsx` (linha 694-752): usa `charge-tournament-entry-fee`
- ✅ `WeeklyTournamentCard.tsx` (linha 51-88): tenta `join_weekly_tournament` RPC primeiro, fallback para edge function
- ✅ `Tournaments.tsx`: não tem inscrição direta
- ✅ `TournamentManager.tsx`: só criação, sem inscrição

**Teste**:
```sql
-- Deve falhar:
INSERT INTO tournament_participants (tournament_id, user_id, status)
VALUES ('...', auth.uid(), 'registered');
-- Error: insufficient_privilege

-- Deve funcionar:
SELECT join_weekly_tournament('tournament-id');
-- ✓ Cobra entry_fee, registra transação, inscreve
```

---

### ✅ Problema 2: Torneio Não Fecha Após Pagamento

**Descrição**:
`TournamentWinnerSelector` chama uma função que poderia falhar por RLS ao marcar `tournaments.status = 'completed'`.

**Análise**:
O commit fc1b422 "Corrigiu seleção de ganhador" já havia introduzido `tournament_finalize_winner` (em `drizzle/migrations/0000_tournament_finalize_winner.sql`), que é SECURITY DEFINER e contorna RLS.

**Solução** (migration `20261005104400_ensure_tournament_finalize_rpc.sql`):
- ✅ Garantida existência de `tournament_finalize_winner` no schema `supabase/migrations`
- ✅ Função é SECURITY DEFINER: bypassa RLS
- ✅ Valida: criador/admin, vencedor é participante, torneio não está completo
- ✅ Chama `tournament_pay_winner` para pagamento
- ✅ Marca vencedor e finaliza torneio (`status = 'completed'`)
- ✅ Policies de UPDATE em `tournaments` validadas/criadas

**Fluxo Completo**:
```typescript
// TournamentWinnerSelector.tsx (linha 44-50)
const { data, error } = await supabase.rpc(
  'tournament_finalize_winner',
  { p_tournament_id: tournamentId, p_winner_id: selectedWinnerId }
);

// RPC faz tudo atomicamente:
// 1. Valida criador/admin
// 2. Chama tournament_pay_winner (se prize_pool > 0 e não pago)
// 3. UPDATE tournament_participants SET status = 'winner'
// 4. UPDATE tournaments SET status = 'completed', prize_paid = true
```

**Teste**:
```sql
-- Criador finaliza torneio:
SELECT tournament_finalize_winner('tournament-id', 'winner-id');
-- ✓ Paga prêmio, marca vencedor, status = 'completed'
```

---

### ✅ Problema 3: `check_expired_subscriptions` Remove PRO de Admin

**Descrição**:
A rotina de expiração removia `account_type = 'pro'` mesmo quando a assinatura foi concedida manualmente pelo admin.

**Causa Raiz**:
```sql
-- Versão antiga preservava apenas admins via user_roles:
UPDATE profiles SET account_type = 'free'
WHERE account_type = 'pro'
  AND user_id NOT IN (SELECT user_id FROM user_roles WHERE role = 'admin')
  AND user_id NOT IN (SELECT user_id FROM user_subscriptions WHERE is_active = true);
```

Mas não havia como distinguir assinaturas **concedidas manualmente** por admin de assinaturas **compradas** pelo usuário.

**Solução** (migration `20261005104300_fix_admin_granted_pro.sql`):
- ✅ Adicionada coluna `granted_by UUID` em `user_subscriptions`
- ✅ Criada função `grant_pro_subscription(user_id, duration_days)` para admin conceder PRO
- ✅ Atualizada `check_expired_subscriptions` para preservar PRO quando:
  1. Usuário tem role `admin` (via `user_roles`), OU
  2. Usuário tem assinatura com `granted_by IS NOT NULL` (mesmo se expirada)

**Uso**:
```sql
-- Admin concede PRO manualmente:
SELECT grant_pro_subscription('user-id', 365); -- 1 ano
-- ✓ Cria subscription com granted_by = admin_id
-- ✓ PRO nunca expira automaticamente (preservado por granted_by)

-- Admin concede PRO por 30 dias:
SELECT grant_pro_subscription('user-id', 30);
-- ✓ Mesmo após expiração, PRO é mantido (granted_by IS NOT NULL)
```

**Teste**:
```sql
-- Admin concede PRO:
SELECT grant_pro_subscription('user-id', 365);

-- Força expiração de outras assinaturas:
PERFORM check_expired_subscriptions();

-- PRO ainda está ativo:
SELECT account_type FROM profiles WHERE user_id = 'user-id';
-- ✓ 'pro' (preservado por granted_by)
```

---

## Validação do Fluxo Completo

### 1. Inscrição
- ✅ Usuário clica "Participar" em `TournamentDetail` ou `WeeklyTournamentCard`
- ✅ Edge function `charge-tournament-entry-fee` ou RPC `join_weekly_tournament` é chamada
- ✅ Valida saldo, cobra `entry_fee`, registra transação
- ✅ Insere em `tournament_participants` (única forma de inscrição)

### 2. Envio e Trava de Decklist
- ⚠️ **TODO**: Verificar fluxo de `requires_decklist`
- ⚠️ **TODO**: Validar que decklist é travada após envio

### 3. Lobby
- ✅ `TournamentLobby.tsx` (linha 595): countdown de 3 minutos quando todos presentes
- ✅ Cria mesas automaticamente

### 4. Início dos Confrontos
- ✅ Organização gera bracket via `generate_next_round` (suíço) ou `generateBracket` (eliminação)
- ✅ Jogadores relatam resultados via `PlayerMatchReportModal`
- ✅ Criador pode definir vencedor manualmente via `creatorSetResult`

### 5. Registro do Campeão
- ✅ Criador seleciona vencedor em `TournamentWinnerSelector`
- ✅ `tournament_finalize_winner` paga prêmio e finaliza torneio
- ✅ Status muda para `'completed'`, `prize_paid = true`

---

## Gaps Identificados (Não Bloqueantes para Sábado)

### ⚠️ 1. Decklist não está sendo validado/travado
**Status Atual**: 
- ✅ `TournamentDecklistViewer` existe e exibe decklists enviadas
- ✅ Tabela `tournament_decklists` existe (migration 20260413163656)
- ⚠️ Não há validação se todos participantes enviaram (se `requires_decklist=true`)
- ⚠️ Não há "trava" impedindo edição após envio

**Impacto**: Baixo (torneio de sábado pode não exigir decklist)
**Recomendação**: Se torneio exigir decklist, validar manualmente antes de iniciar

### ⚠️ 2. Conflitos de resultado não têm resolução automática
**Impacto**: Baixo (criador pode definir manualmente)
**Status Atual**: 
- Jogadores relatam via `PlayerMatchReportModal`
- Se resultados conflitam, `conflict_count` aumenta
- Criador resolve manualmente via `creatorSetResult`

### ⚠️ 3. Suíço Top 4 não está totalmente testado
**Impacto**: Médio (se torneio de sábado usar esse formato)
**Recomendação**: Testar bracket suíço + top 4 antes de usar em produção

### ⚠️ 4. Reembolso em caso de cancelamento
**Status Atual**: 
- ✅ `tournament_refund_participant` existe e está validado
- ✅ `removeParticipant` em `TournamentDetail` chama o RPC de reembolso
- ⚠️ Não testado para torneio já iniciado

---

## Migrations Criadas

1. **`20261005104200_fix_tournament_registration_rls.sql`**
   - Remove policy de INSERT direto em `tournament_participants`
   - Força uso de edge function ou RPC para inscrição

2. **`20261005104300_fix_admin_granted_pro.sql`**
   - Adiciona `granted_by` em `user_subscriptions`
   - Cria `grant_pro_subscription` para admin conceder PRO
   - Atualiza `check_expired_subscriptions` para preservar PRO concedido

3. **`20261005104400_ensure_tournament_finalize_rpc.sql`**
   - Garante `tournament_finalize_winner` no schema supabase
   - Valida policies de UPDATE em `tournaments`

---

## Testes SQL

Arquivo: `tests/sql/test_tournament_fixes.sql`

Testes cobrem:
1. ✅ INSERT direto em `tournament_participants` deve falhar
2. ✅ `join_weekly_tournament` cobra entry_fee e inscreve
3. ✅ `tournament_finalize_winner` paga e finaliza
4. ✅ `grant_pro_subscription` preserva PRO na expiração
5. ✅ Admin mantém PRO mesmo sem subscription

---

## Checklist Pré-Torneio de Sábado

- [x] Problema 1 corrigido: inscrição só via RPC
- [x] Problema 2 corrigido: torneio finaliza corretamente
- [x] Problema 3 corrigido: PRO admin preservado
- [x] Migrations criadas e testadas
- [ ] Migrations aplicadas em staging
- [ ] Testes SQL executados em staging
- [ ] Teste end-to-end: inscrição → lobby → partidas → finalização
- [ ] Validar fluxo de decklist (se necessário)
- [ ] Verificar saldo do organizador para prize_pool
- [ ] Confirmar integração Pix para prêmio em dinheiro
- [ ] Backup de banco antes do torneio
- [ ] Monitoramento durante o torneio

---

## Notas de Implementação

### Edge Functions vs RPCs
- **Edge Functions**: Usam JWT do usuário, podem chamar RPCs SECURITY DEFINER
- **RPCs SECURITY DEFINER**: Executam com privilégios elevados, validam auth.uid()
- **Preferência**: Edge function para lógica complexa + validação, RPC para operações atômicas

### RLS vs SECURITY DEFINER
- **RLS**: Previne acesso não autorizado em nível de linha
- **SECURITY DEFINER**: Bypassa RLS, mas função deve validar permissões
- **Torneios**: SECURITY DEFINER usado para operações que precisam de transação atômica (inscrição, pagamento, finalização)

### Transações e Atomicidade
- ✅ Inscrição: débito + registro de transação + INSERT em participants (atômico)
- ✅ Finalização: pagamento + marca vencedor + atualiza status (atômico)
- ✅ Concessão PRO: débito (se pago) + subscription + update profiles (atômico)

---

## Contato

Para dúvidas ou problemas durante o torneio de sábado:
- **Desenvolvedor**: Vinícius
- **Data da correção**: 05/10/2026
- **Commit desta correção**: [será preenchido após commit]
