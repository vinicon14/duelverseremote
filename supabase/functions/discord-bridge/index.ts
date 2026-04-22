import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseJsonBody = async (req: Request) => {
  if (req.method !== "POST") return null;

  const rawBody = await req.text();
  if (!rawBody) return null;

  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const path = url.pathname;
    const body = await parseJsonBody(req);

    const requestType = typeof body?.type === "string" ? body.type : null;
    const content = body?.content ?? body?.message?.content ?? null;
    const discordUserId = body?.author?.id ?? body?.message?.author?.id ?? body?.discord_user_id ?? null;
    const discordUsername = body?.author?.username ?? body?.message?.author?.username ?? body?.username ?? "Discord User";
    const discordAvatar = body?.author?.avatar_url ?? body?.message?.author?.avatar_url ?? body?.avatar_url ?? null;

    const isDiscordWebhook =
      path.endsWith("/webhook") ||
      path.includes("discord-webhook") ||
      url.searchParams.get("source") === "discord" ||
      Boolean(body?.content && (body?.author || body?.message));

    // Check if this is a Discord webhook message (from Discord -> DuelVerse)
    // Discord webhook payload has 'content' and optionally 'author' (with id, username, bot flag)
    // Also check if source=discord query param is present
    const sourceFromDiscord = url.searchParams.get("source") === "discord";
    const hasDiscordAuthor = (body?.author?.id || body?.message?.author?.id);
    const isFromDiscord = (sourceFromDiscord || isDiscordWebhook) && body?.content;

    console.log(
      `[discord-bridge] ${req.method} path=${path} isWebhook=${isDiscordWebhook} isFromDiscord=${isFromDiscord} sourceFromDiscord=${sourceFromDiscord} hasAuthorId=${hasDiscordAuthor} type=${requestType ?? "none"} author=${discordUserId ?? "none"}`,
    );

    // Handle Discord -> DuelVerse messages
    if (isFromDiscord && body?.content) {
      // Loop protection: Ignore messages from bots or our own bridge
      const isBot = body?.author?.bot === true || body?.message?.author?.bot === true;
      if (isBot || discordUsername.includes("DuelVerse")) {
        console.log(`[discord-bridge] loop protection: skipped message from ${discordUsername} (bot=${isBot})`);
        return jsonResponse({ ok: true, skipped: "loop_protection" });
      }

      if (!content) {
        return jsonResponse({ ok: true, skipped: "no_content" });
      }

      // If no discord user ID, use the username as identifier (for unlinked users)
      const effectiveDiscordUserId = discordUserId || discordUsername;

      const normalizedContent = String(content).trim();
      if (!normalizedContent) {
        return jsonResponse({ ok: true, skipped: "empty_content" });
      }

      const { data: linkedUser, error: linkedUserError } = await supabase.rpc("get_user_by_discord_id", {
        p_discord_id: String(effectiveDiscordUserId),
      });

      if (linkedUserError) {
        console.error("[discord-bridge] lookup error:", linkedUserError);
        return jsonResponse({ error: linkedUserError.message }, 500);
      }

      let userIdToUse;
      let usernameLabel;
      let finalContent = normalizedContent;

      if (linkedUser && linkedUser.length > 0) {
        userIdToUse = linkedUser[0].user_id;
        usernameLabel = linkedUser[0].username;
      } else {
        // Fallback for unlinked users: Find the first available profile to use as a placeholder
        const { data: fallbackProfiles } = await supabase
          .from("profiles")
          .select("user_id, username")
          .limit(1);
        
        if (fallbackProfiles && fallbackProfiles.length > 0) {
          userIdToUse = fallbackProfiles[0].user_id;
          usernameLabel = `Discord: ${discordUsername}`;
          finalContent = `[Discord: ${discordUsername}] ${normalizedContent}`;
        } else {
          console.log(`[discord-bridge] no profiles found for fallback`);
          return jsonResponse({ ok: true, skipped: "no_profiles_available" });
        }
      }

      const tcgType = typeof body?.tcg_type === "string" ? body.tcg_type : "yugioh";
      const languageCode = typeof body?.language_code === "string" ? body.language_code : "en";

      const { error } = await supabase.from("global_chat_messages").insert({
        user_id: userIdToUse,
        message: finalContent,
        tcg_type: tcgType,
        language_code: languageCode,
      });

      if (error) {
        console.error("[discord-bridge] insert error:", error);
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({
        success: true,
        posted_as: usernameLabel,
        discord_username: discordUsername,
        discord_avatar_url: discordAvatar,
      });
    }

    if (!body) {
      return jsonResponse({ error: "Invalid or missing JSON body" }, 400);
    }

    const { type, username, channelId, botToken, avatarUrl, userId } = body;

    if (type === "create_webhook") {
      if (!channelId || !botToken) {
        return jsonResponse({ error: "Missing channelId or botToken" }, 400);
      }

      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "DuelVerse Global Chat", avatar: null }),
      });

      const data = await response.json();
      return jsonResponse(data, response.ok ? 200 : 400);
    }

    const { data: cfg } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();

    let botStatus: { status: string; inviteLink: string; servers: any[] } = {
      status: "",
      inviteLink: "",
      servers: [],
    };

    if (cfg?.value) {
      try {
        botStatus = typeof cfg.value === "string" ? JSON.parse(cfg.value) : cfg.value;
      } catch {
        botStatus = { status: "", inviteLink: "", servers: [] };
      }
    }

    if (type === "chat_to_discord") {
      const servers = Array.isArray(botStatus.servers) ? botStatus.servers : [];
      const activeServers = servers.filter((server: any) => server.enabled && server.webhookUrl);
      const urls: string[] = activeServers.map((server: any) => server.webhookUrl);

      console.log(`[discord-bridge] chat_to_discord: found ${urls.length} active webhooks`);

      if (urls.length === 0) {
        return jsonResponse({ error: "No active Discord server configured" }, 400);
      }

      let finalUsername = username;
      let finalAvatar = avatarUrl;

      if (userId) {
        const { data: discordLink } = await supabase.rpc("get_discord_link_for_user", { p_user_id: userId });
        if (discordLink && discordLink.length > 0) {
          finalUsername = discordLink[0].discord_username || username;
          finalAvatar = discordLink[0].discord_avatar_url || avatarUrl;
        }
      }

      const webhookPayload = {
        content: body.content,
        username: finalUsername || "DuelVerse Player",
        avatar_url: finalAvatar || undefined,
        allowed_mentions: { parse: ["users"] },
      };

      const results: Array<{ ok: boolean; url: string; status?: number }> = [];
      for (const targetUrl of urls) {
        try {
          const response = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });
          results.push({ ok: response.ok, url: targetUrl, status: response.status });
          console.log(`[discord-bridge] webhook sent to ${targetUrl.substring(0, 40)}... status=${response.status}`);
        } catch (err) {
          console.error(`[discord-bridge] webhook error for ${targetUrl}:`, err);
          results.push({ ok: false, url: targetUrl });
        }
      }

      return jsonResponse({
        success: results.some((result) => result.ok),
        results,
      });
    }

    if (type === "get_config") {
      const servers = Array.isArray(botStatus.servers) ? botStatus.servers : [];
      let inviteLink = botStatus.inviteLink;
      if (!inviteLink && servers.length > 0) {
        const serverWithLink = servers.find((server: any) => server.inviteLink);
        inviteLink = serverWithLink ? serverWithLink.inviteLink : inviteLink;
      }

      const bridgeEnabled = servers.some((server: any) => server.enabled && server.webhookUrl);
      console.log(`[discord-bridge] get_config: bridgeEnabled=${bridgeEnabled}`);
      return jsonResponse({ inviteLink, bridgeEnabled });
    }

    return jsonResponse({ error: "Invalid request type: " + type }, 400);
  } catch (error: any) {
    console.error("[discord-bridge] critical error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});