package com.duelverse.config;

public class BotConfig {
    private static final String DEFAULT_DUELVERSE_API = "https://duelverse.site/api/chat";
    private static final String DEFAULT_DISCORD_CHANNEL = "global-chat";
    
    private String discordToken;
    private String duelverseUrl;
    private String targetChannel;
    private boolean targetChannelExplicit;
    
    public BotConfig() {
        this.duelverseUrl = DEFAULT_DUELVERSE_API;
        this.targetChannel = DEFAULT_DISCORD_CHANNEL;
        this.targetChannelExplicit = false;
    }
    
    public String getDiscordToken() {
        return discordToken;
    }
    
    public void setDiscordToken(String discordToken) {
        this.discordToken = discordToken;
    }
    
    public String getDuelverseUrl() {
        return duelverseUrl;
    }
    
    public void setDuelverseUrl(String duelverseUrl) {
        this.duelverseUrl = duelverseUrl;
    }
    
    public String getTargetChannel() {
        return targetChannel;
    }
    
    public void setTargetChannel(String targetChannel) {
        this.targetChannel = targetChannel;
        this.targetChannelExplicit = targetChannel != null && !targetChannel.isEmpty();
    }

    public boolean isTargetChannelExplicit() {
        return targetChannelExplicit;
    }
}