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
 * Formato: "<username> @everyone remote <link>"
 *
 * O link aponta para `/join/:duelId` que faz redirecionamento inteligente:
 * - Se o usuário está no app nativo do DuelVerse → abre /duel/:id direto
 * - Se está no Discord (UA contém Discord) → fluxo simplificado / OAuth
 * - Caso contrário → site /duel/:id (pede login se necessário)
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
    // Smart link: rota /join/:id que decide o melhor destino
    const baseUrl = "https://duelverse.site";
    const joinLink = `${baseUrl}/join/${duelId}`;

    const roomLabel = roomName?.trim() ? ` "${roomName.trim()}"` : "";
    const message = `🎮 **${username}** criou uma nova sala${roomLabel}! @everyone remote ${joinLink}`;

    // 1. Postar no chat global (banco)
    const { error: chatError } = await supabase
      .from("global_chat_messages")
      .insert({
        user_id: userId,
        message,
        tcg_type: tcgType,
        language_code: languageCode,
      });
    if (chatError) console.warn("[announceDuelRoom] chat insert error:", chatError);

    // 2. Disparar para o Discord via bridge (envia para todos os servidores parceiros)
    try {
      await fetch(
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
          }),
        },
      );
    } catch (bridgeErr) {
      console.warn("[announceDuelRoom] discord bridge error:", bridgeErr);
    }
  } catch (err) {
    console.error("[announceDuelRoom] failed:", err);
  }
}
