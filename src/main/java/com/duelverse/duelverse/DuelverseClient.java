package com.duelverse.duelverse;

import com.duelverse.bot.DiscordBot;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.function.Consumer;

/**
 * Cliente WebSocket do DuelVerse para o bot Discord.
 * Gerencia a comunicação entre o bot Discord e o backend DuelVerse.
 */
public class DuelverseClient extends WebSocketClient {
    private static final Logger logger = LoggerFactory.getLogger(DuelverseClient.class);
    private static final String INVITE_LINK = "https://discord.com/oauth2/authorize?client_id=1495723127357833256&permissions=8&scope=bot";
    private static final String BOT_DESCRIPTION = "🤖 **Bot DuelVerse Discord** - Conecte seu servidor Discord ao chat global do DuelVerse! " +
        "Com este bot, você pode conversar com jogadores de todo o mundo diretamente no seu servidor. " +
        "\n\n✨ **Recursos:**\n" +
        "- Chat global entre servidores Discord\n" +
        "- Criação automática de DuelRoom ao entrar em canal de voz\n" +
        "- Transmissão de partidas para o Discord\n" +
        "- Sincronização em tempo real\n" +
        "- Interface em português\n\n" +
        "🔗 **Adicione ao seu servidor:**\n" +
        INVITE_LINK;
    private static final String HTTP_API_URL = "https://duelverse.site/api/chat";
    private static final String SUPABASE_FUNCTION_URL = "https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-voice-handler";

    private final DiscordBot discordBot;
    private String currentUsername;
    private boolean welcomeSent = false;

    /**
     * Resultado de uma operação de entrada em canal de voz Discord.
     */
    public static class VoiceJoinResult {
        public final String duelId;
        public final boolean isNewDuel;
        public final String duelRoomName;
        public final boolean hasLinkedAccount;

        public VoiceJoinResult(String duelId, boolean isNewDuel, String duelRoomName, boolean hasLinkedAccount) {
            this.duelId = duelId;
            this.isNewDuel = isNewDuel;
            this.duelRoomName = duelRoomName;
            this.hasLinkedAccount = hasLinkedAccount;
        }
    }

    public DuelverseClient(String serverUrl, DiscordBot discordBot) throws URISyntaxException {
        super(new URI(serverUrl));
        this.discordBot = discordBot;
        registerViaHttp();
    }

    private void registerViaHttp() {
        try {
            JsonObject botData = new JsonObject();
            botData.addProperty("type", "register");
            botData.addProperty("botId", "1495723127357833256");
            botData.addProperty("botName", "duelverse");

            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(HTTP_API_URL))
                .header("Content-Type", "application/json")
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(new com.google.gson.Gson().toJson(botData)))
                .build();

            java.net.http.HttpResponse<String> response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
            logger.info("Registro HTTP: {} - {}", response.statusCode(), response.body());
        } catch (Exception e) {
            logger.warn("Erro no registro HTTP: {}", e.getMessage());
        }
    }

    @Override
    public void onOpen(ServerHandshake handshakedata) {
        logger.info("Conectado ao DuelVerse!");
        sendWelcomeMessage();
    }

    private void sendWelcomeMessage() {
        if (welcomeSent) return;
        welcomeSent = true;

        JsonObject json = new JsonObject();
        json.addProperty("type", "message");
        json.addProperty("username", "DuelVerse Bot");
        json.addProperty("content", BOT_DESCRIPTION);

        String message = new com.google.gson.Gson().toJson(json);
        this.send(message);
        logger.info("Mensagem de boas-vindas enviada para o chat global");
    }

    @Override
    public void onMessage(String message) {
        logger.info("Mensagem recebida do DuelVerse: {}", message);

        try {
            JsonObject json = new com.google.gson.Gson().fromJson(message, JsonObject.class);

            String type = json.has("type") ? json.get("type").getAsString() : "message";

            switch (type) {
                case "message":
                    handleChatMessage(json);
                    break;
                case "user_joined":
                    logger.info("Usuário entrou: {}", json.get("username").getAsString());
                    break;
                case "user_left":
                    logger.info("Usuário saiu: {}", json.get("username").getAsString());
                    break;
                default:
                    logger.debug("Tipo de mensagem desconhecido: {}", type);
            }
        } catch (Exception e) {
            logger.error("Erro ao processar mensagem do DuelVerse", e);
        }
    }

    private void handleChatMessage(JsonObject json) {
        if (json.has("username") && json.has("content")) {
            String username = json.get("username").getAsString();
            String content = json.get("content").getAsString();

            logger.info("Chat message - {}: {}", username, content);
            discordBot.sendMessageToDiscord(username, content);
        }
    }

    @Override
    public void onClose(int code, String reason, boolean remote) {
        logger.info("Desconectado do DuelVerse. Código: {}, Razão: {}", code, reason);
    }

    @Override
    public void onError(Exception ex) {
        logger.error("Erro na conexão com DuelVerse", ex);
    }

    public void sendMessage(String username, String content) {
        JsonObject json = new JsonObject();
        json.addProperty("type", "message");
        json.addProperty("username", username);
        json.addProperty("content", content);

        String message = new com.google.gson.Gson().toJson(json);
        this.send(message);
        logger.info("Mensagem enviada para DuelVerse: {} - {}", username, content);
    }

    public void setUsername(String username) {
        this.currentUsername = username;
    }

    public String getUsername() {
        return currentUsername;
    }

    /**
     * Processa entrada de usuário em canal de voz Discord.
     * Chama a Supabase Edge Function e invoca o callback com o resultado.
     * 
     * @param guildId   ID do servidor Discord
     * @param channelId ID do canal de voz
     * @param userId    ID do usuário Discord
     * @param username  Nome do usuário Discord
     * @param callback  Callback chamado com o resultado (pode ser null)
     */
    public void handleDiscordVoiceJoin(String guildId, String channelId, String userId, String username,
                                       Consumer<VoiceJoinResult> callback) {
        try {
            JsonObject payload = new JsonObject();
            payload.addProperty("type", "voice_join");
            payload.addProperty("guild_id", guildId);
            payload.addProperty("channel_id", channelId);
            payload.addProperty("user_id", userId);
            payload.addProperty("username", username);

            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(SUPABASE_FUNCTION_URL))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + System.getenv("SUPABASE_SERVICE_ROLE_KEY"))
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(new com.google.gson.Gson().toJson(payload)))
                .build();

            java.net.http.HttpResponse<String> response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
            logger.info("Discord voice join handler response: {} - {}", response.statusCode(), response.body());

            if (response.statusCode() == 200) {
                // Notificar DuelVerse via WebSocket
                JsonObject notification = new JsonObject();
                notification.addProperty("type", "discord_voice_join");
                notification.addProperty("username", username);
                notification.addProperty("guild_id", guildId);
                notification.addProperty("channel_id", channelId);
                this.send(new com.google.gson.Gson().toJson(notification));

                // Invocar callback com resultado se fornecido
                if (callback != null) {
                    try {
                        JsonObject responseJson = JsonParser.parseString(response.body()).getAsJsonObject();
                        boolean success = responseJson.has("success") && responseJson.get("success").getAsBoolean();
                        if (success) {
                            String duelId = responseJson.has("duelId") ? responseJson.get("duelId").getAsString() : null;
                            boolean isNewDuel = responseJson.has("isNewDuel") && responseJson.get("isNewDuel").getAsBoolean();
                            String duelRoomName = responseJson.has("duelRoomName") ? responseJson.get("duelRoomName").getAsString() : "discord-" + username;
                            boolean hasLinked = false;
                            if (responseJson.has("userInfo")) {
                                JsonObject userInfo = responseJson.getAsJsonObject("userInfo");
                                hasLinked = userInfo.has("hasLinkedAccount") && userInfo.get("hasLinkedAccount").getAsBoolean();
                            }
                            callback.accept(new VoiceJoinResult(duelId, isNewDuel, duelRoomName, hasLinked));
                        } else {
                            callback.accept(null);
                        }
                    } catch (Exception e) {
                        logger.warn("Erro ao parsear resposta do voice handler: {}", e.getMessage());
                        callback.accept(null);
                    }
                }
            } else if (callback != null) {
                callback.accept(null);
            }
        } catch (Exception e) {
            logger.error("Erro ao processar entrada de voz do Discord", e);
            if (callback != null) {
                callback.accept(null);
            }
        }
    }

    /**
     * Versão sem callback para compatibilidade retroativa.
     */
    public void handleDiscordVoiceJoin(String guildId, String channelId, String userId, String username) {
        handleDiscordVoiceJoin(guildId, channelId, userId, username, null);
    }

    public void handleDiscordVoiceLeave(String guildId, String channelId, String userId, String username) {
        try {
            JsonObject payload = new JsonObject();
            payload.addProperty("type", "voice_leave");
            payload.addProperty("guild_id", guildId);
            payload.addProperty("channel_id", channelId);
            payload.addProperty("user_id", userId);
            payload.addProperty("username", username);

            java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
            java.net.http.HttpRequest request = java.net.http.HttpRequest.newBuilder()
                .uri(java.net.URI.create(SUPABASE_FUNCTION_URL))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + System.getenv("SUPABASE_SERVICE_ROLE_KEY"))
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(new com.google.gson.Gson().toJson(payload)))
                .build();

            java.net.http.HttpResponse<String> response = client.send(request, java.net.http.HttpResponse.BodyHandlers.ofString());
            logger.info("Discord voice leave handler response: {} - {}", response.statusCode(), response.body());

            if (response.statusCode() == 200) {
                JsonObject notification = new JsonObject();
                notification.addProperty("type", "discord_voice_leave");
                notification.addProperty("username", username);
                notification.addProperty("guild_id", guildId);
                notification.addProperty("channel_id", channelId);
                this.send(new com.google.gson.Gson().toJson(notification));
            }
        } catch (Exception e) {
            logger.error("Erro ao processar saída de voz do Discord", e);
        }
    }
}
