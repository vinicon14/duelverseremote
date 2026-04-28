package com.duelverse.admin;

import com.duelverse.admin.DiscordServerManager.ServerInfo;
import com.duelverse.bot.DiscordBot;
import com.duelverse.duelverse.DuelverseClient;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class DiscordIntegration {
    private static final Logger logger = LoggerFactory.getLogger(DiscordIntegration.class);
    private static final String DUELVERSE_API_URL = "https://duelverse.site/chat";
    private static final String INVITE_LINK = "https://discord.com/oauth2/authorize?client_id=1495723127357833256&permissions=8&scope=bot";
    private static final String BOT_ID = "1495723127357833256";
    private static final String BOT_NAME = "duelverse";

    private final DiscordBot discordBot;
    private final DiscordServerManager serverManager;
    private final DuelverseClient duelverseClient;
    private final HttpClient httpClient;
    private String duelverseUrl = "wss://duelverse.site";

    public DiscordIntegration(DiscordBot discordBot, DiscordServerManager serverManager, DuelverseClient duelverseClient) {
        this.discordBot = discordBot;
        this.serverManager = serverManager;
        this.duelverseClient = duelverseClient;
        this.httpClient = HttpClient.newHttpClient();
    }

    public void start() {
        logger.info("Iniciando integração com DuelVerse...");
        registerBotOnDuelverse();
    }

    private void registerBotOnDuelverse() {
        try {
            JsonObject botData = new JsonObject();
            botData.addProperty("botId", BOT_ID);
            botData.addProperty("botName", BOT_NAME);
            botData.addProperty("inviteLink", INVITE_LINK);
            botData.addProperty("duelverseUrl", duelverseUrl);

            JsonArray servers = new JsonArray();
            for (ServerInfo server : serverManager.getAvailableServers()) {
                JsonObject serverObj = new JsonObject();
                serverObj.addProperty("id", server.getId());
                serverObj.addProperty("name", server.getName());
                serverObj.addProperty("enabled", server.isEnabled());
                serverObj.addProperty("channelId", server.getChannelId());
                servers.add(serverObj);
            }
            botData.add("servers", servers);

            String json = new Gson().toJson(botData);
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(DUELVERSE_API_URL + "/discord-bot/register"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            
            if (response.statusCode() == 200 || response.statusCode() == 201) {
                logger.info("Bot registrado no DuelVerse com sucesso!");
            } else {
                logger.warn("Erro ao registrar bot no DuelVerse: {} - {}", response.statusCode(), response.body());
            }
        } catch (Exception e) {
            logger.error("Erro ao registrar bot no DuelVerse", e);
        }
    }

    public void updateServerStatus(String serverId, boolean enabled, String channelId) {
        try {
            JsonObject data = new JsonObject();
            data.addProperty("botId", BOT_ID);
            data.addProperty("serverId", serverId);
            data.addProperty("enabled", enabled);
            if (channelId != null) {
                data.addProperty("channelId", channelId);
            }

            String json = new Gson().toJson(data);
            
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(DUELVERSE_API_URL + "/discord-bot/server-status"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

            httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (Exception e) {
            logger.error("Erro ao atualizar status do servidor", e);
        }
    }

    public JsonObject getBotStatus() {
        JsonObject response = new JsonObject();
        response.addProperty("botId", BOT_ID);
        response.addProperty("botName", BOT_NAME);
        response.addProperty("inviteLink", INVITE_LINK);
        response.addProperty("duelverseUrl", duelverseUrl);
        response.addProperty("status", discordBot != null ? "online" : "offline");

        JsonArray servers = new JsonArray();
        for (ServerInfo server : serverManager.getAvailableServers()) {
            JsonObject serverObj = new JsonObject();
            serverObj.addProperty("id", server.getId());
            serverObj.addProperty("name", server.getName());
            serverObj.addProperty("enabled", server.isEnabled());
            serverObj.addProperty("channelId", server.getChannelId());
            servers.add(serverObj);
        }
        response.add("servers", servers);

        return response;
    }

    public boolean enableServerForDiscord(String serverId, String channelId) {
        boolean success = serverManager.enableServer(serverId, channelId);
        if (success) {
            updateServerStatus(serverId, true, channelId);
        }
        return success;
    }

    public boolean disableServerForDiscord(String serverId) {
        boolean success = serverManager.disableServer(serverId);
        if (success) {
            updateServerStatus(serverId, false, null);
        }
        return success;
    }

    public void syncWithDuelverse() {
        registerBotOnDuelverse();
    }
}
