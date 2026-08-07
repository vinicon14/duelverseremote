# Melhorias do Duelverse — 10 frentes

Escopo grande. Proposta de execução em 4 blocos, na ordem abaixo. Cada bloco é entregue e testável antes do próximo.

## Bloco 1 — Espectador estável (prioridade alta)
- Interface própria de espectador na sala de duelo: grid fixo com dois painéis (Duelista 1 / Duelista 2), placar/LP, cronômetro e chat de espectador. Sem controles de câmera, mic, deck ou ações de jogo.
- Entrada garantida como observador: nenhuma captura de mídia local, nenhum slot de jogador ocupado, nenhuma escrita em `players`/`live_duels`.
- Negociação WebRTC determinística: o espectador é sempre o ofertante `recvonly`, uma conexão por duelista, com reintento periódico enquanto qualquer painel estiver sem faixa de vídeo ativa.
- Painéis vinculados aos IDs oficiais do duelo (criador = slot 1), evitando duplicação ou troca de slots.

## Bloco 2 — Marketplace + Planos + Pedidos
- Correção da compra (digital e físico) via RPC atômica de compra, com mensagens de erro claras.
- Página única: Plano PRO no topo, produtos abaixo, filtros "Duelverse" / "Terceiros" / categoria.
- Checkout de produto físico exige telefone, CEP e endereço completo, com botão "Usar localização atual" (geolocalização + preenchimento automático). Produto digital não pede endereço.
- Seção "Meus Pedidos" no perfil: lista de pedidos com status (Pendente, Em preparação, Enviado, Entregue, Cancelado) e código de rastreio quando existir.

## Bloco 3 — Administração
- Botão "Resetar Ranqueada" visível somente para administradores (aba no painel admin), com confirmação, zerando pontos de temporada.
- Painel de métricas: usuários registrados, ativos por dia, novos cadastros, partidas totais/ranqueadas/casuais, vendas, receita e crescimento ao longo do tempo.
- Página admin de anúncios Monetag: campo de script e liga/desliga. Remoção do AdsTerra.

## Bloco 4 — Experiência do usuário
- Anúncio Monetag somente no fluxo "Assistir anúncio" para recompensas. Nenhum banner espalhado.
- Indicador de mensagens não lidas na lista de amigos e no chat, some ao abrir a conversa.
- Alteração de nickname por 20 DuelCoins, com confirmação, bloqueio de duplicados e propagação para todo o sistema.

## Notas técnicas
- Alterações de banco necessárias: coluna de endereço/telefone nos pedidos, tabela/coluna de configuração de anúncios, função administrativa de reset de ranking, funções de agregação para métricas, política de leitura de mensagens não lidas.
- Todas as novas tabelas e funções recebem RLS e GRANTs; ações administrativas validadas via `has_role`.
- Componentes novos ficam isolados por domínio (espectador, loja, admin) para facilitar expansão.

## Confirmação
Se preferir outra ordem (por exemplo, Marketplace antes do espectador), é só dizer.
