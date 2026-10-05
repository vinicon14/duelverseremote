# Redução de Recompensas em DuelCoins (10x)

Migration: `supabase/migrations/20261005103000_reduce_duelcoins_rewards_10x.sql`

## Objetivo

Dividir por 10 as recompensas em DuelCoins (DC) das missões e das trilhas do Battle Pass.
Missões diárias passam a pagar **8 DC/dia** (antes 80), então o plano PRO de 20 DC sai em ~2,5 dias de diárias.

**Não muda:** preço do PRO (`subscription_plans`), preço do Battle Pass PRO
(`battle_pass_seasons.pro_price_duelcoins` = 1000 DC), metas/métricas das missões,
`wins_required` dos níveis, recompensas cosméticas (para elas `amount` é quantidade de item).

## Fórmula

`v > 0 → GREATEST(1, ROUND(v / 10.0))`; `v = 0` continua 0. Atualização relativa (vale para valores editados no admin, não só o seed).

## Missões (`battle_pass_missions.reward_duelcoins`) — todas, ativas ou não

| Escopo | Missão | Antes | Depois |
|---|---|---|---|
| Diária | Vença 2 duelos | 50 | 5 |
| Diária | Jogue 3 duelos | 30 | 3 |
| **Total diário** | | **80** | **8** |
| Semanal | Vença 10 duelos | 200 | 20 |
| Semanal | Participe de 2 torneios | 250 | 25 |
| Temporada | Alcance 25 vitórias | 500 | 50 |
| Temporada | Alcance 50 vitórias | 1000 | 100 |
| Temporada | Alcance 100 vitórias | 2500 | 250 |

## Trilhas (`battle_pass_rewards`, só `reward_type = 'duelcoins'`) — seed da Season 01

Na trilha FREE, os níveis múltiplos de 5 são sleeve/badge (não DC). Na PRO, os múltiplos
de 3, 5 e 7 são título/moldura/efeito/playmat (não DC). Esses ficam intactos.

| Trilha | Níveis com DC | Total antes | Total depois | Exemplos |
|---|---|---|---|---|
| FREE | 40 | 7000 | 710 | nv1 55→6, nv2 60→6, nv3 65→7, nv49 295→30 |
| PRO | 23 | 9290 | 929 | nv1 160→16, nv2 170→17, nv4 190→19, nv47 620→62 |

Títulos no formato `"N DuelCoins"` são reescritos a partir do novo `amount`, no mesmo UPDATE.

## Idempotência

Coluna marcadora `rewards_reduced_10x` em `battle_pass_missions` e `battle_pass_rewards`:

- criada com `DEFAULT false` (linhas existentes começam "não processadas");
- o UPDATE processa só `rewards_reduced_10x = false` e marca `true` (inclusive cosméticos, para que
  uma recompensa trocada depois para `duelcoins` nunca seja dividida);
- em seguida o default vira `true`: linhas criadas depois (admin, nova temporada) já nascem na escala nova.

Reaplicar o arquivo é no-op.

## Painel admin

Defaults de criação em `AdminBattlePass.tsx` também ficam na escala nova: nova missão 5 DC (antes 50),
nova recompensa 10 DC (antes 100).
