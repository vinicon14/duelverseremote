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

const isInsideDiscord = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("frame_id") || params.has("instance_id");
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
        const projectId = (import.meta as any).env.VITE_SUPABASE_PROJECT_ID;
        const tokenEndpoint = `https://${projectId}.supabase.co/functions/v1/discord-activity-token`;

        // Fetch the public DISCORD_CLIENT_ID from our edge function so we
        // don't need to hardcode/expose it through Vite env at build time.
        const cfgRes = await fetch(tokenEndpoint, { method: "GET" });
        const cfg = await cfgRes.json();
        const clientId: string = cfg?.client_id;
        if (!clientId) throw new Error("missing_client_id");

        const { DiscordSDK } = await import("@discord/embedded-app-sdk");
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
      } catch (err: any) {
        console.error("[useDiscordActivity] init failed", err);
        if (cancelled) return;
        setState({
          isDiscord: true,
          ready: true,
          user: null,
          error: err?.message || "discord_init_error",
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
