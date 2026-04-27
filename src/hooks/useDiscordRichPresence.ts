import { useEffect, useRef } from 'react';

let rpcModule: any = null;
let rpcClient: any = null;

const getRPCModule = async () => {
  if (rpcModule) return rpcModule;
  try {
    rpcModule = await import('discord-rpc');
    return rpcModule;
  } catch (error) {
    console.error('Failed to load discord-rpc library:', error);
    return null;
  }
};

export const useDiscordRichPresence = (discordConnection: { discord_id: string; discord_username: string } | null) => {
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!discordConnection) return;

    const initRPC = async () => {
      try {
        const module = await getRPCModule();
        if (!module) return;

        const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || '1495723127357833256';

        if (rpcClient) {
          rpcClient.destroy();
        }

        rpcClient = new module.Client({ transport: new module.IPCTransport(clientId) });

        rpcClient.on('ready', () => {
          console.log('Discord Rich Presence client ready');
          isInitializedRef.current = true;
          rpcClient.setActivity({
            details: 'No Duelverse',
            state: 'Navegando ou aguardando partida',
            largeImageKey: 'duelverse_logo',
            largeImageText: 'Duelverse - Live TCG Duels',
            instance: false,
          });
        });

        rpcClient.on('close', () => {
          console.log('Discord RPC connection closed');
          isInitializedRef.current = false;
          rpcClient = null;
        });

        rpcClient.login();
      } catch (error) {
        console.error('Failed to initialize Discord RPC:', error);
      }
    };

    initRPC();

    return () => {
      if (rpcClient && isInitializedRef.current) {
        rpcClient.destroy();
        rpcClient = null;
        isInitializedRef.current = false;
      }
    };
  }, [discordConnection]);

  const setDuelPresence = (opponentUsername: string, tcgType: string, isRanked: boolean, duelStartTime: number) => {
    if (!rpcClient || !isInitializedRef.current) return;

    rpcClient.setActivity({
      details: `Em duelo contra ${opponentUsername}`,
      state: `${tcgType} ${isRanked ? '(Ranked)' : '(Casual)'}`,
      startTimestamp: duelStartTime,
      largeImageKey: 'duelverse_logo',
      largeImageText: 'Duelverse - Live TCG Duels',
      smallImageKey: isRanked ? 'ranked' : 'casual',
      smallImageText: isRanked ? 'Partida Rankeada' : 'Partida Casual',
      instance: false,
    });
  };

  const setIdlePresence = () => {
    if (!rpcClient || !isInitializedRef.current) return;

    rpcClient.setActivity({
      details: 'No Duelverse',
      state: 'Navegando ou aguardando partida',
      largeImageKey: 'duelverse_logo',
      largeImageText: 'Duelverse - Live TCG Duels',
      instance: false,
    });
  };

  const clearPresence = () => {
    if (rpcClient && isInitializedRef.current) {
      rpcClient.clearActivity();
    }
  };

  return { setDuelPresence, setIdlePresence, clearPresence };
};