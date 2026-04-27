import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OAuthState = {
  mode?: "link" | "login";
  user_id: string | null;
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

const sanitizeUsername = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 18) || `duelist${Math.floor(Math.random() * 100000)}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const redirectBack = (
    status: "success" | "error",
    message?: string,
    parsedState?: OAuthState,
    extra?: Record<string, string>,
  ) => {
    const target = getSafeTarget(parsedState?.origin, parsedState?.return_path);
    target.searchParams.set("discord", status);
    if (message) target.searchParams.set("message", message);
    if (extra) {
      for (const [k, v] of Object.entries(extra)) target.searchParams.set(k, v);
    }
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

    const mode: "link" | "login" = parsedState.mode === "login" ? "login" : "link";

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

    // ===========================
    // LOGIN MODE (entry point)
    // ===========================
    if (mode === "login") {
      const discordEmail: string | undefined = discordUser.email;
      if (!discordEmail) {
        return redirectBack("error", "discord_email_missing", parsedState);
      }

      // Look up an existing link first — that's the most reliable bridge
      let targetUserId: string | null = null;
      const { data: existingLink } = await supabase
        .from("discord_links")
        .select("user_id")
        .eq("discord_id", discordUser.id)
        .maybeSingle();
      if (existingLink?.user_id) targetUserId = existingLink.user_id;

      // Otherwise try to find an existing auth user by email
      if (!targetUserId) {
        const { data: byEmail } = await supabase.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        const match = byEmail?.users?.find(
          (u) => u.email?.toLowerCase() === discordEmail.toLowerCase(),
        );
        if (match) targetUserId = match.id;
      }

      // Create new user if still nothing found
      let isNewUser = false;
      if (!targetUserId) {
        const desiredUsername = sanitizeUsername(
          discordUser.global_name || discordUser.username || discordEmail.split("@")[0],
        );
        // Make sure username is unique in profiles
        let finalUsername = desiredUsername;
        for (let i = 0; i < 5; i++) {
          const { data: clash } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("username", finalUsername)
            .maybeSingle();
          if (!clash) break;
          finalUsername = `${desiredUsername}${Math.floor(Math.random() * 1000)}`;
        }

        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: discordEmail,
          email_confirm: true,
          user_metadata: {
            username: finalUsername,
            selected_tcg: "yugioh",
            via: "discord_oauth",
            discord_id: discordUser.id,
            avatar_url: avatarUrl,
          },
        });
        if (createErr || !created.user) {
          console.error("createUser error:", createErr);
          return redirectBack("error", "user_create_failed", parsedState);
        }
        targetUserId = created.user.id;
        isNewUser = true;
      }

      // Save / update the discord_links row so the bot integrations work
      await supabase
        .from("discord_links")
        .upsert({
          user_id: targetUserId,
          discord_id: discordUser.id,
          discord_username: discordUser.username,
          discord_global_name: discordUser.global_name || discordUser.username,
          discord_avatar_url: avatarUrl,
          discord_email: discordEmail,
          access_token,
          refresh_token,
          token_expires_at: new Date(Date.now() + (expires_in || 604800) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      // Generate a magic link / OTP we can hand to the browser to establish a session
      const target = getSafeTarget(parsedState.origin, parsedState.return_path);
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: discordEmail,
        options: {
          redirectTo: target.toString(),
        },
      });

      if (linkErr || !linkData) {
        console.error("generateLink error:", linkErr);
        return redirectBack("error", "magiclink_failed", parsedState);
      }

      // Prefer the email_otp + token_hash pair (works with verifyOtp on the client)
      const tokenHash = (linkData.properties as any)?.hashed_token;
      if (!tokenHash) {
        console.error("magiclink missing hashed_token", linkData);
        return redirectBack("error", "magiclink_no_hash", parsedState);
      }

      return redirectBack("success", undefined, parsedState, {
        flow: "login",
        token_hash: tokenHash,
        type: "magiclink",
        email: discordEmail,
        new_user: isNewUser ? "1" : "0",
      });
    }

    // ===========================
    // LINK MODE (existing flow)
    // ===========================
    if (!parsedState.user_id) {
      return redirectBack("error", "missing_user", parsedState);
    }

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
