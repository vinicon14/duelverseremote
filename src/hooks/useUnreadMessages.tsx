/**
 * DuelVerse - Mensagens não lidas
 * Conta mensagens privadas não lidas por remetente, com atualização em tempo real.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadMessages() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [userId, setUserId] = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("private_messages")
      .select("sender_id")
      .eq("receiver_id", uid)
      .eq("read", false);

    const map: Record<string, number> = {};
    (data || []).forEach((row: any) => {
      map[row.sender_id] = (map[row.sender_id] || 0) + 1;
    });
    setCounts(map);
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;
      setUserId(uid);
      await load(uid);

      channel = supabase
        .channel(`unread-messages-${uid}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "private_messages", filter: `receiver_id=eq.${uid}` },
          () => load(uid)
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [load]);

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const markAsRead = useCallback(
    async (senderId: string) => {
      if (!userId) return;
      await supabase
        .from("private_messages")
        .update({ read: true })
        .eq("receiver_id", userId)
        .eq("sender_id", senderId)
        .eq("read", false);
      setCounts((prev) => {
        const next = { ...prev };
        delete next[senderId];
        return next;
      });
    },
    [userId]
  );

  return { counts, total, markAsRead, unreadFrom: (id: string) => counts[id] || 0 };
}
