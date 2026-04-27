/**
 * DiscordVoiceRoster - Mostra quem está conectado na call de voz do Discord
 * vinculada à sala de duelo atual. Sincronizado em tempo real via Supabase Realtime.
 *
 * Limitação técnica: Discord não permite que bots capturem vídeo/áudio dos
 * usuários, então só exibimos a lista de participantes (avatar + nome). O áudio
 * e vídeo continuam acontecendo dentro do Discord.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Headphones, Hash, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VoiceParticipant {
  id: string;
  discord_user_id: string;
  discord_username: string;
  discord_avatar_url: string | null;
  duelverse_username: string | null;
  joined_at: string;
}

interface VoiceRoom {
  id: string;
  guild_id: string;
  guild_name: string | null;
  channel_id: string;
  channel_name: string | null;
  invite_url: string | null;
}

interface Props {
  duelId: string;
}

export const DiscordVoiceRoster = ({ duelId }: Props) => {
  const [room, setRoom] = useState<VoiceRoom | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);

  useEffect(() => {
    if (!duelId) return;

    let cancelled = false;
    let participantsChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadRoom = async () => {
      const { data: voiceRoom } = await supabase
        .from("discord_voice_rooms")
        .select("id, guild_name, channel_name")
        .eq("duel_id", duelId)
        .eq("is_active", true)
        .maybeSingle();

      if (cancelled) return;
      if (!voiceRoom) {
        setRoom(null);
        setParticipants([]);
        return;
      }
      setRoom(voiceRoom);

      const { data: parts } = await supabase
        .from("discord_voice_participants")
        .select("id, discord_user_id, discord_username, discord_avatar_url, duelverse_username, joined_at")
        .eq("voice_room_id", voiceRoom.id)
        .is("left_at", null)
        .order("joined_at", { ascending: true });

      if (cancelled) return;
      setParticipants(parts ?? []);

      participantsChannel = supabase
        .channel(`discord-voice-${voiceRoom.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "discord_voice_participants",
            filter: `voice_room_id=eq.${voiceRoom.id}`,
          },
          async () => {
            const { data: refreshed } = await supabase
              .from("discord_voice_participants")
              .select("id, discord_user_id, discord_username, discord_avatar_url, duelverse_username, joined_at")
              .eq("voice_room_id", voiceRoom.id)
              .is("left_at", null)
              .order("joined_at", { ascending: true });
            if (!cancelled) setParticipants(refreshed ?? []);
          },
        )
        .subscribe();
    };

    loadRoom();

    // Also listen for room state changes (e.g. closed)
    const roomChannel = supabase
      .channel(`discord-voice-room-${duelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "discord_voice_rooms",
          filter: `duel_id=eq.${duelId}`,
        },
        () => loadRoom(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (participantsChannel) supabase.removeChannel(participantsChannel);
      supabase.removeChannel(roomChannel);
    };
  }, [duelId]);

  if (!room) return null;

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-xs rounded-xl border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur-md">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Headphones className="h-3.5 w-3.5 text-primary" />
        <span className="truncate">
          Conectado ao Discord
          {room.guild_name ? ` · ${room.guild_name}` : ""}
        </span>
      </div>
      {room.channel_name && (
        <div className="mb-2 flex items-center gap-1 text-xs text-foreground/80">
          <Hash className="h-3 w-3" />
          <span className="truncate">{room.channel_name}</span>
        </div>
      )}
      <div className="space-y-1.5">
        {participants.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">Ninguém na call.</p>
        ) : (
          participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              {p.discord_avatar_url ? (
                <img
                  src={p.discord_avatar_url}
                  alt={p.discord_username}
                  className="h-6 w-6 rounded-full border border-border/60"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                  {p.discord_username.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {p.duelverse_username ?? p.discord_username}
                </p>
                {p.duelverse_username && (
                  <p className="truncate text-[10px] text-muted-foreground">@{p.discord_username}</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <p className="mt-2 text-[10px] italic text-muted-foreground">
        Áudio/vídeo permanece no Discord (limitação da API).
      </p>
    </div>
  );
};
