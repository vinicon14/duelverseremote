/**
 * DuelVerse - Contador de espectadores ao vivo
 * Canal de presença leve, separado da sinalização WebRTC.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSpectatorCount(
  duelId: string | undefined,
  userId: string | undefined,
  isSpectator: boolean,
) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!duelId || !userId) return;

    const channel = supabase.channel(`duel-viewers-${duelId}`, {
      config: { presence: { key: userId } },
    });

    const recount = () => {
      const state = channel.presenceState() as Record<string, Array<{ role?: string }>>;
      const total = Object.values(state)
        .flat()
        .filter((entry) => entry?.role === "spectator").length;
      setCount(total);
    };

    channel
      .on("presence", { event: "sync" }, recount)
      .on("presence", { event: "join" }, recount)
      .on("presence", { event: "leave" }, recount)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ role: isSpectator ? "spectator" : "player" });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId, userId, isSpectator]);

  return count;
}
