package com.duelverse.bot;

import com.duelverse.admin.DiscordServerManager;
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
import net.dv8tion.jda.api.events.voice.VoiceJoinEvent;
import net.dv8tion.jda.api.events.voice.VoiceLeaveEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;
import net.dv8tion.jda.api.requests.GatewayIntent;
import net.dv8tion.jda.api.utils.cache.CacheFlag;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.security.auth.login.LoginException;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Bot Discord do DuelVerse.
 * 
 * Funcionalidades:
 * - Sincronização de mensagens entre Discord e chat global do DuelVerse
 * - Criação automática de DuelRoom quando usuário entra em canal de voz configurado
 * - Envio de notificação no Discord com link da DuelRoom criada
 * - Suporte a canais de texto e voz separados por servidor
 */
public class DiscordBot extends ListenerAdapter {
    private static final Logger logger = LoggerFactory.getLogger(DiscordBot.class);

    /** URL base do DuelVerse para links de DuelRoom */
    private static final String DUELVERSE_BASE_URL = "https://duelverse.app";

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

        jda = JDABuilder.createDefault(config.getDiscordToken(), intents)
            .enableCache(CacheFlag.MEMBER_OVERRIDES)
            .addEventListeners(this)
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

    @Override
    public void onVoiceJoin(VoiceJoinEvent event) {
        Guild guild = event.getGuild();
        if (guild == null) {
            return;
        }

        String serverId = guild.getId();

        if (serverManager != null && !serverManager.isServerEnabled(serverId)) {
            return;
        }

        String voiceChannelId = event.getChannelJoined().getId();

        // Verificar se é um canal de voz configurado para DuelVerse
        if (serverManager != null && !serverManager.isVoiceChannelConfigured(serverId, voiceChannelId)) {
            // Fallback para verificação por nome de canal (compatibilidade)
            String configuredChannelId = serverManager.getServerChannel(serverId);
            if (configuredChannelId != null && !configuredChannelId.isEmpty() && !configuredChannelId.equals(voiceChannelId)) {
                if (config.isTargetChannelExplicit() &&
                    !config.getTargetChannel().equalsIgnoreCase(event.getChannelJoined().getName())) {
                    return;
                }
            }
        }

        String userId = event.getMember().getUser().getId();
        String username = event.getMember().getEffectiveName();

        logger.info("Usuário entrou no canal de voz do Discord ({}): [{}] {} no canal {}",
            guild.getName(), userId, username, event.getChannelJoined().getName());

        // Criar ou entrar em DuelRoom via Supabase
        if (duelverseClient != null) {
            duelverseClient.handleDiscordVoiceJoin(serverId, voiceChannelId, userId, username,
                result -> {
                    // Callback: quando a DuelRoom for criada, enviar mensagem no Discord
                    if (result != null && result.duelId != null) {
                        String duelRoomUrl = DUELVERSE_BASE_URL + "/duel/" + result.duelId;
                        String message;
                        if (result.isNewDuel) {
                            message = String.format(
                                "🎮 **%s** entrou no canal de voz e uma **DuelRoom foi criada automaticamente**!\n" +
                                "📋 Nome: `%s`\n" +
                                "🔗 Acesse no DuelVerse: %s\n" +
                                "%s",
                                username,
                                result.duelRoomName != null ? result.duelRoomName : "discord-" + username,
                                duelRoomUrl,
                                result.hasLinkedAccount
                                    ? "✅ Conta DuelVerse vinculada — ranked disponível"
                                    : "⚠️ Sem conta DuelVerse vinculada — apenas casual"
                            );
                        } else {
                            message = String.format(
                                "🎮 **%s** entrou na DuelRoom existente.\n🔗 %s",
                                username,
                                duelRoomUrl
                            );
                        }
                        sendMessageToTextChannel(serverId, message);
                    }
                });
        }
    }

    @Override
    public void onVoiceLeave(VoiceLeaveEvent event) {
        Guild guild = event.getGuild();
        if (guild == null) {
            return;
        }

        String serverId = guild.getId();

        if (serverManager != null && !serverManager.isServerEnabled(serverId)) {
            return;
        }

        String voiceChannelId = event.getChannelLeft().getId();

        // Verificar se é um canal de voz configurado para DuelVerse
        if (serverManager != null && !serverManager.isVoiceChannelConfigured(serverId, voiceChannelId)) {
            String configuredChannelId = serverManager.getServerChannel(serverId);
            if (configuredChannelId != null && !configuredChannelId.isEmpty() && !configuredChannelId.equals(voiceChannelId)) {
                if (config.isTargetChannelExplicit() &&
                    !config.getTargetChannel().equalsIgnoreCase(event.getChannelLeft().getName())) {
                    return;
                }
            }
        }

        String userId = event.getMember().getUser().getId();
        String username = event.getMember().getEffectiveName();

        logger.info("Usuário saiu do canal de voz do Discord ({}): [{}] {}",
            guild.getName(), userId, username);

        if (duelverseClient != null) {
            duelverseClient.handleDiscordVoiceLeave(serverId, voiceChannelId, userId, username);
        }
    }

    /**
     * Envia mensagem para o canal de texto configurado do servidor.
     * Usado para notificações de chat global e criação de DuelRoom.
     */
    public void sendMessageToDiscord(String username, String content) {
        if (serverManager == null) {
            return;
        }

        for (String serverId : serverManager.getEnabledServers()) {
            TextChannel channel = getOrCreateTextChannel(serverId);
            if (channel != null) {
                String formattedMessage = String.format("**%s**: %s", username, content);
                channel.sendMessage(formattedMessage).queue(
                    success -> logger.info("Mensagem enviada para Discord ({}): {}",
                        channel.getGuild().getName(), username),
                    error -> logger.error("Erro ao enviar mensagem para Discord", error)
                );
            }
        }
    }

    /**
     * Envia mensagem para o canal de texto de um servidor específico.
     */
    private void sendMessageToTextChannel(String serverId, String content) {
        TextChannel channel = getOrCreateTextChannel(serverId);
        if (channel != null) {
            channel.sendMessage(content).queue(
                success -> logger.info("Notificação DuelRoom enviada para Discord ({})", serverId),
                error -> logger.error("Erro ao enviar notificação DuelRoom para Discord", error)
            );
        }
    }

    private TextChannel getOrCreateTextChannel(String serverId) {
        return serverChannels.computeIfAbsent(serverId, id -> {
            Guild guild = jda.getGuildById(id);
            if (guild == null) {
                return null;
            }

            String channelId = serverManager != null ? serverManager.getServerChannel(id) : null;
            if (channelId != null && !channelId.isEmpty()) {
                // Tentar por ID primeiro
                TextChannel byId = guild.getTextChannelById(channelId);
                if (byId != null) return byId;
                // Fallback: por nome
                List<TextChannel> channels = guild.getTextChannelsByName(channelId, true);
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
