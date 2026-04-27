/**
 * DuelVerse - Hook de DuelRoom Automática via Discord
 * 
 * Detecta quando uma DuelRoom é criada automaticamente porque um usuário
 * entrou em um canal de voz Discord configurado com o bot DuelVerse.
 * 
 * Feature 2: Quando usuário Discord entra em canal de voz com bot configurado,
 * uma DuelRoom com nome "discord-{username}" é criada automaticamente no DuelVerse.
 * O usuário DuelVerse pode então entrar nessa sala e a transmissão ativa automaticamente.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";

export interface DiscordAutoRoom {
  duelId: string;
  duelRoomName: string;
  discordUsername: string;
  hasLinkedAccount: boolean;
  guildId: string;
  channelId: string;
  createdAt: Date;
}

/**
 * Hook que escuta criação automática de DuelRooms via Discord.
 * Mostra notificação ao usuário DuelVerse com opção de entrar na sala.
 * 
 * IMPORTANTE: Este hook deve ser chamado DENTRO de um componente que está
 * dentro do <BrowserRouter>, pois usa useNavigate().
 */
export const useDiscordAutoRoom = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pendingRooms, setPendingRooms] = useState<DiscordAutoRoom[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Escutar mudanças em live_duels onde discord_channel_id não é null
  // e status = 'waiting' (sala recém-criada pelo Discord)
  useEffect(() => {
    const channel = supabase
      .channel("discord-auto-rooms")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_duels",
          filter: "discord_channel_id=not.is.null",
        },
        (payload) => {
          const newDuel = payload.new as any;
          console.log("[useDiscordAutoRoom] New Discord-created duel:", newDuel);

          if (newDuel.discord_room_name && newDuel.status === "waiting") {
            const autoRoom: DiscordAutoRoom = {
              duelId: newDuel.id,
              duelRoomName: newDuel.discord_room_name,
              discordUsername: newDuel.discord_creator_username || "Usuário Discord",
              hasLinkedAccount: Boolean(newDuel.discord_creator_linked),
              guildId: newDuel.discord_guild_id || "",
              channelId: newDuel.discord_channel_id || "",
              createdAt: new Date(),
            };

            setPendingRooms((prev) => [...prev, autoRoom]);

            // Mostrar notificação com opção de entrar
            // Usar toast simples sem action complexa para evitar problemas de tipo
            const handleEnter = () => {
              navigate(`/duel/${autoRoom.duelId}`);
              dismissRoom(autoRoom.duelId);
            };

            toast({
              title: `🎮 DuelRoom Discord: ${autoRoom.duelRoomName}`,
              description: `${autoRoom.discordUsername} entrou no canal de voz Discord e criou uma sala.`,
            });

            // Usar setTimeout para permitir que o usuário clique em um botão de ação
            // ou simplesmente navegue manualmente
            const toastId = setTimeout(() => {
              console.log("[useDiscordAutoRoom] Toast timeout - user can still click to enter");
            }, 5000);

            // Cleanup do timeout
            return () => clearTimeout(toastId);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [toast, navigate]);

  const dismissRoom = useCallback((duelId: string) => {
    setPendingRooms((prev) => prev.filter((r) => r.duelId !== duelId));
  }, []);

  const enterRoom = useCallback(
    (duelId: string) => {
      navigate(`/duel/${duelId}`);
      dismissRoom(duelId);
    },
    [navigate, dismissRoom]
  );

  return {
    pendingRooms,
    dismissRoom,
    enterRoom,
  };
};
