package com.duelverse.discord;

import com.duelverse.duelverse.DuelverseClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class DiscordMessageHandler {
    private static final Logger logger = LoggerFactory.getLogger(DiscordMessageHandler.class);
    
    private final DuelverseClient duelverseClient;

    public DiscordMessageHandler(DuelverseClient duelverseClient) {
        this.duelverseClient = duelverseClient;
    }

    public void handleDiscordMessage(String username, String content) {
        logger.info("Processando mensagem do Discord para DuelVerse: {} - {}", username, content);
        
        duelverseClient.sendMessage(username, content);
    }
}