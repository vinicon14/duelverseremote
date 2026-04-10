
Revisei o histórico desta conversa e os arquivos atuais. O problema não é só um bug isolado: hoje a DuelRoom mistura 3 bloqueadores de anúncio, entra como jogador por inferência quando deveria poder entrar como espectador, pede permissão cedo demais no nativo, mostra botões de gravação errados por plataforma e ainda depende de ordenação instável dos peers no WebRTC. Isso explica a tela preta, os anúncios reaparecendo, o espectador virar membro sem querer e o botão do PC nativo não ser confiável.

Plano

1. Blindar a DuelRoom contra Monetag em todas as versões
- Remover de vez qualquer injeção de Monetag na rota `/duel/:id`.
- Fazer limpeza imediata ao entrar na DuelRoom, inclusive de scripts/iframes já injetados antes da troca de rota.
- Trocar a limpeza agressiva por uma limpeza segura: nunca tocar no `#root`, nunca remover portais legítimos da UI, nunca apagar elementos só por z-index alto sem assinatura real de anúncio.
- Consolidar o bloqueio para não deixar `ConditionalMonetagLoader`, `NoMonetagAds` e `ProAdCleaner` brigando entre si.

2. Corrigir o fluxo de entrada: jogador, juiz e espectador
- Parar de transformar qualquer visitante em jogador automaticamente em `fetchDuel`.
- Criar modo explícito de entrada (`join`, `judge`, `spectate`) para que:
  - jogador entre na vaga,
  - juiz observe sem ocupar vaga,
  - espectador observe sem virar membro da room.
- Garantir que espectador/juiz não alterem `started_at`, `status`, timer nem vagas da partida.

3. Fechar o modo espectador receive-only de verdade
- No espectador: nunca chamar `getUserMedia`, nunca enumerar dispositivos, nunca mostrar controles de mic/câmera/zoom/config.
- Manter apenas os controles permitidos na tela: gravar e sair.
- Ordenar os vídeos por papel real da partida (creator/opponent/etc.), e não pela ordem em que os peers chegam, para o espectador sempre ver e ouvir os jogadores corretos.
- Revalidar a regra “câmera por padrão, deck só quando abrir, câmera volta quando fechar” sem regressão.

4. Tornar mídia e permissões robustas em web, mobile e nativo
- Tirar pedidos prematuros de câmera/microfone do fluxo global quando o usuário só está assistindo.
- Revisar `NativePermissionPrompt` e o Android nativo para pedir permissão sob demanda, não no login/abertura do app.
- Adicionar estados visíveis no WebRTC para evitar painel preto silencioso: aguardando stream, permissão negada, dispositivo indisponível, autoplay de áudio bloqueado, etc.
- Garantir fallback de áudio/vídeo no mobile quando o navegador ou webview impõe restrições.

5. Corrigir de vez a gravação do PC nativo
- Mostrar somente o botão correto no Electron: o botão nativo do PC.
- Ocultar o gravador web genérico no Electron para o usuário não clicar no botão errado.
- Auditar e corrigir o processo principal do Electron, porque hoje o arquivo indica problema no handler de sincronização de autenticação e isso precisa ficar consistente junto com captura e salvamento local.
- Validar seleção de fonte, captura, stop e salvamento local do `.webm`.

6. Estabilizar as shells nativas e cache
- Revisar o carregamento remoto do Electron e Android para evitar versão antiga em cache.
- Adicionar estratégia clara de atualização/limpeza para que a DuelRoom carregue a versão nova no site, no APK e no PC nativo.
- Garantir que a room não dependa de estado velho do service worker/webview para abrir.

7. Teste completo depois da implementação
- Web desktop: entrar como jogador e como espectador.
- Site mobile: abrir room, ver vídeos/áudio, sem tela preta.
- PC nativo: abrir room, gravar com o botão nativo, salvar arquivo local.
- App mobile nativo: abrir room sem anúncios/tela preta.
- Confirmar: sem Monetag na DuelRoom, espectador sem controles de participante, câmera/deck corretos, sem prompts indevidos, sem regressões.

Detalhes técnicos
- Arquivos centrais: `src/pages/DuelRoom.tsx`, `src/components/duel/WebRTCVideoCall.tsx`, `src/components/ConditionalMonetagLoader.tsx`, `src/components/NoMonetagAds.tsx`, `src/components/ProAdCleaner.tsx`, `src/components/RecordMatchButton.tsx`, `src/components/ElectronRecordButton.tsx`, `src/components/NativePermissionPrompt.tsx`, `electron/main.cjs`, `android/app/src/main/java/com/duelverse/app/MainActivity.java`.
- Pontos críticos já encontrados:
  - a rota de duelo é “excluída” da injeção de anúncios, mas não força a remoção dos anúncios já injetados;
  - há múltiplos bloqueadores manipulando `window.open` e o DOM ao mesmo tempo;
  - `fetchDuel` ainda tenta preencher vaga aberta automaticamente;
  - o espectador atual depende de `remotePeerIds[0]` / `[1]`, o que não é ordem confiável;
  - o arquivo `electron/main.cjs` precisa de correção estrutural no fluxo de auth IPC antes de validar o app nativo do PC.

Quando você aprovar, eu implemento esse pacote completo e faço a validação cruzada das versões em vez de continuar aplicando correções parciais.