# Como Configurar o Discord no DuelVerse

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