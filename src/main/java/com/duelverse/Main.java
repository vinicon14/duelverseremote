package com.duelverse;

import com.duelverse.admin.AdminApiServer;
import com.duelverse.bot.DiscordBot;
import com.duelverse.config.BotConfig;
import com.duelverse.duelverse.DuelverseClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URISyntaxException;
import java.util.Scanner;

public class Main {
    private static final Logger logger = LoggerFactory.getLogger(Main.class);
    private static final int DEFAULT_ADMIN_PORT = 8081;

    public static void main(String[] args) {
        BotConfig config = parseArguments(args);
        
        if (config.getDiscordToken() == null || config.getDiscordToken().isEmpty()) {
            logger.error("Token do Discord não fornecido. Use --token <token>");
            System.exit(1);
        }

        logger.info("Iniciando DuelVerse Discord Bot...");
        logger.info("DuelVerse URL: {}", config.getDuelverseUrl());
        logger.info("Admin API porta: {}", DEFAULT_ADMIN_PORT);

        try {
            DiscordBot discordBot = new DiscordBot(config, null);
            DuelverseClient duelverseClient = new DuelverseClient(config.getDuelverseUrl(), discordBot);
            
            discordBot.start();
            
            duelverseClient.connect();
            
            AdminApiServer adminApi = new AdminApiServer(
                discordBot.getServerManager(),
                DEFAULT_ADMIN_PORT
            );
            adminApi.start();
            
            logger.info("========================================");
            logger.info("Bot iniciado com sucesso!");
            logger.info("Admin API: http://localhost:{}", DEFAULT_ADMIN_PORT);
            logger.info("========================================");
            
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                logger.info("Encerrando bot...");
                adminApi.stop();
                discordBot.shutdown();
                duelverseClient.close();
            }));

            waitForShutdown();

        } catch (InterruptedException e) {
            logger.error("Bot interrompido", e);
        } catch (URISyntaxException e) {
            logger.error("URL inválida do DuelVerse", e);
        } catch (Exception e) {
            logger.error("Erro ao iniciar bot", e);
            System.exit(1);
        }
    }

    private static BotConfig parseArguments(String[] args) {
        BotConfig config = new BotConfig();
        
        for (int i = 0; i < args.length; i++) {
            switch (args[i]) {
                case "--token":
                    if (i + 1 < args.length) {
                        config.setDiscordToken(args[++i]);
                    }
                    break;
                case "--url":
                    if (i + 1 < args.length) {
                        config.setDuelverseUrl(args[++i]);
                    }
                    break;
                case "--channel":
                    if (i + 1 < args.length) {
                        config.setTargetChannel(args[++i]);
                    }
                    break;
                case "--admin-port":
                    if (i + 1 < args.length) {
                        config.setTargetChannel(args[++i]);
                    }
                    break;
            }
        }
        
        return config;
    }

    private static void waitForShutdown() {
        try {
            if (System.in.available() > 0) {
                Scanner scanner = new Scanner(System.in);
                while (true) {
                    String input = scanner.nextLine();
                    if ("quit".equalsIgnoreCase(input) || "exit".equalsIgnoreCase(input)) {
                        logger.info("Comando de encerramento recebido.");
                        break;
                    }
                }
                scanner.close();
            } else {
                synchronized (Main.class) {
                    Main.class.wait();
                }
            }
        } catch (InterruptedException e) {
            logger.info("Thread interrompida");
        } catch (IOException e) {
            synchronized (Main.class) {
                try {
                    Main.class.wait();
                } catch (InterruptedException ex) {
                    logger.info("Thread interrompida");
                }
            }
        }
    }
}