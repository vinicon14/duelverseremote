/**
 * DuelVerse - Hook de Sala de Voz Discord
 * 
 * Gerencia a presença de usuários Discord em uma DuelRoom via Supabase Realtime.
 * Escuta eventos de entrada/saída de usuários Discord no canal de voz configurado.
 * 
 * Comportamento:
 * - Usuário com conta DuelVerse vinculada: entra com nome DuelVerse, ranked disponível
 * - Usuário sem conta vinculada: entra com nome Discord, sem ranked
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";

export interface DiscordVoiceUser {
  discordUserId: string;
  discordUsername: string;
  duelverseUserId: string | null;
  displayUsername: string;
  hasLinkedAccount: boolean;
  isRanked: boolean;
  joinedAt: Date;
}

interface UseDiscordVoiceRoomOptions {
  duelId: string | undefined;
  discordChannelId: string | null | undefined;
  onUserJoined?: (user: DiscordVoiceUser) => void;
  onUserLeft?: (discordUserId: string, displayUsername: string) => void;
  onDuelRoomCreated?: (duelId: string, duelRoomName: string) => void;
}

export const useDiscordVoiceRoom = ({
  duelId,
  discordChannelId,
  onUserJoined,
  onUserLeft,
  onDuelRoomCreated,
}: UseDiscordVoiceRoomOptions) => {
  const { toast } = useToast();
  const [discordUsers, setDiscordUsers] = useState<DiscordVoiceUser[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!discordChannelId) return;

    const channelName = `discord-voice-${discordChannelId}`;
    console.log(`[useDiscordVoiceRoom] Subscribing to ${channelName}`);

    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: "discord_user_joined" }, (payload) => {
        const data = payload.payload;
        console.log("[useDiscordVoiceRoom] Discord user joined:", data);

        const newUser: DiscordVoiceUser = {
          discordUserId: data.discordUserId,
          discordUsername: data.discordUsername,
          duelverseUserId: data.duelverseUserId || null,
          displayUsername: data.displayUsername || data.discordUsername,
          hasLinkedAccount: Boolean(data.hasLinkedAccount),
          isRanked: Boolean(data.isRanked),
          joinedAt: new Date(),
        };

        setDiscordUsers((prev) => {
          // Evitar duplicatas
          const exists = prev.some((u) => u.discordUserId === newUser.discordUserId);
          if (exists) return prev;
          return [...prev, newUser];
        });

        // Notificar sobre novo usuário Discord
        toast({
          title: `🎮 ${newUser.displayUsername} entrou via Discord`,
          description: newUser.hasLinkedAccount
            ? `Conta DuelVerse vinculada. ${newUser.isRanked ? "Ranked ativo." : "Partida casual."}`
            : "Sem conta DuelVerse vinculada. Apenas casual.",
        });

        onUserJoined?.(newUser);

        // Se uma nova DuelRoom foi criada, notificar
        if (data.isNewDuel && data.duelId && data.duelRoomName) {
          onDuelRoomCreated?.(data.duelId, data.duelRoomName);
        }
      })
      .on("broadcast", { event: "discord_user_left" }, (payload) => {
        const data = payload.payload;
        console.log("[useDiscordVoiceRoom] Discord user left:", data);

        setDiscordUsers((prev) =>
          prev.filter((u) => u.discordUserId !== data.discordUserId)
        );

        toast({
          title: `${data.displayUsername || data.discordUsername} saiu do Discord`,
          description: "O usuário saiu do canal de voz Discord.",
        });

        onUserLeft?.(data.discordUserId, data.displayUsername || data.discordUsername);
      })
      .subscribe((status) => {
        console.log(`[useDiscordVoiceRoom] Channel ${channelName} status:`, status);
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        console.log(`[useDiscordVoiceRoom] Unsubscribing from ${channelName}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [discordChannelId, toast, onUserJoined, onUserLeft, onDuelRoomCreated]);

  // Também escutar eventos de DuelRoom criada via Discord (feature 2)
  useEffect(() => {
    if (!duelId) return;

    const duelChannel = supabase
      .channel(`discord-duelroom-${duelId}`)
      .on("broadcast", { event: "discord_screenshare_started" }, (payload) => {
        const data = payload.payload;
        console.log("[useDiscordVoiceRoom] Screenshare started:", data);
        toast({
          title: "📡 Transmissão Discord ativa",
          description: "A partida está sendo transmitida para um servidor Discord.",
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(duelChannel);
    };
  }, [duelId, toast]);

  return {
    discordUsers,
    discordUsersCount: discordUsers.length,
    hasDiscordUsers: discordUsers.length > 0,
  };
};
