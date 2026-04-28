package com.duelverse.admin;

import com.duelverse.admin.DiscordServerManager.ServerInfo;
import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

public class AdminApiServer {
    private static final Logger logger = LoggerFactory.getLogger(AdminApiServer.class);
    private static final int DEFAULT_PORT = 8080;
    
    private final DiscordServerManager serverManager;
    private final int port;
    private HttpServer httpServer;

    public AdminApiServer(DiscordServerManager serverManager, int port) {
        this.serverManager = serverManager;
        this.port = port;
    }

    public void start() throws IOException {
        httpServer = HttpServer.create(new InetSocketAddress(port), 0);
        
        httpServer.createContext("/api/servers", exchange -> {
            String method = exchange.getRequestMethod();
            
            if ("GET".equals(method)) {
                handleGetServers(exchange);
            } else {
                sendResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
            }
        });

        httpServer.createContext("/api/servers/enable", exchange -> {
            String method = exchange.getRequestMethod();
            
            if ("POST".equals(method)) {
                handleEnableServer(exchange);
            } else {
                sendResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
            }
        });

        httpServer.createContext("/api/servers/disable", exchange -> {
            String method = exchange.getRequestMethod();
            
            if ("POST".equals(method)) {
                handleDisableServer(exchange);
            } else {
                sendResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
            }
        });

        httpServer.createContext("/api/health", exchange -> {
            sendResponse(exchange, 200, "{\"status\":\"ok\"}");
        });

        httpServer.setExecutor(null);
        httpServer.start();
        
        logger.info("Admin API iniciada na porta {}", port);
    }

    private void handleGetServers(HttpExchange exchange) {
        List<ServerInfo> servers = serverManager.getAvailableServers();
        
        JsonArray jsonArray = new JsonArray();
        for (ServerInfo server : servers) {
            JsonObject obj = new JsonObject();
            obj.addProperty("id", server.getId());
            obj.addProperty("name", server.getName());
            obj.addProperty("enabled", server.isEnabled());
            obj.addProperty("channelId", server.getChannelId());
            jsonArray.add(obj);
        }

        JsonObject response = new JsonObject();
        response.add("servers", jsonArray);

        sendResponse(exchange, 200, new Gson().toJson(response));
    }

    private void handleEnableServer(HttpExchange exchange) {
        String body = readBody(exchange);
        Map<String, String> params = parseJson(body);

        String serverId = params.get("serverId");
        String channelId = params.get("channelId");

        if (serverId == null || channelId == null) {
            sendResponse(exchange, 400, "{\"error\":\"serverId and channelId required\"}");
            return;
        }

        boolean success = serverManager.enableServer(serverId, channelId);
        
        if (success) {
            JsonObject response = new JsonObject();
            response.addProperty("success", true);
            response.addProperty("serverId", serverId);
            sendResponse(exchange, 200, new Gson().toJson(response));
        } else {
            sendResponse(exchange, 404, "{\"error\":\"Server not found\"}");
        }
    }

    private void handleDisableServer(HttpExchange exchange) {
        String body = readBody(exchange);
        Map<String, String> params = parseJson(body);

        String serverId = params.get("serverId");

        if (serverId == null) {
            sendResponse(exchange, 400, "{\"error\":\"serverId required\"}");
            return;
        }

        boolean success = serverManager.disableServer(serverId);
        
        if (success) {
            JsonObject response = new JsonObject();
            response.addProperty("success", true);
            response.addProperty("serverId", serverId);
            sendResponse(exchange, 200, new Gson().toJson(response));
        } else {
            sendResponse(exchange, 404, "{\"error\":\"Server not found or not enabled\"}");
        }
    }

    private void sendResponse(HttpExchange exchange, int status, String body) {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        
        try {
            exchange.sendResponseHeaders(status, body.getBytes().length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body.getBytes());
            }
        } catch (IOException e) {
            logger.error("Erro ao enviar resposta", e);
        } finally {
            exchange.close();
        }
    }

    private String readBody(HttpExchange exchange) {
        try {
            return new String(exchange.getRequestBody().readAllBytes());
        } catch (IOException e) {
            logger.error("Erro ao ler corpo da requisição", e);
            return "";
        }
    }

    private Map<String, String> parseJson(String json) {
        Map<String, String> result = new ConcurrentHashMap<>();
        
        try {
            com.google.gson.JsonObject obj = new Gson().fromJson(json, com.google.gson.JsonObject.class);
            obj.entrySet().forEach(entry -> 
                result.put(entry.getKey(), entry.getValue().getAsString())
            );
        } catch (Exception e) {
            logger.warn("Erro ao parsear JSON: {}", e.getMessage());
        }
        
        return result;
    }

    public void stop() {
        if (httpServer != null) {
            httpServer.stop(0);
            logger.info("Admin API interrompida");
        }
    }
}