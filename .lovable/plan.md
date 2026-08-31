# Corrigir anúncios Monetag

## Objetivo
Fazer o anúncio recompensado carregar de verdade, sem conceder recompensa quando apenas uma tag de Push estiver configurada.

## Implementação
- Separar e validar tags de anúncio recompensado e tags de Push.
- Impedir que uma tag `tag.min.js?z=...` de Push seja interpretada como SDK recompensado.
- Remover o fallback visual que simulava conclusão sem exibir anúncio real; mostrar erro de configuração acionável.
- Melhorar o painel administrativo para detectar a configuração incorreta e orientar o campo certo.
- Manter os bloqueadores globais, mas preservar elementos do Monetag durante todo o ciclo de um anúncio solicitado pelo usuário.
- Validar tipagem e o build do preview.

## Detalhes técnicos
A configuração atual mistura uma tag de In-Page Push no campo de script recompensado. O fluxo deve aceitar somente scripts que exponham uma função `show_<zone>` para recompensas; Push continuará isolado no provedor de notificações.
