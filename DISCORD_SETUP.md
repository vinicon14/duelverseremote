# Como Configurar o Discord no DuelVerse

## Para rodar o DuelVerse como Discord Activity

O app agora detecta automaticamente os parâmetros de Activity do Discord
(`frame_id` / `instance_id`) e abre uma tela leve de `/discord-activity`,
sem carregar anúncios, loaders globais ou redirecionamentos de autenticação.
Isso evita a tela branca quando o Discord abre a aplicação dentro do iframe.

No **Discord Developer Portal → Embedded App / Activity**:

1. Configure a URL pública da Activity para:
   `https://duelverse.site/discord-activity`
2. Em **URL Mappings**, mantenha o domínio público do app liberado:
   `/` → `duelverse.site`
3. Se o Discord bloquear chamadas para Supabase por CSP, adicione também:
   `/supabase` → `xxttwzewtqxvpgefggah.supabase.co`
4. Se usar o mapeamento `/supabase`, defina no frontend:
   `VITE_DISCORD_SUPABASE_MAPPING_PREFIX=/supabase`
5. Nas Edge Functions, configure:
   `DISCORD_CLIENT_ID`
   `DISCORD_CLIENT_SECRET`

O hook da Activity usa `VITE_SUPABASE_URL` para buscar
`/functions/v1/discord-activity-token`, então essa variável precisa existir no
build publicado.

## Para replicar mensagens reais do servidor Discord no Chat Global

O webhook do Discord só envia mensagens do DuelVerse para o Discord. Para o caminho inverso — mensagens digitadas por qualquer usuário no app do Discord aparecerem no Chat Global — o bot Java precisa estar online e escutando o canal configurado.

### 1. Ative a permissão no Discord Developer Portal

1. Acesse **Discord Developer Portal** > sua aplicação > **Bot**.
2. Em **Privileged Gateway Intents**, ative **Message Content Intent**.
3. Salve as alterações.

Sem essa permissão, o Discord não entrega o texto das mensagens dos usuários ao bot.

### 2. Convide o bot com permissões suficientes

Use o convite exibido no painel Admin do DuelVerse ou gere um convite com permissões para:

- View Channels
- Read Message History
- Send Messages
- Manage Webhooks

### 3. Configure o servidor pelo Admin do DuelVerse

1. Acesse **Admin** > **Discord**.
2. Clique em **Adicionar servidor**.
3. Selecione o servidor e o canal que será sincronizado.

### 4. Reinicie o bot Java

Depois de ativar o intent e configurar o canal, reinicie o `.jar` do bot.

Pronto: mensagens enviadas por qualquer usuário no canal configurado do Discord serão replicadas no Chat Global do DuelVerse.
