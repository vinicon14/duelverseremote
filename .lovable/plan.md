
# AI Solo Mode - DuelVerse (Yu-Gi-Oh!)

## Fase 1: Infraestrutura Backend
- **Edge Function `ai-duel-engine`**: Recebe estado do jogo, deck da IA, histórico de ações e retorna decisão + mensagem de chat
- Usa Lovable AI (Gemini) com system prompt especializado em regras de Yu-Gi-Oh!
- Retorna JSON estruturado: `{ action, card, zone, chatMessage }`

## Fase 2: UI de Ativação
- Botão "Duelar contra IA" no `FloatingOpponentViewer` / `OpponentFieldViewer` (só aparece quando jogador está sozinho na sala)
- Modal de seleção de deck da IA: digitar nome, importar decklist, ou deck aleatório
- Estado `aiMode` no contexto do duelo

## Fase 3: Motor de Decisão da IA
- A IA analisa: campo atual, mão, cemitério, deck extra, LP de ambos
- Toma decisões: Normal Summon, Special Summon, ativar efeito, setar, atacar, passar turno
- Executa as ações no campo digital automaticamente (manipulando o estado do oponente)

## Fase 4: Sistema de Chat com IA
- Chat integrado no visualizador de deck do oponente
- IA comenta suas jogadas, reage a ações do jogador
- Streaming de respostas para naturalidade

## Fase 5: Processamento de Áudio (Speech-to-Text)
- Captura áudio do microfone do jogador
- Usa Web Speech API (nativa do browser) para transcrição
- Envia texto transcrito para a IA como contexto adicional

## Limitações Reconhecidas
- Visão computacional (câmera → cartas físicas) NÃO é viável neste ambiente - a IA lê o estado digital diretamente
- A IA não terá conhecimento perfeito de todos os combos, mas será guiada por um prompt robusto com regras do YGO

## Ordem de Implementação
1. Edge Function do motor de IA
2. UI de ativação + seleção de deck
3. Loop de jogo automatizado
4. Chat integrado
5. Speech-to-text
