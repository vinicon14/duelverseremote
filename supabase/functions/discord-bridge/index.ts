import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";

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

async function discordFetch(path: string, init: RequestInit = {}) {
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) throw new Error("DISCORD_BOT_TOKEN not configured");
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

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
    const discordUserId =
      body?.author?.id ?? body?.message?.author?.id ?? body?.discord_user_id ?? null;
    const discordUsername =
      body?.author?.username ?? body?.message?.author?.username ?? body?.username ?? "Discord User";
    const discordAvatar =
      body?.author?.avatar_url ?? body?.message?.author?.avatar_url ?? body?.avatar_url ?? null;

    const isDiscordWebhook =
      path.endsWith("/webhook") ||
      path.includes("discord-webhook") ||
      url.searchParams.get("source") === "discord" ||
      Boolean(body?.discord_user_id && body?.content) ||
      Boolean(body?.content && (body?.author || body?.message));

    console.log(
      `[discord-bridge] ${req.method} path=${path} isWebhook=${isDiscordWebhook} type=${
        requestType ?? "none"
      } author=${discordUserId ?? "none"}`,
    );

    // ============================================================
    // Discord -> DuelVerse: incoming chat message from the Java bot
    // ============================================================
    if (isDiscordWebhook && content && !requestType) {
      // Loop protection: only skip explicit bots
      const isBot = body?.author?.bot === true || body?.message?.author?.bot === true;
      if (isBot) {
        console.log(`[discord-bridge] loop protection: skipped bot message from ${discordUsername}`);
        return jsonResponse({ ok: true, skipped: "bot" });
      }

      if (!discordUserId) {
        console.log(`[discord-bridge] skipped: no discord user id`);
        return jsonResponse({ ok: true, skipped: "no_discord_user_id" });
      }

      const normalizedContent = String(content).trim();
      if (!normalizedContent) {
        return jsonResponse({ ok: true, skipped: "empty_content" });
      }

      // Require linked DuelVerse account via OAuth
      const { data: linkedUser, error: linkedUserError } = await supabase.rpc(
        "get_user_by_discord_id",
        { p_discord_id: String(discordUserId) },
      );

      if (linkedUserError) {
        console.error("[discord-bridge] lookup error:", linkedUserError);
        return jsonResponse({ error: linkedUserError.message }, 500);
      }

      if (!linkedUser || linkedUser.length === 0) {
        console.log(
          `[discord-bridge] skipped: discord user ${discordUserId} (${discordUsername}) is not linked to a DuelVerse account`,
        );
        return jsonResponse({ ok: true, skipped: "user_not_linked" });
      }

      const userIdToUse = linkedUser[0].user_id;
      const usernameLabel = linkedUser[0].username;

      const tcgType = typeof body?.tcg_type === "string" ? body.tcg_type : "yugioh";
      const languageCode = typeof body?.language_code === "string" ? body.language_code : "en";

      const { error } = await supabase.from("global_chat_messages").insert({
        user_id: userIdToUse,
        message: normalizedContent,
        tcg_type: tcgType,
        language_code: languageCode,
      });

      if (error) {
        console.error("[discord-bridge] insert error:", error);
        return jsonResponse({ error: error.message }, 500);
      }

      console.log(
        `[discord-bridge] posted message from Discord user ${discordUsername} as DuelVerse user ${usernameLabel}`,
      );

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

    // ============================================================
    // List guilds the bot is in (with their text channels)
    // ============================================================
    if (requestType === "list_guilds") {
      const guildsRes = await discordFetch("/users/@me/guilds");
      if (!guildsRes.ok) {
        return jsonResponse(
          { error: "Failed to list guilds", details: guildsRes.data },
          guildsRes.status,
        );
      }

      const guilds: any[] = Array.isArray(guildsRes.data) ? guildsRes.data : [];
      const result: Array<{ guildId: string; guildName: string; channels: Array<{ id: string; name: string }> }> = [];

      for (const g of guilds) {
        const chRes = await discordFetch(`/guilds/${g.id}/channels`);
        const channels: any[] = chRes.ok && Array.isArray(chRes.data) ? chRes.data : [];
        result.push({
          guildId: g.id,
          guildName: g.name,
          channels: channels
            .filter((c) => c.type === 0) // 0 = GUILD_TEXT
            .map((c) => ({ id: c.id, name: c.name })),
        });
      }

      return jsonResponse({ success: true, guilds: result });
    }

    // ============================================================
    // Auto-setup a server: webhook + invite + persist to settings
    // ============================================================
    if (requestType === "auto_setup_server") {
      const guildId = body?.guildId;
      const channelId = body?.channelId;
      if (!guildId || !channelId) {
        return jsonResponse({ error: "Missing guildId or channelId" }, 400);
      }

      // 1. Get guild name
      const guildRes = await discordFetch(`/guilds/${guildId}`);
      if (!guildRes.ok) {
        return jsonResponse(
          { error: "Failed to fetch guild", details: guildRes.data },
          guildRes.status,
        );
      }
      const guildName = guildRes.data?.name || `Server ${guildId}`;

      // 2. Create webhook
      const webhookRes = await discordFetch(`/channels/${channelId}/webhooks`, {
        method: "POST",
        body: JSON.stringify({ name: "DuelVerse Global Chat" }),
      });
      if (!webhookRes.ok) {
        return jsonResponse(
          { error: "Failed to create webhook", details: webhookRes.data },
          webhookRes.status,
        );
      }
      const webhookUrl = `https://discord.com/api/webhooks/${webhookRes.data.id}/${webhookRes.data.token}`;

      // 3. Create invite (never-expiring)
      const inviteRes = await discordFetch(`/channels/${channelId}/invites`, {
        method: "POST",
        body: JSON.stringify({ max_age: 0, max_uses: 0, unique: false }),
      });
      const inviteLink = inviteRes.ok
        ? `https://discord.gg/${inviteRes.data.code}`
        : `https://discord.gg/${channelId}`;

      // 4. Persist to system_settings
      const { data: cfg } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "discord_bot_status")
        .maybeSingle();

      let status: any = {
        botId: "1495723127357833256",
        botName: "duelverse",
        inviteLink,
        duelverseUrl: "https://duelverse.site",
        status: "online",
        servers: [],
      };
      if (cfg?.value) {
        try {
          status = typeof cfg.value === "string" ? JSON.parse(cfg.value) : cfg.value;
        } catch {
          /* keep default */
        }
      }

      const servers: any[] = Array.isArray(status.servers) ? status.servers : [];
      const filtered = servers.filter((s: any) => s.id !== guildId);
      filtered.push({
        id: guildId,
        name: guildName,
        enabled: true,
        channelId,
        inviteLink,
        webhookUrl,
      });
      status.servers = filtered;

      const { error: upsertErr } = await supabase
        .from("system_settings")
        .upsert({ key: "discord_bot_status", value: JSON.stringify(status) }, { onConflict: "key" });

      if (upsertErr) {
        return jsonResponse({ error: upsertErr.message }, 500);
      }

      return jsonResponse({
        success: true,
        server: {
          id: guildId,
          name: guildName,
          enabled: true,
          channelId,
          inviteLink,
          webhookUrl,
        },
      });
    }

    // ============================================================
    // Legacy create_webhook (kept for backwards compatibility)
    // ============================================================
    if (requestType === "create_webhook") {
      const { channelId, botToken } = body;
      if (!channelId) {
        return jsonResponse({ error: "Missing channelId" }, 400);
      }
      const tokenToUse = botToken || Deno.env.get("DISCORD_BOT_TOKEN");
      if (!tokenToUse) {
        return jsonResponse({ error: "No bot token available" }, 400);
      }
      const response = await fetch(`${DISCORD_API}/channels/${channelId}/webhooks`, {
        method: "POST",
        headers: {
          Authorization: `Bot ${tokenToUse}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "DuelVerse Global Chat", avatar: null }),
      });
      const data = await response.json();
      return jsonResponse(data, response.ok ? 200 : 400);
    }

    // ============================================================
    // Read current bot status
    // ============================================================
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

    // ============================================================
    // DuelVerse -> Discord
    // ============================================================
    if (requestType === "chat_to_discord") {
      const { username, avatarUrl, userId } = body;
      const servers = Array.isArray(botStatus.servers) ? botStatus.servers : [];
      const activeServers = servers.filter((server: any) => server.enabled && server.webhookUrl);
      const urls: string[] = activeServers.map((server: any) => server.webhookUrl);

      if (urls.length === 0) {
        return jsonResponse({ error: "No active Discord server configured" }, 400);
      }

      let finalUsername = username;
      let finalAvatar = avatarUrl;

      if (userId) {
        const { data: discordLink } = await supabase.rpc("get_discord_link_for_user", {
          p_user_id: userId,
        });
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
        } catch (err) {
          console.error(`[discord-bridge] webhook error for ${targetUrl}:`, err);
          results.push({ ok: false, url: targetUrl });
        }
      }

      return jsonResponse({ success: results.some((r) => r.ok), results });
    }

    if (requestType === "get_config") {
      const servers = Array.isArray(botStatus.servers) ? botStatus.servers : [];
      let inviteLink = botStatus.inviteLink;
      if (!inviteLink && servers.length > 0) {
        const serverWithLink = servers.find((server: any) => server.inviteLink);
        inviteLink = serverWithLink ? serverWithLink.inviteLink : inviteLink;
      }
      const bridgeEnabled = servers.some((server: any) => server.enabled && server.webhookUrl);
      return jsonResponse({ inviteLink, bridgeEnabled });
    }

    return jsonResponse({ error: "Invalid request type: " + requestType }, 400);
  } catch (error: any) {
    console.error("[discord-bridge] critical error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});
