import { useEffect, useRef, useCallback } from 'react';
import type { Client as RPCClient, Presence } from 'discord-rpc';

// We'll import the discord-rpc package dynamically to avoid issues in environments where it's not available
// This is a client-side only hook
let RPC: typeof import('discord-rpc') | null = null;

const initRPCLibrary = async () => {
  if (RPC) return RPC;
  try {
    RPC = await import('discord-rpc');
    return RPC;
  } catch (error) {
    console.error('Failed to load discord-rpc library:', error);
    return null;
  }
};

export const useDiscordRichPresence = (discordConnection: { discord_id: string; discord_username: string } | null) => {
  const rpcClientRef = useRef<RPCClient | null>(null);
  const isInitializedRef = useRef(false);
  const startTimestampRef = useRef<number | null>(null);

  // Initialize RPC client when we have a discord connection
  useEffect(() => {
    let isActive = true;

    const initializeRPC = async () => {
      if (!discordConnection || !isActive) return;
      
      try {
        const RPCModule = await initRPCLibrary();
        if (!RPCModule) {
          console.warn('Discord RPC library not available');
          return;
        }

        const transport = new RPCModule.IPCTransport(import.meta.env.VITE_DISCORD_CLIENT_ID || '1495723127357833256');
        const client = new RPCModule.Client({ transport });
        
        client.on('ready', () => {
          console.log('Discord Rich Presence client ready');
          isInitializedRef.current = true;
          
          // Set initial presence (idle in app)
          setIdlePresence(client);
        });

        client.on('error', (err) => {
          console.error('Discord RPC error:', err);
        });

        client.on('close', () => {
          console.log('Discord RPC connection closed');
          isInitializedRef.current = false;
          rpcClientRef.current = null;
        });

        // Login to Discord RPC
        client.login();
        rpcClientRef.current = client;
      } catch (error) {
        console.error('Failed to initialize Discord RPC:', error);
      }
    };

    initializeRPC();

    return () => {
      isActive = false;
      if (rpcClientRef.current && isInitializedRef.current) {
        rpcClientRef.current.destroy();
        isInitializedRef.current = false;
        rpcClientRef.current = null;
      }
    };
  }, [discordConnection]);

  // Function to set presence when in a duel
  const setDuelPresence = (opponentUsername: string, tcgType: string, isRanked: boolean, duelStartTime: number) => {
    useEffect(() => {
      if (!rpcClientRef.current || !isInitializedRef.current) return;

      const presence: Presence = {
        details: `Em duelo contra ${opponentUsername}`,
        state: `${tcgType} ${isRanked ? '(Ranked)' : '(Casual)'}`,
        startTimestamp: duelStartTime,
        largeImageKey: 'duelverse_logo', // This needs to be registered in Discord Developer Portal
        largeImageText: 'Duelverse - Live TCG Duels',
        smallImageKey: isRanked ? 'ranked' : 'casual',
        smallImageText: isRanked ? 'Partida Rankeada' : 'Partida Casual',
        instance: false,
      };

      rpcClientRef.current.setActivity(presence);
    }, [opponentUsername, tcgType, isRanked, duelStartTime]);
  };

  // Function to set presence when in app but not in duel (idle)
  const setIdlePresence = (client: RPCClient) => {
    const presence: Presence = {
      details: 'No Duelverse',
      state: 'Navegando ou aguardando partida',
      largeImageKey: 'duelverse_logo',
      largeImageText: 'Duelverse - Live TCG Duels',
      instance: false,
    };
    
    client.setActivity(presence);
  };

  // Function to clear presence
  const clearPresence = useCallback(() => {
    if (rpcClientRef.current && isInitializedRef.current) {
      rpcClientRef.current.clearActivity();
    }
  }, []);

  return { setDuelPresence, setIdlePresence, clearPresence };
};