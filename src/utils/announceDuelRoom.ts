import { supabase } from "@/integrations/supabase/client";

interface AnnounceParams {
  duelId: string;
  username: string;
  avatarUrl?: string | null;
  userId: string;
  tcgType: string;
  languageCode?: string;
  roomName?: string | null;
}

/**
 * Anuncia uma nova DuelRoom no chat global e no Discord.
 *
 * - Chat global: mensagem efêmera (apagada após poucos segundos) só para
 *   disparar realtime/notificações.
 * - Discord: mensagem PERSISTENTE — fica no canal até a sala ser fechada.
 *   Quando a sala fechar (`endDuel` / delete em Duels.tsx), as mensagens
 *   são apagadas via `cleanup_duel_messages` no edge function.
 */
export async function announceDuelRoom({
  duelId,
  username,
  avatarUrl,
  userId,
  tcgType,
  languageCode = "en",
  roomName,
}: AnnounceParams): Promise<void> {
  try {
    const baseUrl = "https://duelverse.site";
    const joinLink = `${baseUrl}/join/${duelId}`;

    const roomLabel = roomName?.trim() ? ` "${roomName.trim()}"` : "";
    const message = `🎮 **${username}** criou uma nova sala${roomLabel}! @everyone remote ${joinLink}`;

    // 1. Chat global (efêmero)
    const { data: chatRow, error: chatError } = await supabase
      .from("global_chat_messages")
      .insert({
        user_id: userId,
        message,
        tcg_type: tcgType,
        language_code: languageCode,
      })
      .select("id")
      .maybeSingle();
    if (chatError) console.warn("[announceDuelRoom] chat insert error:", chatError);

    if (chatRow?.id) {
      setTimeout(() => {
        supabase
          .from("global_chat_messages")
          .delete()
          .eq("id", chatRow.id)
          .then(({ error }) => {
            if (error) console.warn("[announceDuelRoom] chat cleanup error:", error);
          });
      }, 8000);
    }

    // 2. Discord — mensagem persistente, capturando IDs para cleanup posterior
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-bridge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "chat_to_discord",
            content: `@everyone remote — ${username} criou uma nova sala${roomLabel}! Entre agora: ${joinLink}`,
            username,
            avatarUrl,
            userId,
            captureMessageIds: true,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      const posted: Array<{ webhookUrl: string; messageId: string }> = Array.isArray(json?.results)
        ? json.results
            .filter((r: any) => r?.ok && r?.messageId && r?.url)
            .map((r: any) => ({ webhookUrl: r.url, messageId: r.messageId }))
        : [];

      if (posted.length > 0) {
        await supabase
          .from("live_duels")
          .update({ discord_messages: posted } as any)
          .eq("id", duelId);
      }
    } catch (bridgeErr) {
      console.warn("[announceDuelRoom] discord bridge error:", bridgeErr);
    }
  } catch (err) {
    console.error("[announceDuelRoom] failed:", err);
  }
}

/**
 * Apaga as mensagens do Discord postadas para anunciar uma sala.
 * Deve ser chamado quando a sala for fechada (endDuel / delete).
 */
export async function cleanupDuelDiscordMessages(duelId: string): Promise<void> {
  try {
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-bridge`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "cleanup_duel_messages", duelId }),
      },
    );
  } catch (err) {
    console.warn("[cleanupDuelDiscordMessages] failed:", err);
  }
}
