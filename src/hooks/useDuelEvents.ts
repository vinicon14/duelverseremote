import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export type DuelEvent = Database["public"]["Tables"]["duel_events"]["Row"];

type PublicEventPayload = Record<string, unknown>;

const sanitizePayload = (payload: PublicEventPayload = {}): Json => {
  const blockedKeys = new Set(["hand", "handCards", "privateHand", "deckList", "deckCards"]);
  const publicPayload = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !blockedKeys.has(key))
  );

  return {
    ...publicPayload,
    private: false,
  } as Json;
};

export const useDuelEvents = (duelId?: string, actorId?: string | null) => {
  const [events, setEvents] = useState<DuelEvent[]>([]);

  useEffect(() => {
    if (!duelId) {
      setEvents([]);
      return;
    }

    let mounted = true;

    const loadEvents = async () => {
      const { data, error } = await supabase
        .from("duel_events")
        .select("*")
        .eq("duel_id", duelId)
        .order("created_at", { ascending: false })
        .limit(150);

      if (!mounted) return;
      if (error) {
        console.warn("[duel_events] load skipped:", error.message);
        return;
      }

      setEvents((data || []).reverse());
    };

    loadEvents();

    const channel = supabase
      .channel(`duel-events-${duelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "duel_events",
          filter: `duel_id=eq.${duelId}`,
        },
        (payload) => {
          const next = payload.new as DuelEvent;
          setEvents((prev) => {
            if (prev.some((event) => event.id === next.id)) return prev;
            return [...prev, next].slice(-150);
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [duelId]);

  const logEvent = useCallback(
    async (eventType: string, message: string, payload: PublicEventPayload = {}) => {
      if (!duelId || !actorId) return;

      const { error } = await supabase.from("duel_events").insert({
        duel_id: duelId,
        actor_id: actorId,
        event_type: eventType,
        message,
        payload: sanitizePayload(payload),
      });

      if (error) {
        console.warn("[duel_events] insert skipped:", error.message);
      }
    },
    [duelId, actorId]
  );

  return { events, logEvent };
};
