/**
 * useDiscordPresence
 * When the user is logged in to DuelVerse and has a linked Discord account,
 * adds a "🎮 Jogando DuelVerse" role on the configured Discord servers.
 * Removes the role on logout / tab close.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const callPresence = async (playing: boolean) => {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return;
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-presence`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ playing }),
    });
  } catch (err) {
    console.warn("[discord-presence] failed:", err);
  }
};

const refreshOnlineCounter = async () => {
  try {
    await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-presence-counter`,
      {
        method: "POST",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({}),
      },
    );
  } catch (err) {
    console.warn("[discord-presence-counter] failed:", err);
  }
};

export const useDiscordPresence = (userId: string | undefined) => {
  useEffect(() => {
    if (!userId) return;
    callPresence(true);

    const handleUnload = () => {
      // Best-effort: notify presence off
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-presence`;
        const blob = new Blob(
          [JSON.stringify({ playing: false })],
          { type: "application/json" },
        );
        // sendBeacon doesn't allow custom auth headers — fall back to fetch keepalive
        navigator.sendBeacon?.(url, blob);
      } catch { /* ignore */ }
      callPresence(false);
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      callPresence(false);
    };
  }, [userId]);
};
