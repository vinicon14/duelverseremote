# Modo Duelista Imersivo — Plano de Entrega

Você pediu "tudo de uma vez", mas o escopo é equivalente a 4–6 features grandes (UI, áudio, narração, replay, espectador avançado, automações de regras, acessibilidade). Tentar entregar tudo em uma única mensagem quebraria o que já funciona (Arena Digital, WebRTC, espectador, juiz). Proponho entregar em **5 fases consecutivas**, cada uma testável e sem regressão. Posso emendar uma na outra sem te pedir confirmação entre elas, mas preciso que você aprove o plano primeiro.

## Decisões já tomadas
- **Narração**: Web Speech API (gratuita, no navegador)
- **Música**: você fornecerá os MP3; eu deixo o player pronto + bucket público `arena-music`
- **Ativação**: automática quando ambos jogadores estão com Arena Digital aberta

---

## Fase 1 — Núcleo Imersivo (base de tudo)
**Arquivos novos:** `src/components/duel/immersive/ImmersiveModeProvider.tsx`, `useImmersiveMode.ts`, `ImmersiveSettingsPanel.tsx`, `ImmersiveLPDisplay.tsx`
**Editado:** `DuelRoom.tsx`

- Detecção automática: quando `duel_participants.arena_digital_open = true` para ambos, ativa o modo (broadcast realtime).
- Provider central com estado de configurações (volumes, animações, narração, acessibilidade) persistido em `localStorage`.
- LP animado: contador rolando 8000→6500, badge flutuante "−1500" / "+500", shake no impacto, pulse vermelho < 2000 LP.
- Painel de configurações próprio (Sheet lateral) com todas as seções: Áudio, Interface, Animações, Automações, Acessibilidade.

## Fase 2 — Áudio Imersivo
**Arquivos novos:** `src/utils/immersiveAudio.ts`, `ImmersiveMusicPlayer.tsx`
**Storage:** bucket público `arena-music` com pastas `calm/`, `energetic/`, `danger/`, `epic/`

- Player de música dinâmica com crossfade entre trilhas (início → meio → perigo < 2000 LP → final/ataque direto vencedor).
- **Ducking automático**: quando o WebRTC detecta voz ativa (já existe `analyserNode`), música cai para 15% e volta gradualmente.
- SFX expandidos no `utils/sfx.ts`: dano, cura, invocação normal, especial, sincro, xyz, link, pêndulo.
- Volumes independentes (música 30% / SFX 70% / narração / voz 100%) salvos por usuário.

## Fase 3 — Narração + Efeitos Visuais
**Arquivos novos:** `src/utils/immersiveNarrator.ts` (Web Speech API), `ImmersiveSummonEffect.tsx`, `ImmersiveEventBus.tsx`

- Event bus interno: ao mover carta para zona de monstro / mudar LP / declarar ataque → dispara narração + animação.
- Animações sobrepostas ao `DuelFieldBoard` (camada absoluta z-50): brilho, partículas CSS, flash por tipo de invocação. Sem alterar a lógica do board.
- Narrador PT-BR/EN com `speechSynthesis`: configurável (idioma, voz, velocidade, frequência: tudo/só importantes/desligado).
- Frases padronizadas: "Monstro X foi invocado", "Y de dano causado", "Vitória do jogador Z".

## Fase 4 — Espectador Avançado + Histórico
**Arquivos novos:** `src/components/duel/immersive/MatchHistoryLog.tsx`, `SpectatorStatsPanel.tsx`
**DB:** tabela `duel_event_log` (duel_id, turn, player_id, action_type, payload jsonb, created_at) + RLS

- Registro de eventos do duelo (invocações, ataques, LP, efeitos) gravado em tempo real.
- Painel de histórico colapsável dentro do DuelRoom.
- Espectador vê estatísticas ao vivo (turnos, dano total, monstros no campo) sem ver mão — autorização opcional via toggle do duelista.

## Fase 5 — Tela de Resultado + Acessibilidade
**Arquivos novos:** `ImmersiveResultScreen.tsx`, `useA11y.ts`

- Tela final com vencedor, turnos, dano total, tempo de duelo, cartas mais usadas, gráfico de LP por turno (usando `duel_event_log`).
- Acessibilidade: modo daltônico (filtros CSS), fonte ampliada (escala root), alto contraste, leitor de tela em todos os botões já existentes do DuelRoom.

---

## Itens que **não** vou entregar (precisam de decisão sua depois)
- **Replay gravado com pause/avançar/retroceder**: exigiria gravar todo o estado a cada tick (~MB por partida) e um player customizado. Recomendo fazer só depois da Fase 5, como projeto separado, usando o `duel_event_log` como base.
- **Automação de invocações Sincro/Xyz/Link/Pêndulo** (tributar materiais automaticamente, validar níveis, etc.): isso é um motor de regras de Yu-Gi-Oh! completo — meses de trabalho e altíssimo risco de bug. O Modo Imersivo vai **visualizar** e **narrar** as invocações, mas o jogador continua arrastando as cartas como hoje.
- **Música dinâmica fornecida por mim**: você confirmou que vai subir os MP3.

## Detalhes técnicos
- Sem alterações em WebRTC core, regras do jogo, ou `DuelFieldBoard` lógico — apenas camadas visuais por cima.
- Migration nova só na Fase 4 (`duel_event_log` + bucket de áudio).
- Tudo opt-out: se o usuário desativar nas configurações, volta ao Arena Digital atual.
- Compatível com espectador, juiz (já corrigido), mobile e desktop.

## Próximo passo
Se aprovar este plano, começo pela **Fase 1** já na próxima mensagem e sigo emendando até a Fase 5. Cada fase entra como uma alteração isolada que você pode testar antes de continuarmos.
