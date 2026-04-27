/**
 * DuelVerse - Hook de Rich Presence do Discord
 * 
 * Gerencia a presença rica do Discord para mostrar atividade do jogador.
 * Client ID: 1495723127357833256
 * 
 * Estados suportados:
 * - Idle: navegando ou aguardando partida
 * - Em duelo: mostra oponente, tipo de jogo, ranked/casual, timer
 * - Transmitindo: mostra que está transmitindo para Discord
 */
import { useEffect, useRef, useCallback } from "react";

const DISCORD_CLIENT_ID = "1495723127357833256";

let rpcModule: any = null;
let rpcClient: any = null;
let rpcInitializing = false;

const getRPCModule = async () => {
  if (rpcModule) return rpcModule;
  try {
    rpcModule = await import("discord-rpc");
    return rpcModule;
  } catch (error) {
    // discord-rpc só funciona em ambiente Electron/desktop
    // Em ambiente web, falha silenciosamente
    console.debug("[DiscordRPC] discord-rpc não disponível (ambiente web):", error);
    return null;
  }
};

export const useDiscordRichPresence = (
  discordConnection: { discord_id: string; discord_username: string } | null
) => {
  const isInitializedRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!discordConnection || rpcInitializing) return;

    const initRPC = async () => {
      rpcInitializing = true;
      try {
        const module = await getRPCModule();
        if (!module) {
          rpcInitializing = false;
          return;
        }

        // Destruir cliente anterior se existir
        if (rpcClient) {
          try {
            rpcClient.destroy();
          } catch {
            // Ignorar erros ao destruir
          }
          rpcClient = null;
        }

        const clientId = DISCORD_CLIENT_ID;

        // IPCTransport para aplicação desktop (Electron)
        // Em ambiente web, usar WebSocketTransport se disponível
        let transport;
        try {
          transport = new module.IPCTransport(clientId);
        } catch {
          // Fallback para WebSocket se IPC não disponível
          try {
            transport = new module.WebSocketTransport(clientId);
          } catch {
            console.debug("[DiscordRPC] Nenhum transporte disponível");
            rpcInitializing = false;
            return;
          }
        }

        rpcClient = new module.Client({ transport });

        rpcClient.on("ready", () => {
          console.log("[DiscordRPC] Discord Rich Presence client ready");
          isInitializedRef.current = true;
          rpcInitializing = false;

          // Estado inicial: idle
          setIdlePresenceInternal();
        });

        rpcClient.on("close", () => {
          console.debug("[DiscordRPC] Discord RPC connection closed");
          isInitializedRef.current = false;
          rpcClient = null;
          rpcInitializing = false;

          // Tentar reconectar após 30 segundos
          retryTimeoutRef.current = setTimeout(() => {
            if (discordConnection) {
              initRPC();
            }
          }, 30000);
        });

        rpcClient.on("error", (err: any) => {
          console.debug("[DiscordRPC] RPC error:", err?.message || err);
          rpcInitializing = false;
        });

        await rpcClient.login({ clientId });
      } catch (error) {
        console.debug("[DiscordRPC] Failed to initialize Discord RPC:", error);
        rpcInitializing = false;
      }
    };

    initRPC();

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (rpcClient && isInitializedRef.current) {
        try {
          rpcClient.destroy();
        } catch {
          // Ignorar
        }
        rpcClient = null;
        isInitializedRef.current = false;
      }
      rpcInitializing = false;
    };
  }, [discordConnection]);

  const setIdlePresenceInternal = () => {
    if (!rpcClient || !isInitializedRef.current) return;
    try {
      rpcClient.setActivity({
        details: "No Duelverse",
        state: "Navegando ou aguardando partida",
        largeImageKey: "duelverse_logo",
        largeImageText: "Duelverse - Live TCG Duels",
        instance: false,
        buttons: [
          {
            label: "Jogar no DuelVerse",
            url: "https://duelverse.app",
          },
        ],
      });
    } catch (err) {
      console.debug("[DiscordRPC] Error setting idle presence:", err);
    }
  };

  /**
   * Define presença de duelo ativo.
   * @param opponentUsername Nome do oponente
   * @param tcgType Tipo de TCG (yugioh, magic, pokemon)
   * @param isRanked Se é partida rankeada
   * @param duelStartTime Timestamp de início do duelo (ms)
   * @param duelId ID do duelo (para botão Join)
   */
  const setDuelPresence = useCallback(
    (
      opponentUsername: string,
      tcgType: string,
      isRanked: boolean,
      duelStartTime: number,
      duelId?: string
    ) => {
      if (!rpcClient || !isInitializedRef.current) return;

      const tcgNames: Record<string, string> = {
        yugioh: "Yu-Gi-Oh!",
        magic: "Magic: The Gathering",
        pokemon: "Pokémon TCG",
      };

      const tcgDisplay = tcgNames[tcgType] || tcgType;

      try {
        const activity: any = {
          details: `Em duelo contra ${opponentUsername}`,
          state: `${tcgDisplay} • ${isRanked ? "🏆 Ranked" : "🎮 Casual"}`,
          startTimestamp: duelStartTime,
          largeImageKey: "duelverse_logo",
          largeImageText: "Duelverse - Live TCG Duels",
          smallImageKey: isRanked ? "ranked_icon" : "casual_icon",
          smallImageText: isRanked ? "Partida Rankeada" : "Partida Casual",
          instance: true,
        };

        if (duelId) {
          activity.buttons = [
            {
              label: "Assistir Partida",
              url: `https://duelverse.app/duel/${duelId}`,
            },
          ];
        }

        rpcClient.setActivity(activity);
      } catch (err) {
        console.debug("[DiscordRPC] Error setting duel presence:", err);
      }
    },
    []
  );

  /**
   * Define presença de transmissão ativa para Discord.
   */
  const setStreamingPresence = useCallback(
    (serverName: string, opponentUsername?: string) => {
      if (!rpcClient || !isInitializedRef.current) return;

      try {
        rpcClient.setActivity({
          details: opponentUsername
            ? `Transmitindo duelo contra ${opponentUsername}`
            : "Transmitindo partida",
          state: `📡 Ao vivo no servidor: ${serverName}`,
          largeImageKey: "duelverse_logo",
          largeImageText: "Duelverse - Live TCG Duels",
          smallImageKey: "streaming_icon",
          smallImageText: "Transmissão ativa",
          instance: true,
        });
      } catch (err) {
        console.debug("[DiscordRPC] Error setting streaming presence:", err);
      }
    },
    []
  );

  /**
   * Define presença idle (navegando).
   */
  const setIdlePresence = useCallback(() => {
    setIdlePresenceInternal();
  }, []);

  /**
   * Limpa a presença do Discord.
   */
  const clearPresence = useCallback(() => {
    if (rpcClient && isInitializedRef.current) {
      try {
        rpcClient.clearActivity();
      } catch (err) {
        console.debug("[DiscordRPC] Error clearing presence:", err);
      }
    }
  }, []);

  return {
    setDuelPresence,
    setStreamingPresence,
    setIdlePresence,
    clearPresence,
    isConnected: isInitializedRef.current,
  };
};
