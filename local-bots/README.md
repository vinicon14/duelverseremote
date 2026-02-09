# 🤖 Duelverse Bots System

Sistema de bots interativos para testar mecânicas de torneios no Duelverse.

## 📋 O que os bots fazem

- ✅ Criam contas automaticamente
- ✅ Ficam online na plataforma
- ✅ Interagem no chat global com mensagens realistas
- ✅ Se inscrevem em torneios automaticamente
- ✅ Participam de partidas de torneios
- ✅ Simulam resultados de partidas

## 🚀 Como usar

### 1. Execute a migration no Supabase

No SQL Editor do Supabase, execute:
```sql
-- Arquivo: local-bots/database-migration.sql
```

### 2. Configure as credenciais

Edite `bot-runner.js` e adicione suas credenciais do Supabase:

```javascript
const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_KEY = 'SUA_ANON_KEY';
```

### 3. Instale as dependências

```bash
cd local-bots
npm install
```

### 4. Execute os bots

```bash
node bot-runner.js
```

## 🎮 Bots disponíveis

| Bot | Personalidade | Nível | Pontos |
|-----|---------------|-------|--------|
| Bot_Duelista | Agressivo | 5 | 1500 |
| Bot_MagoNegro | Estratégico | 8 | 2500 |
| Bot_DragonMaster | Equilibrado | 6 | 1800 |
| Bot_SpeedDuel | Rápido | 4 | 1200 |
| Bot_CardMaster | Colecionador | 10 | 3500 |
| Bot_Shadow | Misterioso | 7 | 2200 |
| Bot_Thunder | Energético | 5 | 1600 |
| Bot_Ancient | Sábio | 12 | 4200 |

## 📁 Arquivos

```
local-bots/
├── bot-system.js        # Sistema principal dos bots
├── bot-runner.js        # Script para executar
├── database-migration.sql # Migration do banco
├── package.json         # Dependências
└── README.md           # Este arquivo
```

## ⚠️ Notas

- Os bots são criados com email `@duelverse.local`
- Cada bot tem 5000 DuelCoins iniciais
- As mensagens de chat variam conforme a personalidade
- Os bots não entram em duelos PvP normais, apenas torneios

## 🛑 Parar os bots

Pressione `Ctrl+C` no terminal ou feche a janela.

---

Desenvolvido para testes do Duelverse
