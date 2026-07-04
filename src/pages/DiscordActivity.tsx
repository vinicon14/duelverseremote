/**
 * Discord Activity landing route.
 *
 * When Discord loads the Activity URL (/discord-activity) inside its iframe,
 * we initialize the Embedded App SDK (best-effort) and then hand the user off
 * to the full DuelVerse experience — no minimal shell anymore.
 */
import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useDiscordActivity } from "@/hooks/useDiscordActivity";

export default function DiscordActivity() {
  // Best-effort SDK handshake; ignored if it fails.
  useDiscordActivity(true);

  useEffect(() => {
    // Preserve any Discord query params so the auth page can still detect
    // the embed context and start the Discord login flow.
  }, []);

  const params = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  if (!params.has("redirect")) params.set("redirect", "duels");

  return <Navigate to={`/auth?${params.toString()}`} replace />;
}
