package com.duelverse.admin;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.entities.Guild;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Gerencia a configuração de servidores Discord habilitados para o DuelVerse.
 * Sincroniza periodicamente com o Supabase para obter a lista de servidores
 * e seus canais de texto e voz configurados.
 */
public class DiscordServerManager {
    private static final Logger logger = LoggerFactory.getLogger(DiscordServerManager.class);

    private static final String SUPABASE_URL = "https://xxttwzewtqxvpgefggah.supabase.co";
    private static final String SETTINGS_ENDPOINT =
        SUPABASE_URL + "/rest/v1/system_settings?key=eq.discord_bot_status&select=value";

    private final JDA jda;
    private final Set<String> enabledServers;
    /** Canal de texto configurado por servidor (para chat global) */
    private final Map<String, String> serverChannels;
    /** Canal de voz configurado por servidor (para DuelRoom automática) */
    private final Map<String, String> serverVoiceChannels;
    private final HttpClient httpClient;
    private final ScheduledExecutorService scheduler;
    private final String supabaseServiceKey;

    public DiscordServerManager(JDA jda) {
        this.jda = jda;
        this.enabledServers = ConcurrentHashMap.newKeySet();
        this.serverChannels = new ConcurrentHashMap<>();
        this.serverVoiceChannels = new ConcurrentHashMap<>();
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "DiscordServerManager-Sync");
            t.setDaemon(true);
            return t;
        });

        // Service-role key (ou anon key como fallback) para ler system_settings
        String key = System.getenv("SUPABASE_SERVICE_ROLE_KEY");
        if (key == null || key.isEmpty()) {
            key = System.getenv("SUPABASE_ANON_KEY");
        }
        this.supabaseServiceKey = key;

        if (this.supabaseServiceKey == null || this.supabaseServiceKey.isEmpty()) {
            logger.warn("Nenhuma chave Supabase encontrada (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY). " +
                "A sincronização de servidores habilitados não funcionará.");
        }

        // Sincronização inicial + a cada 60s
        syncFromSupabase();
        scheduler.scheduleAtFixedRate(this::syncFromSupabase, 60, 60, TimeUnit.SECONDS);
    }

    private void syncFromSupabase() {
        if (supabaseServiceKey == null || supabaseServiceKey.isEmpty()) {
            return;
        }
        try {
            HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(SETTINGS_ENDPOINT))
                .header("apikey", supabaseServiceKey)
                .header("Authorization", "Bearer " + supabaseServiceKey)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                logger.warn("Falha ao sincronizar discord_bot_status: HTTP {} - {}",
                    response.statusCode(), response.body());
                return;
            }

            JsonElement root = JsonParser.parseString(response.body());
            if (!root.isJsonArray() || root.getAsJsonArray().size() == 0) {
                logger.debug("Nenhuma configuração discord_bot_status encontrada no Supabase.");
                return;
            }

            JsonElement valueEl = root.getAsJsonArray().get(0).getAsJsonObject().get("value");
            JsonObject status;
            if (valueEl.isJsonObject()) {
                status = valueEl.getAsJsonObject();
            } else {
                status = JsonParser.parseString(valueEl.getAsString()).getAsJsonObject();
            }

            JsonArray servers = status.has("servers") && status.get("servers").isJsonArray()
                ? status.getAsJsonArray("servers")
                : new JsonArray();

            Set<String> newEnabled = ConcurrentHashMap.newKeySet();
            Map<String, String> newChannels = new ConcurrentHashMap<>();
            Map<String, String> newVoiceChannels = new ConcurrentHashMap<>();

            for (JsonElement el : servers) {
                JsonObject s = el.getAsJsonObject();
                if (!s.has("id") || !s.has("enabled")) continue;
                String id = s.get("id").getAsString();
                boolean enabled = s.get("enabled").getAsBoolean();
                if (enabled) {
                    newEnabled.add(id);
                    // Canal de texto (para chat global)
                    if (s.has("channelId") && !s.get("channelId").isJsonNull()) {
                        newChannels.put(id, s.get("channelId").getAsString());
                    }
                    // Canal de voz (para DuelRoom automática) - novo campo
                    if (s.has("voiceChannelId") && !s.get("voiceChannelId").isJsonNull()) {
                        newVoiceChannels.put(id, s.get("voiceChannelId").getAsString());
                    } else if (s.has("channelId") && !s.get("channelId").isJsonNull()) {
                        // Fallback: usar o mesmo canal se voiceChannelId não estiver configurado
                        newVoiceChannels.put(id, s.get("channelId").getAsString());
                    }
                }
            }

            // Swap atômico
            enabledServers.clear();
            enabledServers.addAll(newEnabled);
            serverChannels.clear();
            serverChannels.putAll(newChannels);
            serverVoiceChannels.clear();
            serverVoiceChannels.putAll(newVoiceChannels);

            logger.info("Sincronização concluída: {} servidor(es) habilitado(s)", enabledServers.size());
        } catch (Exception e) {
            logger.error("Erro ao sincronizar discord_bot_status do Supabase", e);
        }
    }

    public List<ServerInfo> getAvailableServers() {
        List<ServerInfo> servers = new ArrayList<>();
        for (Guild guild : jda.getGuilds()) {
            servers.add(new ServerInfo(
                guild.getId(),
                guild.getName(),
                enabledServers.contains(guild.getId()),
                serverChannels.get(guild.getId()),
                serverVoiceChannels.get(guild.getId())
            ));
        }
        servers.sort(Comparator.comparing(ServerInfo::getName));
        return servers;
    }

    public boolean enableServer(String serverId, String channelId) {
        return enableServer(serverId, channelId, null);
    }

    public boolean enableServer(String serverId, String channelId, String voiceChannelId) {
        Guild guild = jda.getGuildById(serverId);
        if (guild == null) {
            logger.warn("Servidor não encontrado: {}", serverId);
            return false;
        }
        enabledServers.add(serverId);
        if (channelId != null && !channelId.isEmpty()) {
            serverChannels.put(serverId, channelId);
        }
        if (voiceChannelId != null && !voiceChannelId.isEmpty()) {
            serverVoiceChannels.put(serverId, voiceChannelId);
        } else if (channelId != null && !channelId.isEmpty()) {
            serverVoiceChannels.put(serverId, channelId);
        }
        logger.info("Servidor {} habilitado para sincronização", guild.getName());
        return true;
    }

    public boolean disableServer(String serverId) {
        if (!enabledServers.contains(serverId)) return false;
        enabledServers.remove(serverId);
        serverChannels.remove(serverId);
        serverVoiceChannels.remove(serverId);
        logger.info("Servidor {} desabilitado", serverId);
        return true;
    }

    public Set<String> getEnabledServers() {
        return Collections.unmodifiableSet(enabledServers);
    }

    /** Retorna o canal de texto configurado para o servidor (chat global) */
    public String getServerChannel(String serverId) {
        return serverChannels.get(serverId);
    }

    /** Retorna o canal de voz configurado para o servidor (DuelRoom automática) */
    public String getServerVoiceChannel(String serverId) {
        return serverVoiceChannels.get(serverId);
    }

    public boolean isServerEnabled(String serverId) {
        return enabledServers.contains(serverId);
    }

    /**
     * Verifica se um canal de voz específico está configurado para o servidor.
     * Usado pelo bot para filtrar eventos de voz.
     */
    public boolean isVoiceChannelConfigured(String serverId, String voiceChannelId) {
        if (!enabledServers.contains(serverId)) return false;
        String configured = serverVoiceChannels.get(serverId);
        if (configured == null || configured.isEmpty()) {
            // Se não houver canal de voz específico, aceitar qualquer canal do servidor habilitado
            return true;
        }
        return configured.equals(voiceChannelId);
    }

    public void shutdown() {
        scheduler.shutdownNow();
    }

    public static class ServerInfo {
        private final String id;
        private final String name;
        private final boolean enabled;
        private final String channelId;
        private final String voiceChannelId;

        public ServerInfo(String id, String name, boolean enabled, String channelId, String voiceChannelId) {
            this.id = id;
            this.name = name;
            this.enabled = enabled;
            this.channelId = channelId;
            this.voiceChannelId = voiceChannelId;
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public boolean isEnabled() { return enabled; }
        public String getChannelId() { return channelId; }
        public String getVoiceChannelId() { return voiceChannelId; }
    }
}
