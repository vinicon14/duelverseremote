# Ajustes: notificação de juiz, espectador por transmissão, criação de salas e Lobby de Torneio

## 1. Notificação de juiz abre na mesma aba
Hoje, ao tocar na notificação, o site só reaproveita uma aba se o endereço dela já for exatamente o da chamada; senão abre outra aba do DuelVerse.
- Se já houver qualquer aba do DuelVerse aberta: focar nela e levá-la direto para a página da chamada (painel do juiz / sala do duelo).
- Só abrir aba nova quando não existir nenhuma aberta.
- Vale para todas as notificações que usam link (juiz, torneio, chat), não só a de juiz.

## 2. Espectador assiste por transmissão (sem ligar para as câmeras)
Hoje cada espectador cria uma conexão direta com cada jogador, o que pesa para os jogadores e trava com muitos espectadores.
Nova lógica:
- Só os jogadores se conectam entre si (como já é).
- Um dos jogadores (o dono da sala) "transmite" a mesa: junta as duas câmeras e o áudio numa única imagem lado a lado e envia essa transmissão.
- Espectadores apenas recebem essa transmissão: nunca enviam câmera/mic, e entrar/sair não afeta os jogadores.
- Se o transmissor cair, a transmissão passa automaticamente para o outro jogador.
- LP/placar, chat e contador de espectadores continuam iguais.
- Observação: sem servidor de mídia próprio, a transmissão sai do aparelho do dono da sala; com muitos espectadores (>10) o envio pode ficar pesado. Um servidor de transmissão dedicado seria o próximo passo, se necessário.

## 3. Erro de permissão ao criar sala de duelo
Achado do monitoramento: 7 falhas "permissão negada" ao criar salas (Duelos, desafio de amigo, desafio de torneio, PRO). O sistema só deixa criar a sala se o criador for quem está logado; as telas usam um ID de usuário guardado em memória, que fica desatualizado quando a sessão expira.
- Antes de criar a sala, confirmar/renovar a sessão e usar o ID do usuário atual (não o guardado).
- Se a sessão acabou, mostrar "Sua sessão expirou, entre novamente" e levar ao login, voltando depois.
- Aplicar nas 5 telas que criam salas, com uma função única compartilhada.
- Conferir também a criação de sala pelo Discord (deve usar acesso de servidor).
- Nenhuma regra de acesso do banco é afrouxada.

## 4. Lobby Inteligente de Torneios (arquivo enviado)
Funcionalidade grande; entra em fase própria depois dos itens 1–3:
- Botão "Entrar no Lobby" quando o torneio começa; lobby único e privado por torneio (acesso só para participantes autorizados, sem senha utilizável).
- Organizador entra como administrador (chat, câmera, pausar/continuar cronômetro), sem contar como jogador.
- Contador "Jogadores presentes 7/8"; contagem de 3:00 só começa quando todos os necessários da rodada estão no lobby; pausa preserva o tempo.
- Ao zerar: pareamentos, criação automática das "Mesa 1, 2..." (salas de duelo normais) e envio dos jogadores; quem está na mesa deixa de contar no lobby.
- Resultado pelo sistema atual; vencedores (mata-mata) ou todos (suíço) voltam ao lobby; eliminados saem.
- BYE: fica no lobby; avança no mata-mata; ganha pontos de vitória no suíço, sem gerar partida.
- Repete até o fim do torneio.

## Detalhes técnicos
- `public/push-sw.js`: no fallback de `notificationclick`, usar o primeiro `WindowClient` → `client.focus()` + `client.navigate(url)` (ou `postMessage({type:'NAVIGATE'})` tratado no app com `useNavigate`); `openWindow` só sem clientes.
- `WebRTCVideoCall.tsx`: transmissor compõe as trilhas em `<canvas>` (`captureStream(30)`) + `AudioContext` mixando áudios; espectadores recebem 1 `RTCPeerConnection` recvonly só do transmissor; eleição do transmissor por presença (host, fallback opponent); remover a malha espectador↔cada jogador.
- `src/utils/createDuelRoom.ts`: `supabase.auth.getUser()` (refresh se preciso) → `creator_id = user.id` → insert; usado em Duels, Friends, TournamentDetail, MyTournaments, ProDuels. Revisar `discord-voice-events`. Depois resolver o finding como fixed.
- Lobby: novas tabelas (lobby por torneio, presença, estado do cronômetro, mesas por rodada) com RLS por participante/organizador, RPCs SECURITY DEFINER para entrar, pausar, iniciar rodada e gerar mesas; reaproveita `usePartyMesh`, `generate_next_round` e o fluxo de resultados.
