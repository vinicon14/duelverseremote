/**
 * Discord Activity (Embedded App) — minimized DuelVerse view.
 *
 * This route is what Discord loads inside the Activity iframe when a user
 * clicks "Play DuelVerse" in a voice/text channel. It shows the DuelVerse
 * brand and a live online counter (DuelVerse sessions + linked Discord users).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDiscordActivity } from "@/hooks/useDiscordActivity";

const fetchOnlineTotal = async (): Promise<number> => {
  // Sum of online DuelVerse profiles + linked Discord accounts (distinct).
  // We do two cheap counts; combine on the client.
  const [{ count: duelverseOnline }, { count: linked }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("is_online", true),
    supabase
      .from("discord_links")
      .select("user_id", { count: "exact", head: true }),
  ]);

  // Online total = active DuelVerse sessions + total linked Discord
  // (matches the bot's stats-channel counter behavior).
  return (duelverseOnline ?? 0) + (linked ?? 0);
};

export default function DiscordActivity() {
  const { isDiscord, ready, user, error } = useDiscordActivity(true);
  const [online, setOnline] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const n = await fetchOnlineTotal().catch(() => null);
      if (mounted && n !== null) setOnline(n);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-6 text-center select-none">
      <div className="flex flex-col items-center gap-6 max-w-md">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/30 blur-3xl rounded-full animate-pulse" />
          <img
            src="/icons/icon-512x512.png"
            alt="DuelVerse"
            className="relative w-32 h-32 rounded-3xl shadow-2xl ring-2 ring-primary/40"
          />
        </div>

        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            DuelVerse
          </h1>
          <p className="text-sm text-muted-foreground">
            {isDiscord ? "Activity ativa no Discord" : "Janela do DuelVerse"}
          </p>
        </div>

        <div className="w-full rounded-2xl border border-border/50 bg-card/60 backdrop-blur px-6 py-5 shadow-lg">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Jogadores online agora
          </p>
          <p className="text-5xl font-extrabold text-foreground tabular-nums">
            {online === null ? "—" : online.toLocaleString()}
          </p>
          <p className="text-[11px] text-muted-foreground mt-2">
            DuelVerse + servidores Discord vinculados
          </p>
        </div>

        {ready && user && (
          <p className="text-xs text-muted-foreground">
            Conectado como{" "}
            <span className="text-foreground font-medium">
              {user.global_name || user.username}
            </span>
          </p>
        )}

        {ready && error && (
          <p className="text-[11px] text-destructive/80 max-w-xs">
            {error}
          </p>
        )}

        <a
          href="https://duelverse.site"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline"
        >
          Abrir DuelVerse completo →
        </a>
      </div>
    </div>
  );
}
