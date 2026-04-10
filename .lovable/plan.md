

# Plano: Priorizar Câmera e Garantir Consistência Cross-Platform

## Problema Principal

Atualmente, o painel remoto (`renderRemotePanel`) **sempre** mostra o deck virtual do oponente quando `remoteDeckContent` é passado, ignorando completamente se o oponente abriu ou não o deck. A câmera nunca aparece porque o conteúdo do deck é sempre fornecido.

O comportamento correto deve ser: **câmera sempre tem prioridade**. O deck virtual só aparece quando o jogador **desliga a câmera** ou **abre o deck manualmente**.

## Mudanças

### 1. Corrigir prioridade câmera > deck no WebRTCVideoCall.tsx

**`renderRemotePanel`** — Mudar a lógica para:
- Sempre manter o `<video>` montado no DOM (para não perder o stream)
- Mostrar o deck overlay **somente** quando `remoteDeckOpen` for `true` (ou o slot correspondente em `remoteDeckOpenSlots`)
- Quando o deck estiver fechado, mostrar a câmera normalmente

**`renderLocalPanel`** — Já funciona corretamente (mostra deck só quando `localDeckOpen` é true)

### 2. Corrigir DuelRoom.tsx — Parar de forçar deck overlay

- **Para participantes**: `remoteDeckContent` continua sendo passado (o componente `FloatingOpponentViewer`), mas só será exibido quando `remoteDeckOpen` for `true` (oponente abriu o deck)
- **Para espectadores**: Ambos os painéis devem mostrar câmera por padrão. O deck só aparece quando o jogador respectivo abre seu deck. Ajustar `localDeckOpen` para não ser `true` fixo para espectadores — deve depender de se o jogador 1 abriu seu deck
- Adicionar tracking do estado de deck de cada jogador específico para espectadores (usando o broadcast `deck-toggle` que já existe)

### 3. Broadcast de deck para espectadores

O sistema de broadcast `deck-toggle` já envia `{ userId, isOpen }`. Para espectadores:
- Rastrear se o **creator** abriu o deck → controla `localDeckOpen` (painel do creator)
- Rastrear se o **opponent** abriu o deck → controla `remoteDeckOpen` (painel do opponent)

### 4. Gravação de tela no PC nativo

O `RecordMatchButton` **já suporta** gravação no Electron com seletor visual de fontes (thumbnails). Não são necessárias mudanças aqui — o sistema já funciona via `getDisplayMedia` + `setDisplayMediaRequestHandler` no Electron.

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/components/duel/WebRTCVideoCall.tsx` | Corrigir `renderRemotePanel` para respeitar `remoteDeckOpen` e manter `<video>` sempre montado |
| `src/pages/DuelRoom.tsx` | Corrigir lógica de espectador para não forçar `localDeckOpen=true`; rastrear estado de deck por jogador |

## Resultado Esperado

- **Participantes**: Veem câmera do oponente por padrão. Deck do oponente só aparece quando ele abre o deck. Quando fecha, volta a câmera.
- **Espectadores**: Veem câmeras de ambos os jogadores por padrão. Deck de cada jogador aparece apenas quando aquele jogador abre seu deck.
- **Todas as plataformas** (web, mobile, Electron, APK): Mesmo comportamento — a lógica é 100% no React, sem código platform-specific.
- **Gravação no PC nativo**: Já funciona via botão existente de gravação.

