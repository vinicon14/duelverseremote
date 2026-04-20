# Como Configurar o Webhook do Discord

## Para receber mensagens do Discord no Chat Global do DuelVerse:

### 1. Obtenha a URL do Webhook do DuelVerse:
```
https://seu-projeto.supabase.co/functions/v1/discord-bridge
```

*(Nota: Substitua "seu-projeto" pelo nome do seu projeto Supabase)*

### 2. Configure o Webhook no Discord:

1. Abra o Discord e vá para o servidor
2. Vá em **Configurações do Servidor** > **Integrações**
3. Clique em **Webhooks**
4. Clique em **Novo Webhook**
5. Escolha o canal onde as mensagens serão recebidas
6. No campo "URL do webhook", cole a URL do passo 1
7. Clique em **Salvar** e **Copiar URL do Webhook**

### 3. Adicione o Webhook no Admin do DuelVerse:

1. Acesse **Admin** > **Discord**
2. Preencha os dados do servidor:
   - **Server ID**: ID do seu servidor Discord
   - **Channel ID**: ID do canal
   - **Webhook URL**: Cole a URL do webhook que você copiou no passo 2
3. Clique em **Adicionar**

Pronto! Agora as mensagens enviadas no Discord aparecerão no Chat Global do DuelVerse!