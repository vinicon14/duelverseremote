import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OAuthState = {
  user_id: string;
  nonce: string;
  ts: number;
  origin?: string;
  return_path?: string;
};

const getSafeTarget = (origin?: string, returnPath?: string) => {
  const safeOrigin = typeof origin === "string" && /^https?:\/\//.test(origin)
    ? origin
    : "https://duelverse.site";
  const safeReturnPath = typeof returnPath === "string" && returnPath.startsWith("/")
    ? returnPath
    : "/profile";

  try {
    return new URL(safeReturnPath, safeOrigin);
  } catch {
    return new URL("/profile", "https://duelverse.site");
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const redirectBack = (status: "success" | "error", message?: string, parsedState?: OAuthState) => {
    const target = getSafeTarget(parsedState?.origin, parsedState?.return_path);
    target.searchParams.set("discord", status);
    if (message) target.searchParams.set("message", message);
    return Response.redirect(target.toString(), 302);
  };

  if (errorParam) {
    return redirectBack("error", errorParam);
  }

  if (!code || !state) {
    return redirectBack("error", "missing_params");
  }

  try {
    let parsedState: OAuthState;
    try {
      parsedState = JSON.parse(atob(state));
    } catch {
      return redirectBack("error", "invalid_state");
    }

    if (Date.now() - parsedState.ts > 10 * 60 * 1000) {
      return redirectBack("error", "state_expired", parsedState);
    }

    const clientId = Deno.env.get("DISCORD_CLIENT_ID")!;
    const clientSecret = Deno.env.get("DISCORD_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const redirectUri = `${supabaseUrl}/functions/v1/discord-oauth-callback`;

    const tokenResp = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error("Token exchange failed:", errText);
      return redirectBack("error", "token_exchange_failed", parsedState);
    }

    const tokenData = await tokenResp.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    const userResp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userResp.ok) {
      return redirectBack("error", "user_fetch_failed", parsedState);
    }

    const discordUser = await userResp.json();
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
      : null;

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: existing } = await supabase
      .from("discord_links")
      .select("user_id")
      .eq("discord_id", discordUser.id)
      .maybeSingle();

    if (existing && existing.user_id !== parsedState.user_id) {
      return redirectBack("error", "discord_already_linked", parsedState);
    }

    const { error: upsertError } = await supabase
      .from("discord_links")
      .upsert({
        user_id: parsedState.user_id,
        discord_id: discordUser.id,
        discord_username: discordUser.username,
        discord_global_name: discordUser.global_name || discordUser.username,
        discord_avatar_url: avatarUrl,
        discord_email: discordUser.email,
        access_token,
        refresh_token,
        token_expires_at: new Date(Date.now() + (expires_in || 604800) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return redirectBack("error", "save_failed", parsedState);
    }

    return redirectBack("success", undefined, parsedState);
  } catch (error: any) {
    console.error("discord-oauth-callback error:", error);
    return redirectBack("error", "internal_error");
  }
});