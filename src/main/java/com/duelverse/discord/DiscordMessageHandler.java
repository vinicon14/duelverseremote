package com.duelverse.discord;

import com.duelverse.duelverse.DuelverseClient;
import com.google.gson.JsonObject;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public class DiscordMessageHandler {
    private static final Logger logger = LoggerFactory.getLogger(DiscordMessageHandler.class);

    private static final String BRIDGE_WEBHOOK_URL =
        "https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-bridge/webhook";

    private final DuelverseClient duelverseClient;
    private final HttpClient httpClient;

    public DiscordMessageHandler(DuelverseClient duelverseClient) {
        this.duelverseClient = duelverseClient;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    }

    /**
     * Encaminha a mensagem do Discord para a bridge no Supabase.
     * O author.id é essencial: a bridge usa esse ID para localizar a conta DuelVerse vinculada
     * (tabela discord_links) e postar como o usuário real no chat global.
     */
    public void handleDiscordMessage(String authorId, String username, String avatarUrl, String content) {
        if (authorId == null || authorId.isEmpty() || content == null || content.isEmpty()) {
            logger.debug("Mensagem ignorada (sem authorId ou content)");
            return;
        }

        JsonObject author = new JsonObject();
        author.addProperty("id", authorId);
        author.addProperty("username", username != null ? username : "Discord User");
        author.addProperty("bot", false);
        if (avatarUrl != null && !avatarUrl.isEmpty()) {
            author.addProperty("avatar_url", avatarUrl);
        }

        JsonObject payload = new JsonObject();
        payload.add("author", author);
        payload.addProperty("content", content);
        // Top-level aliases for compatibility
        payload.addProperty("discord_user_id", authorId);
        payload.addProperty("username", username != null ? username : "Discord User");
        if (avatarUrl != null && !avatarUrl.isEmpty()) {
            payload.addProperty("avatar_url", avatarUrl);
        }

        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(BRIDGE_WEBHOOK_URL))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            logger.info("Bridge POST [{}] author={} username={}: {}",
                response.statusCode(), authorId, username, response.body());
        } catch (Exception e) {
            logger.error("Erro ao enviar mensagem para a bridge DuelVerse", e);
        }
    }

    /** Compat: chamada antiga sem authorId (mantida por segurança). */
    public void handleDiscordMessage(String username, String content) {
        logger.warn("handleDiscordMessage chamado SEM authorId — mensagem não será replicada (sem vínculo possível): {} - {}",
            username, content);
    }
}
