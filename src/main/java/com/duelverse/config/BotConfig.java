package com.duelverse.config;

public class BotConfig {
    private static final String DEFAULT_DUELVERSE_URL = "ws://localhost:8080";
    private static final String DEFAULT_DISCORD_CHANNEL = "global-chat";
    
    private String discordToken;
    private String duelverseUrl;
    private String targetChannel;
    
    public BotConfig() {
        this.duelverseUrl = DEFAULT_DUELVERSE_URL;
        this.targetChannel = DEFAULT_DISCORD_CHANNEL;
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
    }
}