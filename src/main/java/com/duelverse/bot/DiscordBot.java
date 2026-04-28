package com.duelverse.bot;

import com.duelverse.admin.DiscordServerManager;
import com.duelverse.discord.VoiceStateListener;
import com.duelverse.config.BotConfig;
import com.duelverse.discord.DiscordMessageHandler;
import com.duelverse.duelverse.DuelverseClient;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.JDABuilder;
import net.dv8tion.jda.api.entities.Guild;
import net.dv8tion.jda.api.entities.Message;
import net.dv8tion.jda.api.entities.channel.concrete.TextChannel;
import net.dv8tion.jda.api.entities.channel.ChannelType;
import net.dv8tion.jda.api.events.message.MessageReceivedEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.requests.GatewayIntent;
import net.dv8tion.jda.api.utils.cache.CacheFlag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.concurrent.TimeUnit;

import javax.security.auth.login.LoginException;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class DiscordBot extends ListenerAdapter {
    private static final Logger logger = LoggerFactory.getLogger(DiscordBot.class);
    
    private final BotConfig config;
    private DuelverseClient duelverseClient;
    private DiscordMessageHandler messageHandler;
    private final Map<String, TextChannel> serverChannels;
    private JDA jda;
    private DiscordServerManager serverManager;

    public void setDuelverseClient(DuelverseClient client) {
        this.duelverseClient = client;
        this.messageHandler = new DiscordMessageHandler(client);
    }

    public DiscordBot(BotConfig config, DuelverseClient duelverseClient) {
        this.config = config;
        this.duelverseClient = duelverseClient;
        this.messageHandler = new DiscordMessageHandler(duelverseClient);
        this.serverChannels = new ConcurrentHashMap<>();
    }

    public void start() throws LoginException, InterruptedException {
        logger.info("Iniciando bot Discord...");

        EnumSet<GatewayIntent> intents = EnumSet.of(
            GatewayIntent.GUILD_MESSAGES,
            GatewayIntent.MESSAGE_CONTENT,
            GatewayIntent.GUILD_MEMBERS,
            GatewayIntent.GUILD_VOICE_STATES
        );

        // Voice-state bridge → DuelVerse (auto-create DuelRoom + sync roster)
        String voiceEndpoint = System.getenv().getOrDefault(
            "DUELVERSE_VOICE_EVENTS_URL",
            "https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-voice-events");
        String voiceSecret = System.getenv("DUELVERSE_BOT_BRIDGE_SECRET");
        VoiceStateListener voiceListener = new VoiceStateListener(voiceEndpoint, voiceSecret);
        if (voiceSecret == null || voiceSecret.isEmpty()) {
            logger.warn("DUELVERSE_BOT_BRIDGE_SECRET not set — voice events will NOT be sent to DuelVerse");
        } else {
            logger.info("Voice-state bridge enabled → {}", voiceEndpoint);
        }

        jda = JDABuilder.createDefault(config.getDiscordToken(), intents)
            .enableCache(CacheFlag.MEMBER_OVERRIDES, CacheFlag.VOICE_STATE)
            .addEventListeners(this, voiceListener)
            .build();

        jda.awaitReady();
        logger.info("Bot conectado ao Discord!");

        serverManager = new DiscordServerManager(jda);
        
        logger.info("Bot está em {} servidores", jda.getGuilds().size());
    }

    public DiscordServerManager getServerManager() {
        return serverManager;
    }

    public JDA getJDA() {
        return jda;
    }

    @Override
    public void onMessageReceived(MessageReceivedEvent event) {
        if (event.getAuthor().isBot()) {
            return;
        }

        Guild guild = event.getGuild();
        if (guild == null) {
            return;
        }

        String serverId = guild.getId();
        
        if (serverManager != null && !serverManager.isServerEnabled(serverId)) {
            return;
        }

        if (event.isFromType(ChannelType.TEXT)) {
            String configuredChannelId = serverManager != null ? serverManager.getServerChannel(serverId) : null;
            String incomingChannelId = event.getChannel().getId();

            if (configuredChannelId != null && !configuredChannelId.isEmpty() && !configuredChannelId.equals(incomingChannelId)) {
                return;
            }

            if ((configuredChannelId == null || configuredChannelId.isEmpty())
                && config.isTargetChannelExplicit()
                && !config.getTargetChannel().equalsIgnoreCase(event.getChannel().getName())) {
                return;
            }

            Message message = event.getMessage();
            String content = message.getContentRaw();
            if (content == null || content.trim().isEmpty()) {
                content = message.getContentDisplay();
            }

            if (content != null && !content.trim().isEmpty()) {
                String displayName = event.getMember() != null 
                    ? event.getMember().getEffectiveName() 
                    : event.getAuthor().getName();

                String authorId = event.getAuthor().getId();
                String avatarUrl = event.getAuthor().getEffectiveAvatarUrl();

                logger.info("Mensagem recebida do Discord ({}): [{}] {} - {}",
                    guild.getName(), authorId, displayName, content);

                messageHandler.handleDiscordMessage(
                    authorId,
                    displayName,
                    avatarUrl,
                    content.trim()
                );
            }
        }
    }

    public void sendMessageToDiscord(String username, String content) {
        sendMessageToDiscord(username, content, true);
    }

    public void sendMessageToDiscord(String username, String content, boolean autoDelete) {
        if (serverManager == null) {
            return;
        }

        for (String serverId : serverManager.getEnabledServers()) {
            TextChannel channel = getOrCreateChannel(serverId);
            if (channel != null) {
                String formattedMessage = String.format("**%s**: %s", username, content);
                
                if (autoDelete) {
                    // Enviar e agendar delete após 10 minutos
                    channel.sendMessage(formattedMessage).queue(
                        success -> {
                            // Agendar exclusão após 10 minutos (600000 ms)
                            success.delete().queueAfter(10, TimeUnit.MINUTES, 
                                null, // sucesso não precisa tratar
                                error -> logger.debug("Mensagem expirada ou já deletada")
                            );
                            logger.info("Mensagem enviada para Discord ({}): {} (será deletada em 10min)", 
                                channel.getGuild().getName(), username);
                        },
                        error -> logger.error("Erro ao enviar mensagem para Discord", error)
                    );
                } else {
                    // Mensagem persistente sem auto-delete
                    channel.sendMessage(formattedMessage).queue(
                        success -> logger.info("Mensagem persistente enviada para Discord ({}): {}", 
                            channel.getGuild().getName(), username),
                        error -> logger.error("Erro ao enviar mensagem para Discord", error)
                    );
                }
            }
        }
    }

    private TextChannel getOrCreateChannel(String serverId) {
        return serverChannels.computeIfAbsent(serverId, id -> {
            Guild guild = jda.getGuildById(id);
            if (guild == null) {
                return null;
            }
            
            String channelName = serverManager.getServerChannel(id);
            if (channelName != null) {
                List<TextChannel> channels = guild.getTextChannelsByName(channelName, true);
                if (!channels.isEmpty()) {
                    return channels.get(0);
                }
            }
            
            return null;
        });
    }

    public void shutdown() {
        if (jda != null) {
            jda.shutdown();
            logger.info("Bot Discord encerrado.");
        }
    }
}
