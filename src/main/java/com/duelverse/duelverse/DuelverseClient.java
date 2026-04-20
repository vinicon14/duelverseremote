package com.duelverse.duelverse;

import com.duelverse.bot.DiscordBot;
import com.google.gson.JsonObject;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.handshake.ServerHandshake;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.URISyntaxException;

public class DuelverseClient extends WebSocketClient {
    private static final Logger logger = LoggerFactory.getLogger(DuelverseClient.class);
    
    private final DiscordBot discordBot;
    private String currentUsername;

    public DuelverseClient(String serverUrl, DiscordBot discordBot) throws URISyntaxException {
        super(new URI(serverUrl));
        this.discordBot = discordBot;
    }

    @Override
    public void onOpen(ServerHandshake handshakedata) {
        logger.info("Conectado ao DuelVerse!");
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
}