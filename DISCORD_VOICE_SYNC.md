# Discord Voice ↔ DuelVerse Auto-Sync

Quando alguém entra em um canal de voz do Discord onde o bot do DuelVerse está
presente, uma `DuelRoom` é criada automaticamente e os participantes da call
aparecem dentro dessa sala em tempo real.

## ⚠️ O que é possível e o que NÃO é

**Possível** (implementado):
- ✅ Detectar entrada/saída em canais de voz (`VOICE_STATE_UPDATE`)
- ✅ Auto-criar uma DuelRoom para cada canal de voz com atividade
- ✅ Mostrar dentro do DuelVerse a lista de quem está na call (avatares + nomes)
- ✅ Vincular automaticamente ao usuário DuelVerse se o Discord estiver ligado via OAuth
- ✅ Fechar a sala quando todos saem da call

**Impossível** (limitação dura da API do Discord):
- ❌ O bot **não pode capturar** vídeo/áudio dos usuários no Discord
- ❌ O bot **não pode transmitir** vídeo/tela para uma call do Discord
- Áudio/vídeo continua acontecendo dentro do cliente Discord. O DuelVerse
  apenas espelha o **estado** (quem está na call, qual canal, qual servidor).

Bibliotecas não-oficiais que tentam contornar isso violam o ToS do Discord
e resultam em ban. Não usamos.

## Configuração do bot Java

Adicione duas variáveis de ambiente antes de subir o `.jar`:

```bash
export DUELVERSE_BOT_BRIDGE_SECRET="<o mesmo secret salvo no Lovable Cloud>"
# Opcional — só se quiser apontar para outro ambiente:
export DUELVERSE_VOICE_EVENTS_URL="https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-voice-events"
```

O `DUELVERSE_BOT_BRIDGE_SECRET` é o segredo compartilhado que autoriza o bot a
chamar a edge function `discord-voice-events`. Foi gerado pelo Lovable Cloud e
deve ser copiado exatamente.

## Permissões e intents necessários

No **Discord Developer Portal → Bot**, ative:
- ✅ Server Members Intent (já era necessário)
- ✅ Message Content Intent (já era necessário)
- ✅ **Presence Intent** (não obrigatório, mas recomendado)

O intent `GUILD_VOICE_STATES` é não-privilegiado e já é solicitado pelo código.

Permissões do convite do bot devem incluir:
- View Channels
- Connect (para o bot ver quem está nos canais de voz)

## Como funciona internamente

1. Usuário entra em um canal de voz onde o bot está → JDA dispara
   `GuildVoiceUpdateEvent`
2. `VoiceStateListener` faz POST em `discord-voice-events` com:
   ```json
   {
     "event": "join",
     "guild_id": "...", "guild_name": "...",
     "channel_id": "...", "channel_name": "...",
     "discord_user_id": "...", "discord_username": "...",
     "discord_avatar_url": "...",
     "is_bot": false
   }
   ```
3. A edge function:
   - Procura ou cria um registro em `discord_voice_rooms`
   - Se ainda não existe `duel_id` e o usuário tem Discord vinculado, cria
     uma `live_duels` com `room_name = "Discord: #<canal>"`, `is_ranked=false`
   - Insere o usuário em `discord_voice_participants`
4. Saída do canal → mesmo fluxo com `event: "leave"`. Quando o último sai,
   a sala é marcada como `is_active=false` e o duelo (se ainda estava
   `waiting`) é finalizado.
5. A UI da `DuelRoom` (componente `DiscordVoiceRoster`) escuta as duas tabelas
   via Realtime e exibe o roster ao vivo.

## Limitação conhecida

Se o **primeiro** a entrar na call não tiver Discord vinculado a uma conta
DuelVerse, a `live_duels` ainda não pode ser criada (a tabela exige
`creator_id NOT NULL`). Nesse caso:
- O registro em `discord_voice_rooms` é criado mesmo assim
- O `duel_id` fica `NULL`
- Assim que **qualquer participante vinculado** entrar (ou na próxima
  reentrada), o `duel_id` é preenchido retroativamente

Para forçar o gate de "só usuários com Discord vinculado", basta remover
o bloco `if (creatorId)` em `handleJoin` e responder 200 sem criar a sala.
