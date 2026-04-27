package com.duelverse.discord;

import net.dv8tion.jda.api.entities.Member;
import net.dv8tion.jda.api.entities.User;
import net.dv8tion.jda.api.entities.channel.unions.AudioChannelUnion;
import net.dv8tion.jda.api.events.guild.voice.GuildVoiceUpdateEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Bridges Discord VOICE_STATE_UPDATE events to the DuelVerse backend
 * (edge function: discord-voice-events). When a user joins/leaves a voice
 * channel where the bot is present, this listener notifies the backend so it
 * can auto-create a DuelRoom and sync the participant roster.
 */
public class VoiceStateListener extends ListenerAdapter {
    private static final Logger logger = LoggerFactory.getLogger(VoiceStateListener.class);

    private final String endpointUrl;
    private final String botSecret;
    private final HttpClient httpClient;
    private final ExecutorService executor;

    public VoiceStateListener(String endpointUrl, String botSecret) {
        this.endpointUrl = endpointUrl;
        this.botSecret = botSecret;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();
        this.executor = Executors.newCachedThreadPool();
    }

    @Override
    public void onGuildVoiceUpdate(GuildVoiceUpdateEvent event) {
        AudioChannelUnion left = event.getChannelLeft();
        AudioChannelUnion joined = event.getChannelJoined();
        Member member = event.getMember();
        User user = member.getUser();

        if (left != null) {
            postEvent("leave", event.getGuild().getId(), event.getGuild().getName(),
                left.getId(), left.getName(), user, member);
        }
        if (joined != null) {
            postEvent("join", event.getGuild().getId(), event.getGuild().getName(),
                joined.getId(), joined.getName(), user, member);
        }
    }

    private void postEvent(String eventType, String guildId, String guildName,
                           String channelId, String channelName,
                           User user, Member member) {
        if (endpointUrl == null || endpointUrl.isEmpty() || botSecret == null || botSecret.isEmpty()) {
            return;
        }

        String displayName = member != null ? member.getEffectiveName() : user.getName();
        String avatar = user.getEffectiveAvatarUrl();

        String body = String.format(
            "{\"event\":\"%s\",\"guild_id\":\"%s\",\"guild_name\":%s,"
                + "\"channel_id\":\"%s\",\"channel_name\":%s,"
                + "\"discord_user_id\":\"%s\",\"discord_username\":%s,"
                + "\"discord_avatar_url\":%s,\"is_bot\":%s}",
            eventType,
            guildId,
            jsonString(guildName),
            channelId,
            jsonString(channelName),
            user.getId(),
            jsonString(displayName),
            jsonString(avatar),
            user.isBot() ? "true" : "false"
        );

        executor.submit(() -> {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(endpointUrl))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .header("x-bot-secret", botSecret)
                    .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                    .build();

                HttpResponse<String> response = httpClient.send(request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    logger.info("[voice] {} {} #{}: {}", eventType, displayName,
                        channelName, response.body());
                } else {
                    logger.warn("[voice] {} for {} returned {}: {}", eventType, displayName,
                        response.statusCode(), response.body());
                }
            } catch (IOException | InterruptedException ex) {
                logger.error("[voice] failed to send {} event for {}", eventType, displayName, ex);
                if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            }
        });
    }

    private static String jsonString(String value) {
        if (value == null) return "null";
        StringBuilder sb = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        sb.append("\"");
        return sb.toString();
    }

    public void shutdown() {
        executor.shutdown();
    }
}
