# Primeiro incremento de aquisição e ativação

## Objetivo
Criar uma landing pública e enxuta em `/comece`, alinhada ao DuelVerse atual, para levar visitantes de campanhas ao cadastro e aos torneios sem alterar fluxos existentes.

## O que será feito
- Adicionar a rota pública `/comece` com:
  - título “Seu próximo duelo começa aqui”;
  - explicação objetiva de Remote Duel com cards físicos e câmera;
  - três passos reais, deixando claro que o duelo e o matchmaking são feitos no computador;
  - menção à câmera auxiliar do celular via QR, já confirmada no produto;
  - FAQ sobre equipamento e primeiro duelo;
  - ações para cadastro/login, torneios existentes e planos Pro existentes, sem preços ou promessas novas.
- Adicionar um acesso discreto “Como começar” na página pública inicial, sem redesenhar o restante.
- Preservar somente `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e `utm_term` nos links internos da nova página até autenticação, torneios e Pro, limitando tamanho e caracteres.
- Reutilizar o visual e os controles existentes, incluindo a marca e o domínio oficial `duelverse.site`.

## Medição
- O projeto carrega Google Analytics, mas a leitura inicial não confirmou uma camada de consentimento nem uma API de eventos reutilizável.
- Não será criado rastreador, banco ou painel. Eventos de visualização e clique só serão adicionados se a investigação em andamento confirmar consentimento e um padrão existente seguro; caso contrário, a lacuna será documentada.

## Verificação
- Validar a nova página em desktop e celular.
- Conferir destinos dos links, preservação e filtragem das UTMs, foco por teclado, títulos, landmarks, nomes acessíveis e ausência de overflow.
- Conferir o resultado da compilação automática e erros do navegador.
- Não publicar.

## Limites
- Sem mudanças em cobrança, autenticação, planos, banco, permissões, partidas ou outros recursos.
- Não será criado commit diretamente, pois o ambiente gerencia o histórico do projeto; será informado o estado entregue no preview.
