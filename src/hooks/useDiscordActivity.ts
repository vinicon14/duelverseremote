/**
 * useDiscordActivity
 * Detects whether the app is running inside a Discord Embedded App (Activity)
 * and initializes the SDK + OAuth handshake when so.
 *
 * Detection: Discord injects ?frame_id= and ?instance_id= query params when
 * loading the Activity URL inside its proxied iframe.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DiscordActivityUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface DiscordActivityState {
  isDiscord: boolean;
  ready: boolean;
  user: DiscordActivityUser | null;
  error: string | null;
}

type DiscordUrlMapping = { prefix: string; target: string };
type PatchUrlMappings = (mappings: DiscordUrlMapping[]) => void;

const isInsideDiscord = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("frame_id") || params.has("instance_id");
};

const getDiscordActivityTokenEndpoint = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/discord-activity-token`;
};

const patchDiscordMappingsIfConfigured = (patchUrlMappings: PatchUrlMappings) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabasePrefix = import.meta.env.VITE_DISCORD_SUPABASE_MAPPING_PREFIX;

  if (!supabaseUrl || !supabasePrefix || typeof patchUrlMappings !== "function") return;

  try {
    const target = new URL(supabaseUrl).host;
    patchUrlMappings([{ prefix: supabasePrefix, target }]);
  } catch (err) {
    console.warn("[useDiscordActivity] mapping patch skipped", err);
  }
};

export function useDiscordActivity(enabled: boolean = true): DiscordActivityState {
  const [state, setState] = useState<DiscordActivityState>({
    isDiscord: false,
    ready: false,
    user: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;
    if (!isInsideDiscord()) {
      setState((s) => ({ ...s, isDiscord: false, ready: true }));
      return;
    }

    setState((s) => ({ ...s, isDiscord: true }));

    let cancelled = false;
    (async () => {
      try {
        const tokenEndpoint = getDiscordActivityTokenEndpoint();
        if (!tokenEndpoint) throw new Error("missing_supabase_url");

        const { DiscordSDK, patchUrlMappings } = await import("@discord/embedded-app-sdk");
        patchDiscordMappingsIfConfigured(patchUrlMappings);

        // Fetch the public DISCORD_CLIENT_ID from our edge function so we
        // don't need to hardcode/expose it through Vite env at build time.
        const cfgRes = await fetch(tokenEndpoint, { method: "GET" });
        const cfg = await cfgRes.json();
        const clientId: string = cfg?.client_id;
        if (!clientId) throw new Error("missing_client_id");

        const sdk = new DiscordSDK(clientId);
        await sdk.ready();

        // OAuth: ask user to authorize, exchange code for token via our edge function
        const { code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify"],
        });

        const tokenRes = await fetch(tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenRes.ok || !tokenData.access_token) {
          throw new Error(tokenData?.error || "token_exchange_failed");
        }

        const auth = await sdk.commands.authenticate({
          access_token: tokenData.access_token,
        });

        if (cancelled) return;

        setState({
          isDiscord: true,
          ready: true,
          user: auth.user as DiscordActivityUser,
          error: null,
        });
      } catch (err: unknown) {
        console.error("[useDiscordActivity] init failed", err);
        if (cancelled) return;
        setState({
          isDiscord: true,
          ready: true,
          user: null,
          error: err instanceof Error ? err.message : "discord_init_error",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}

export const isRunningInsideDiscord = isInsideDiscord;
