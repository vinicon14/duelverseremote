import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  // Origem para redirecionar de volta
  const appOrigin = url.searchParams.get("origin") || "https://duelverse.site";

  const redirectBack = (status: "success" | "error", message?: string) => {
    const target = new URL(`${appOrigin}/profile`);
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
    let parsedState: { user_id: string; nonce: string; ts: number };
    try {
      parsedState = JSON.parse(atob(state));
    } catch {
      return redirectBack("error", "invalid_state");
    }

    // Estado expira em 10 minutos
    if (Date.now() - parsedState.ts > 10 * 60 * 1000) {
      return redirectBack("error", "state_expired");
    }

    const clientId = Deno.env.get("DISCORD_CLIENT_ID")!;
    const clientSecret = Deno.env.get("DISCORD_CLIENT_SECRET")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const redirectUri = `${supabaseUrl}/functions/v1/discord-oauth-callback`;

    // Trocar código por token
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
      return redirectBack("error", "token_exchange_failed");
    }

    const tokenData = await tokenResp.json();
    const { access_token, refresh_token, expires_in } = tokenData;

    // Buscar dados do usuário Discord
    const userResp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!userResp.ok) {
      return redirectBack("error", "user_fetch_failed");
    }

    const discordUser = await userResp.json();
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
      : null;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verificar se este Discord ID já está vinculado a outra conta
    const { data: existing } = await supabase
      .from("discord_links")
      .select("user_id")
      .eq("discord_id", discordUser.id)
      .maybeSingle();

    if (existing && existing.user_id !== parsedState.user_id) {
      return redirectBack("error", "discord_already_linked");
    }

    // Upsert da vinculação
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
      return redirectBack("error", "save_failed");
    }

    return redirectBack("success");
  } catch (error: any) {
    console.error("discord-oauth-callback error:", error);
    return redirectBack("error", "internal_error");
  }
});
