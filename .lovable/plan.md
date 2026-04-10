

# Plano: Substituir Daily.co por WebRTC Nativo

## Visao Geral

Remover completamente a dependencia do Daily.co e implementar chamadas de video peer-to-peer usando **WebRTC nativo** com sinalização via **Supabase Realtime** (broadcast). Para duelos 1v1 isso e ideal — conexao direta entre os dois jogadores, sem servidor de midia intermediario.

## Vantagens

- Zero custo (Daily.co tem limites no plano gratis)
- Sem erros de "Duplicate DailyIframe instances"
- Controle total do layout (cada video e um `<video>` element que voce posiciona como quiser)
- Resolve automaticamente o problema do deck overlay — basta esconder/mostrar o `<video>` local
- Bundle menor (remove `@daily-co/daily-js` ~3MB)

## Arquitetura

```text
Jogador A                    Supabase Realtime                    Jogador B
   |                         (broadcast channel)                      |
   |-- offer SDP ----------------->|--------------------------------->|
   |<----------------------------------|<---------- answer SDP -------|
   |-- ICE candidate ------------>|--------------------------------->|
   |<----------------------------------|<------- ICE candidate -------|
   |                                                                  |
   |<=================== WebRTC P2P Media Stream ===================>|
```

## Etapas de Implementacao

### 1. Criar componente `WebRTCVideoCall`
- Novo arquivo `src/components/duel/WebRTCVideoCall.tsx`
- Gerencia `RTCPeerConnection` com servidores STUN publicos (Google)
- Dois elementos `<video>`: local (meu) e remoto (oponente)
- Botoes de mute/camera
- Props: `duelId`, `userId`, `isCreator`

### 2. Sinalizacao via Supabase Realtime
- Canal broadcast `webrtc-signal-{duelId}`
- Eventos: `offer`, `answer`, `ice-candidate`
- O criador do duelo envia o `offer`, o oponente responde com `answer`

### 3. Atualizar `DuelRoom.tsx`
- Remover import de `DailyPrebuiltFrame`
- Remover chamada a edge function `create-daily-room`
- Substituir por `<WebRTCVideoCall>` passando `duelId`, `userId`, `isCreator`
- O overlay de deck agora esconde diretamente o `<video>` local (controle total)

### 4. Limpar codigo Daily.co
- Deletar `src/components/duel/DailyPrebuiltFrame.tsx`
- Deletar `src/components/duel/MultiDeviceVideoCall.tsx`
- Remover `@daily-co/daily-js` do `package.json`
- Remover edge function `create-daily-room` (e config do `supabase/config.toml`)
- Reduzir `maximumFileSizeToCacheInBytes` no vite.config.ts (bundle fica menor)

### 5. Adaptar overlay de deck
- Com WebRTC nativo, cada video e um elemento separado
- O deck do jogador substitui o `<video>` local (sem hack de "metade da tela")
- Quando o oponente abre o deck, broadcast via canal existente `deck-toggle` e o `<video>` remoto e substituido pelo viewer do oponente

## Limitacao

- WebRTC P2P funciona para 1v1 (ate ~4 pessoas). Para salas maiores (espectadores, juizes) seria necessario um SFU. Duelos com juiz (3 pessoas) ainda funcionam com P2P mesh.

## Arquivos Afetados

| Acao | Arquivo |
|------|---------|
| Criar | `src/components/duel/WebRTCVideoCall.tsx` |
| Editar | `src/pages/DuelRoom.tsx` |
| Editar | `vite.config.ts` |
| Editar | `package.json` (remover daily-js) |
| Editar | `supabase/config.toml` |
| Deletar | `src/components/duel/DailyPrebuiltFrame.tsx` |
| Deletar | `src/components/duel/MultiDeviceVideoCall.tsx` |
| Deletar | `supabase/functions/create-daily-room/index.ts` |

