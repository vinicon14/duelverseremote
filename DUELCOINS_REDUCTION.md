# Redução de Recompensas em DuelCoins (10x)

## Objetivo

Reduzir por 10x as recompensas em DuelCoins das missões e do Battle Pass para rebalancear a economia do jogo.

**Meta**: Missões diárias devem pagar 8 DC/dia (antes: 80 DC/day), para que o PRO de 20 DC saia em ~2,5 dias de missões.

## Fórmula Aplicada

```sql
GREATEST(1, ROUND(valor / 10.0))
```

- Divide por 10
- Arredonda para o inteiro mais próximo
- Garante mínimo de 1 DC (nunca 0 para valores não-zero)
- Valores zero permanecem zero

## Mudanças Aplicadas

### 1. Missões do Battle Pass (battle_pass_missions)

| Escopo | Missão | Antes (DC) | Depois (DC) | Redução |
|--------|--------|------------|-------------|---------|
| **Diária** | Vença 2 duelos | 50 | 5 | 10x |
| **Diária** | Jogue 3 duelos | 30 | 3 | 10x |
| **Semanal** | Vença 10 duelos | 200 | 20 | 10x |
| **Semanal** | Participe de 2 torneios | 250 | 25 | 10x |
| **Temporada** | Alcance 25 vitórias | 500 | 50 | 10x |
| **Temporada** | Alcance 50 vitórias | 1,000 | 100 | 10x |
| **Temporada** | Alcance 100 vitórias | 2,500 | 250 | 10x |

**Total Diário**: 80 DC → **8 DC** ✓

### 2. Recompensas de Nível - Trilha FREE (battle_pass_rewards)

| Nível | Antes (DC) | Depois (DC) | Redução |
|-------|------------|-------------|---------|
| 1 | 55 | 6 | ~9.2x |
| 2 | 60 | 6 | 10x |
| 3 | 65 | 7 | ~9.3x |
| 4 | 70 | 7 | 10x |
| 5 | 75 | 8 | ~9.4x |
| 6 | 80 | 8 | 10x |
| 7 | 85 | 9 | ~9.4x |
| 8 | 90 | 9 | 10x |
| 9 | 95 | 10 | ~9.5x |
| 10 | 100 | 10 | 10x |
| ... | ... | ... | ... |
| 50 | 305 | 31 | ~9.8x |

**Fórmula anterior**: `50 + level * 5`  
**Fórmula nova**: `GREATEST(1, ROUND((50 + level * 5) / 10.0))`

### 3. Recompensas de Nível - Trilha PRO (battle_pass_rewards)

| Nível | Antes (DC) | Depois (DC) | Redução |
|-------|------------|-------------|---------|
| 1 | 160 | 16 | 10x |
| 2 | 170 | 17 | 10x |
| 3 | 180 | 18 | 10x |
| 4 | 190 | 19 | 10x |
| 5 | 200 | 20 | 10x |
| 6 | 210 | 21 | 10x |
| 7 | 220 | 22 | 10x |
| 8 | 230 | 23 | 10x |
| 9 | 240 | 24 | 10x |
| 10 | 250 | 25 | 10x |
| ... | ... | ... | ... |
| 50 | 650 | 65 | 10x |

**Fórmula anterior**: `150 + level * 10`  
**Fórmula nova**: `GREATEST(1, ROUND((150 + level * 10) / 10.0))`

## O Que NÃO Foi Alterado

✅ **Preços permanecem iguais**:
- PRO subscription (subscription_plans): 20 DC
- Battle Pass PRO (pro_price_duelcoins): 1,000 DC

✅ **Outros valores intactos**:
- XP de missões
- Requisitos de vitórias
- Itens cosméticos
- Progressão de níveis

## Validação

### Meta Atingida
- **Missões diárias**: 8 DC/dia ✓
- **Custo PRO**: 20 DC
- **Dias para PRO**: 20 ÷ 8 = **2.5 dias** ✓

### Idempotência
A migration é idempotente através de colunas marcadoras:
- `battle_pass_missions.rewards_reduced_10x`
- `battle_pass_rewards.rewards_reduced_10x`

Aplicar a migration múltiplas vezes não causará redução adicional.

## Arquivos Modificados

### Novo
- `supabase/migrations/20261005103000_reduce_duelcoins_rewards_10x.sql`

### Frontend
Nenhuma alteração necessária - os componentes são dinâmicos e renderizam valores do banco de dados:
- `src/components/battlepass/BattlePass.tsx`
- `src/components/battlepass/BattlePassMissions.tsx`

## Notas Técnicas

1. **Títulos de recompensas** que seguem o padrão `"N DuelCoins"` são automaticamente atualizados para refletir o novo valor
2. **Apenas recompensas ativas** (`is_active = true`) são atualizadas
3. **Apenas recompensas do tipo `duelcoins`** têm o campo `amount` modificado
4. A migration inclui `RAISE NOTICE` para registrar quantos registros foram atualizados
