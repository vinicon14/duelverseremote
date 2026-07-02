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
    // Preserve any Discord query params so downstream code can still detect
    // the embed context; just swap the pathname to "/".
  }, []);

  const search = typeof window !== "undefined" ? window.location.search : "";
  return <Navigate to={`/${search}`} replace />;
}
