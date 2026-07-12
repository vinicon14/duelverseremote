# Refatoração Mobile — Duelverse como Câmera Auxiliar

## Visão geral

Mobile deixa de ser cliente de jogo e passa a ser dispositivo auxiliar de vídeo/áudio do Desktop via WebRTC, pareado por QR Code. Toda lógica de duelo permanece no Desktop.

## Escopo

### 1. Bloquear rotas de jogo no Mobile
Criar guard `DesktopOnlyRoute` (detecta mobile via `platformDetection.isMobile` + viewport). Aplicar em:
- `/duel/:id` (DuelRoom)
- `/matchmaking`, `/duels`, `/join-duel`, `/match-invite`
- `/deck-builder*`, `/genesis-deck-builder`, `/rush-duel-deck-builder`, `/dueling-book-alternativa`, `/yugioh-omega-alternativa`, `/yugioh-remote-duel`
- Botões "Criar Partida" / "Entrar em Partida" ocultos no mobile

Ao acessar no mobile → tela explicativa "Disponível apenas no Desktop" + botão "Conectar ao Computador".

### 2. Mobile mantém intactos
Login, cadastro, perfil, amigos, chat, mensagens, notificações, configurações, ranking, torneios (visualização), marketplace, histórico, video share.

### 3. Nova página `/connect` (Mobile)
- Botão principal na Home mobile: "Conectar ao Computador"
- Abre scanner QR usando `html5-qrcode` (biblioteca nova)
- Ao ler QR → conecta via WebRTC → entra em modo câmera fullscreen

### 4. Desktop — Gerar QR
- Botão "Conectar celular" na DuelRoom (e no menu do usuário)
- Modal exibe QR Code (usar `qrcode.react`) contendo `session_id` + token temporário
- Aguarda pareamento; ao conectar, o stream do celular aparece como fonte de vídeo/áudio disponível no vídeo da partida (substituindo/complementando webcam local)

### 5. Sinalização & WebRTC
- Tabela nova `phone_pair_sessions`: `id, host_user_id, token, status, created_at, expires_at` (TTL 5 min). RLS: host lê/atualiza próprio; anon insere via edge function ao escanear.
- Canal Realtime Supabase para trocar SDP offer/answer + ICE candidates (`phone-pair:{session_id}`)
- Servidores STUN públicos + TURN OpenRelay (já usado no projeto)
- Ao conectar: mobile envia stream (getUserMedia video+audio); desktop recebe MediaStream e injeta no `RTCPeerConnection` da partida como track substituto

### 6. Modo Câmera (Mobile)
Tela minimalista fullscreen:
- Preview da própria câmera (mirror off)
- Controles: liga/desliga câmera, alternar frontal/traseira (`facingMode`), liga/desliga mic
- Badges: status conexão (verde/amarelo/vermelho), bateria (`navigator.getBattery`), qualidade sinal (via `RTCStatsReport`)
- Wake lock (`navigator.wakeLock`) para manter tela ligada
- Botão "Desconectar" volta ao app normal
- Sem qualquer HUD/carta/campo

### 7. Integração com vídeo da partida no Desktop
- Hook `usePhoneCameraStream` expõe o MediaStream vindo do celular
- No componente de vídeo da DuelRoom, quando phone conectado, usar esse stream em vez de `getUserMedia` local
- Toggle "Usar câmera do celular" no painel de controles de vídeo

## Detalhes técnicos

### Novos arquivos
- `src/components/RequireDesktop.tsx` — guard
- `src/pages/mobile/ConnectComputer.tsx` — scanner QR + fluxo pareamento
- `src/pages/mobile/PhoneCameraMode.tsx` — modo câmera fullscreen
- `src/components/desktop/PhonePairModal.tsx` — gera QR + aguarda peer
- `src/hooks/usePhonePairing.ts` — lógica WebRTC + realtime signaling (host)
- `src/hooks/usePhoneCameraStream.ts` — expõe stream recebido
- `supabase/migrations/*` — tabela `phone_pair_sessions` + RLS + GRANT
- `supabase/functions/phone-pair-claim/index.ts` — edge function para mobile reclamar sessão via token

### Arquivos alterados
- `src/App.tsx` — envolver rotas de jogo com `RequireDesktop`
- `src/components/Navbar.tsx` / Home mobile — esconder botões de jogo, exibir "Conectar ao Computador"
- `src/pages/DuelRoom.tsx` — botão "Conectar celular" + integração stream
- Componente de vídeo WebRTC da DuelRoom — aceitar stream externo

### Dependências novas
- `qrcode.react` (gerar QR)
- `html5-qrcode` (ler QR)

### Fora de escopo
- Não altero lógica de jogo, deck builder, matchmaking do lado desktop
- Não removo código de duelo (apenas escondido/bloqueado no mobile)
- PWA/Capacitor manifest permanece; APK continua funcional mas sem acesso ao jogo

## Fluxo resumido

```text
Desktop                         Mobile
--------                        ------
[Conectar celular]
  cria sessão + token
  mostra QR
                                [Conectar ao Computador]
                                escaneia QR
                                POST phone-pair-claim (token)
  <-- realtime: peer joined
  cria RTCPeerConnection
  envia offer via realtime -->
                                cria PC, getUserMedia
                                envia answer + tracks -->
  recebe MediaStream
  usa como webcam da partida
                                exibe modo câmera fullscreen
```

## Confirmações

Antes de codar, confirme:
1. OK usar `html5-qrcode` e `qrcode.react` como novas deps?
2. Bloqueio mobile deve ser hard (rota redireciona) ou soft (só esconder botões)?
3. No Desktop, o stream do celular substitui a webcam ou é uma segunda fonte selecionável?