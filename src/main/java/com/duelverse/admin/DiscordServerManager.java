package com.duelverse.admin;

import com.duelverse.config.BotConfig;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.entities.Guild;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class DiscordServerManager {
    private static final Logger logger = LoggerFactory.getLogger(DiscordServerManager.class);
    
    private final JDA jda;
    private final Set<String> enabledServers;
    private final Map<String, String> serverChannels;

    public DiscordServerManager(JDA jda) {
        this.jda = jda;
        this.enabledServers = ConcurrentHashMap.newKeySet();
        this.serverChannels = new ConcurrentHashMap<>();
    }

    public List<ServerInfo> getAvailableServers() {
        List<ServerInfo> servers = new ArrayList<>();
        
        for (Guild guild : jda.getGuilds()) {
            ServerInfo info = new ServerInfo(
                guild.getId(),
                guild.getName(),
                enabledServers.contains(guild.getId()),
                serverChannels.get(guild.getId())
            );
            servers.add(info);
        }
        
        servers.sort(Comparator.comparing(ServerInfo::getName));
        return servers;
    }

    public boolean enableServer(String serverId, String channelId) {
        Guild guild = jda.getGuildById(serverId);
        if (guild == null) {
            logger.warn("Servidor não encontrado: {}", serverId);
            return false;
        }

        enabledServers.add(serverId);
        serverChannels.put(serverId, channelId);
        
        logger.info("Servidor {} habilitado para sincronização", guild.getName());
        return true;
    }

    public boolean disableServer(String serverId) {
        if (!enabledServers.contains(serverId)) {
            return false;
        }

        enabledServers.remove(serverId);
        serverChannels.remove(serverId);
        
        logger.info("Servidor {} desabilitado", serverId);
        return true;
    }

    public Set<String> getEnabledServers() {
        return Collections.unmodifiableSet(enabledServers);
    }

    public String getServerChannel(String serverId) {
        return serverChannels.get(serverId);
    }

    public boolean isServerEnabled(String serverId) {
        return enabledServers.contains(serverId);
    }

    public static class ServerInfo {
        private final String id;
        private final String name;
        private final boolean enabled;
        private final String channelId;

        public ServerInfo(String id, String name, boolean enabled, String channelId) {
            this.id = id;
            this.name = name;
            this.enabled = enabled;
            this.channelId = channelId;
        }

        public String getId() {
            return id;
        }

        public String getName() {
            return name;
        }

        public boolean isEnabled() {
            return enabled;
        }

        public String getChannelId() {
            return channelId;
        }
    }
}