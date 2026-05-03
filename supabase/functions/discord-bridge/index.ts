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

const scheduleWebhookMessageDeletion = (
  webhookUrl: string,
  messageId: string | undefined | null,
  delayMs = 8000,
) => {
  if (!messageId) return;
  const task = (async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const res = await fetch(`${webhookUrl}/messages/${messageId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        const txt = await res.text().catch(() => "");
        console.error(
          `[discord-bridge] delete failed status=${res.status} body=${txt.slice(0, 200)}`,
        );
      } else {
        console.log(`[discord-bridge] deleted ephemeral webhook message ${messageId}`);
      }
    } catch (err) {
      console.error("[discord-bridge] failed to delete ephemeral webhook message:", err);
    }
  })();
  // @ts-ignore - EdgeRuntime is provided by the Supabase edge runtime
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
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

      // Try linked DuelVerse account first, but still allow pure Discord-origin messages
      const { data: linkedUser, error: linkedUserError } = await supabase.rpc(
        "get_user_by_discord_id",
        { p_discord_id: String(discordUserId) },
      );

      if (linkedUserError) {
        console.error("[discord-bridge] lookup error:", linkedUserError);
        return jsonResponse({ error: linkedUserError.message }, 500);
      }

      const hasLinkedUser = Boolean(linkedUser && linkedUser.length > 0);
      const userIdToUse = hasLinkedUser ? linkedUser[0].user_id : null;
      const usernameLabel = hasLinkedUser ? linkedUser[0].username : null;

      const tcgType = typeof body?.tcg_type === "string" ? body.tcg_type : "yugioh";
      const languageCode = typeof body?.language_code === "string" ? body.language_code : "en";

      const { error } = await supabase.from("global_chat_messages").insert({
        user_id: userIdToUse,
        message: normalizedContent,
        tcg_type: tcgType,
        language_code: languageCode,
        source_type: "discord",
        source_username: discordUsername,
        source_avatar_url: discordAvatar,
        discord_user_id: String(discordUserId),
      });

      if (error) {
        console.error("[discord-bridge] insert error:", error);
        return jsonResponse({ error: error.message }, 500);
      }

      console.log(hasLinkedUser
        ? `[discord-bridge] posted message from Discord user ${discordUsername} linked to DuelVerse user ${usernameLabel}`
        : `[discord-bridge] posted message from unlinked Discord user ${discordUsername} directly into global chat`);

      return jsonResponse({
        success: true,
        posted_as: discordUsername,
        linked_duelverse_user: usernameLabel,
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
      const result: Array<{
        guildId: string;
        guildName: string;
        iconUrl: string | null;
        channels: Array<{ id: string; name: string }>;
        voiceChannels: Array<{ id: string; name: string }>;
      }> = [];

      for (const g of guilds) {
        const chRes = await discordFetch(`/guilds/${g.id}/channels`);
        const channels: any[] = chRes.ok && Array.isArray(chRes.data) ? chRes.data : [];
        const iconUrl = g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${g.icon.startsWith("a_") ? "gif" : "png"}?size=256`
          : null;
        result.push({
          guildId: g.id,
          guildName: g.name,
          iconUrl,
          channels: channels
            .filter((c) => c.type === 0) // GUILD_TEXT
            .map((c) => ({ id: c.id, name: c.name })),
          voiceChannels: channels
            .filter((c) => c.type === 2) // GUILD_VOICE
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
      const voiceChannelIds: string[] = Array.isArray(body?.voiceChannelIds)
        ? body.voiceChannelIds.filter((v: any) => typeof v === "string")
        : [];
      if (!guildId || !channelId) {
        return jsonResponse({ error: "Missing guildId or channelId" }, 400);
      }

      // 1. Get guild name + icon
      const guildRes = await discordFetch(`/guilds/${guildId}`);
      if (!guildRes.ok) {
        return jsonResponse(
          { error: "Failed to fetch guild", details: guildRes.data },
          guildRes.status,
        );
      }
      const guildName = guildRes.data?.name || `Server ${guildId}`;
      const guildIcon = guildRes.data?.icon as string | null | undefined;
      const autoIconUrl = guildIcon
        ? `https://cdn.discordapp.com/icons/${guildId}/${guildIcon}.${guildIcon.startsWith("a_") ? "gif" : "png"}?size=256`
        : null;

      // 2. Create webhook (text channel)
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

      // 3. Create invite (never-expiring) for the text channel
      const inviteRes = await discordFetch(`/channels/${channelId}/invites`, {
        method: "POST",
        body: JSON.stringify({ max_age: 0, max_uses: 0, unique: false }),
      });
      const inviteLink = inviteRes.ok
        ? `https://discord.gg/${inviteRes.data.code}`
        : `https://discord.gg/${channelId}`;

      // 4. Auto-create a voice "stats" channel that displays the live online counter.
      //    Voice channels can't be joined by regular members for stats display, so we
      //    deny CONNECT permission for @everyone (id == guildId) but allow VIEW_CHANNEL.
      //    CONNECT = 0x0000000000100000 (1048576), VIEW_CHANNEL = 0x0000000000000400 (1024)
      let statsChannelId: string | null = null;
      try {
        // Reuse pre-existing DuelVerse stats channel if a previous setup created it
        const existingChannelsRes = await discordFetch(`/guilds/${guildId}/channels`);
        if (existingChannelsRes.ok && Array.isArray(existingChannelsRes.data)) {
          const found = existingChannelsRes.data.find(
            (c: any) => c.type === 2 && typeof c.name === "string" && c.name.startsWith("👥 Online:"),
          );
          if (found) statsChannelId = found.id;
        }
        if (!statsChannelId) {
          const statsRes = await discordFetch(`/guilds/${guildId}/channels`, {
            method: "POST",
            body: JSON.stringify({
              name: "👥 Online: 0",
              type: 2, // GUILD_VOICE
              position: 0,
              permission_overwrites: [
                {
                  id: guildId, // @everyone role id == guild id
                  type: 0, // role
                  allow: "1024", // VIEW_CHANNEL
                  deny: "1048576", // CONNECT — display only
                },
              ],
            }),
          });
          if (statsRes.ok && statsRes.data?.id) {
            statsChannelId = statsRes.data.id;
          } else {
            console.error("[discord-bridge] failed to create stats channel:", statsRes.data);
          }
        }
      } catch (err) {
        console.error("[discord-bridge] stats channel error:", err);
      }

      // 5. Persist to system_settings
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
      const existing = servers.find((s: any) => s.id === guildId);
      const filtered = servers.filter((s: any) => s.id !== guildId);
      filtered.push({
        id: guildId,
        name: guildName,
        enabled: true,
        channelId,
        inviteLink,
        webhookUrl,
        description: body?.description ?? existing?.description ?? "",
        iconUrl: body?.iconUrl ?? existing?.iconUrl ?? autoIconUrl,
        voiceChannelIds: voiceChannelIds.length > 0
          ? voiceChannelIds
          : existing?.voiceChannelIds ?? [],
        statsChannelId: statsChannelId ?? existing?.statsChannelId ?? null,
      });
      status.servers = filtered;

      const { error: upsertErr } = await supabase
        .from("system_settings")
        .upsert({ key: "discord_bot_status", value: JSON.stringify(status) }, { onConflict: "key" });

      if (upsertErr) {
        return jsonResponse({ error: upsertErr.message }, 500);
      }

      // 6. Trigger an immediate counter refresh so the channel name shows real numbers right away
      try {
        const counterUrl = `${supabaseUrl}/functions/v1/discord-presence-counter`;
        const refreshTask = fetch(counterUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({}),
        }).catch((err) => console.error("[discord-bridge] counter refresh failed:", err));
        // @ts-ignore EdgeRuntime
        if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
          // @ts-ignore
          EdgeRuntime.waitUntil(refreshTask);
        }
      } catch (err) {
        console.error("[discord-bridge] failed to schedule counter refresh:", err);
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
          iconUrl: autoIconUrl,
          voiceChannelIds,
          statsChannelId,
        },
      });
    }

    // ============================================================
    // Update an existing server's metadata (description, voice channels, icon)
    // ============================================================
    if (requestType === "update_server") {
      const guildId = body?.guildId;
      if (!guildId) {
        return jsonResponse({ error: "Missing guildId" }, 400);
      }

      const { data: cfg } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "discord_bot_status")
        .maybeSingle();
      let status: any = cfg?.value
        ? (typeof cfg.value === "string" ? JSON.parse(cfg.value) : cfg.value)
        : { servers: [] };
      const servers: any[] = Array.isArray(status.servers) ? status.servers : [];
      const idx = servers.findIndex((s: any) => s.id === guildId);
      if (idx < 0) return jsonResponse({ error: "Server not found" }, 404);

      const updates: Record<string, unknown> = {};
      if (typeof body.description === "string") updates.description = body.description;
      if (typeof body.iconUrl === "string") updates.iconUrl = body.iconUrl;
      if (typeof body.statsChannelId === "string" || body.statsChannelId === null) {
        updates.statsChannelId = body.statsChannelId || null;
      }
      if (Array.isArray(body.voiceChannelIds)) {
        updates.voiceChannelIds = body.voiceChannelIds.filter(
          (v: any) => typeof v === "string",
        );
      }
      servers[idx] = { ...servers[idx], ...updates };
      status.servers = servers;

      const { error: upsertErr } = await supabase
        .from("system_settings")
        .upsert({ key: "discord_bot_status", value: JSON.stringify(status) }, { onConflict: "key" });
      if (upsertErr) return jsonResponse({ error: upsertErr.message }, 500);

      return jsonResponse({ success: true, server: servers[idx] });
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
      const ephemeral = body?.ephemeral === true;
      const captureMessageIds = body?.captureMessageIds === true;
      const wantPostedId = ephemeral || captureMessageIds;
      const ephemeralDelayMs =
        typeof body?.ephemeralDelayMs === "number" && body.ephemeralDelayMs > 0
          ? Math.min(body.ephemeralDelayMs, 60000)
          : 10000;
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
        content: "/dv " + body.content,
        username: finalUsername || "DuelVerse Player",
        avatar_url: finalAvatar || undefined,
        allowed_mentions: { parse: ["users", "everyone"], users: [], roles: [] },
      };

      const results: Array<{ ok: boolean; url: string; status?: number; messageId?: string }> = [];
      for (const targetUrl of urls) {
        try {
          const url = wantPostedId ? `${targetUrl}?wait=true` : targetUrl;
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });
          let messageId: string | undefined;
          if (wantPostedId && response.ok) {
            const posted = await response.json().catch(() => null);
            messageId = posted?.id;
            if (ephemeral) {
              scheduleWebhookMessageDeletion(targetUrl, messageId, ephemeralDelayMs);
            }
          }
          results.push({ ok: response.ok, url: targetUrl, status: response.status, messageId });
        } catch (err) {
          console.error(`[discord-bridge] webhook error for ${targetUrl}:`, err);
          results.push({ ok: false, url: targetUrl });
        }
      }

      return jsonResponse({ success: results.some((r) => r.ok), ephemeral, results });
    }

    // ============================================================
    // Cleanup: delete Discord announcement messages for a closed duel room
    // ============================================================
    if (requestType === "cleanup_duel_messages") {
      const duelId = typeof body?.duelId === "string" ? body.duelId : null;
      if (!duelId) return jsonResponse({ error: "Missing duelId" }, 400);

      const { data: duel } = await supabase
        .from("live_duels")
        .select("discord_messages")
        .eq("id", duelId)
        .maybeSingle();

      const messages = Array.isArray((duel as any)?.discord_messages)
        ? (duel as any).discord_messages
        : [];

      let deleted = 0;
      await Promise.all(
        messages.map(async (m: any) => {
          if (!m?.webhookUrl || !m?.messageId) return;
          try {
            const res = await fetch(`${m.webhookUrl}/messages/${m.messageId}`, { method: "DELETE" });
            if (res.ok || res.status === 404) deleted++;
          } catch (err) {
            console.warn("[discord-bridge] cleanup_duel_messages delete error:", err);
          }
        }),
      );

      if (messages.length > 0) {
        await supabase
          .from("live_duels")
          .update({ discord_messages: [] } as any)
          .eq("id", duelId);
      }

      return jsonResponse({ success: true, deleted });
    }

    // ============================================================
    // Cleanup: delete Discord matchmaking announcement messages for a user
    // (used when a player matched directly via the matchmake RPC)
    // ============================================================
    if (requestType === "cleanup_matchmaking_messages") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) return jsonResponse({ error: "Invalid user token" }, 401);

      const { data: invites } = await supabase
        .from("matchmaking_invites")
        .select("id, discord_messages")
        .eq("host_user_id", userData.user.id)
        .in("status", ["open", "matched"]);

      let deleted = 0;
      const ids: string[] = [];
      for (const invite of invites ?? []) {
        const messages = Array.isArray((invite as any).discord_messages)
          ? (invite as any).discord_messages
          : [];
        if (messages.length === 0) continue;
        ids.push((invite as any).id);
        await Promise.all(
          messages.map(async (m: any) => {
            if (!m?.webhookUrl || !m?.messageId) return;
            try {
              const res = await fetch(`${m.webhookUrl}/messages/${m.messageId}`, { method: "DELETE" });
              if (res.ok || res.status === 404) deleted++;
            } catch (err) {
              console.warn("[discord-bridge] cleanup_matchmaking_messages delete error:", err);
            }
          }),
        );
      }

      if (ids.length > 0) {
        await supabase
          .from("matchmaking_invites")
          .update({ discord_messages: [] })
          .in("id", ids);
      }

      return jsonResponse({ success: true, deleted });
    }

    if (requestType === "announce_matchmaking") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) return jsonResponse({ error: "Invalid user token" }, 401);

      const userId = userData.user.id;
      const matchType = body.matchType === "ranked" ? "ranked" : "casual";
      const tcgType = typeof body.tcgType === "string" ? body.tcgType : "yugioh";
      const maxPlayers = typeof body.maxPlayers === "number" ? body.maxPlayers : 2;
      const languageCode = typeof body.languageCode === "string" ? body.languageCode : "en";

      await supabase
        .from("matchmaking_invites")
        .update({ status: "cancelled" })
        .eq("host_user_id", userId)
        .eq("status", "open");

      const { data: invite, error: inviteError } = await supabase
        .from("matchmaking_invites")
        .insert({
          host_user_id: userId,
          match_type: matchType,
          tcg_type: tcgType,
          max_players: maxPlayers,
          language_code: languageCode,
        })
        .select("id")
        .single();
      if (inviteError || !invite) return jsonResponse({ error: inviteError?.message || "Failed to create invite" }, 500);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", userId)
        .maybeSingle();

      const servers = Array.isArray(botStatus.servers) ? botStatus.servers : [];
      const activeServers = servers.filter((server: any) => server.enabled && server.webhookUrl);
      if (activeServers.length === 0) return jsonResponse({ error: "No active Discord server configured" }, 400);

      const username = String(body.username || profile?.username || "Duelista");
      const mode = matchType === "ranked" ? "rankeada" : "casual";
      const link = `https://duelverse.site/m/${invite.id}`;
      const webhookPayload = {
        content: `/dv @everyone usuario ${username} está buscando partida ${mode} ${link}`,
        username: "DuelVerse Matchmaking",
        allowed_mentions: { parse: ["everyone"] },
      };

      const results: Array<{ ok: boolean; status?: number; messageId?: string; webhookUrl?: string }> = [];
      const postedMessages: Array<{ webhookUrl: string; messageId: string }> = [];
      for (const server of activeServers) {
        const response = await fetch(`${server.webhookUrl}?wait=true`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload),
        });
        const posted = await response.json().catch(() => null);
        
        // Persist message id so it can be deleted when the player matches.
        if (response.ok && posted?.id) {
          postedMessages.push({ webhookUrl: server.webhookUrl, messageId: posted.id });
        }
        results.push({ ok: response.ok, status: response.status, messageId: posted?.id, webhookUrl: server.webhookUrl });
      }

      // Persist webhook + message IDs on the invite so the accept handler
      // can delete them once a player joins the duel.
      if (postedMessages.length > 0) {
        await supabase
          .from("matchmaking_invites")
          .update({ discord_messages: postedMessages })
          .eq("id", invite.id);
      }

      return jsonResponse({ success: results.some((r) => r.ok), inviteId: invite.id, link, results });
    }

    // ============================================================
    // Broadcast a DuelVerse duel to all configured Discord text channels
    // Format: "/dv @everyone <username> está transmitindo um duelo: <link>"
    // ============================================================
    if (requestType === "broadcast_duel") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabase.auth.getUser(token);
      if (userError || !userData.user) return jsonResponse({ error: "Invalid user token" }, 401);

      const userId = userData.user.id;
      const duelId = typeof body.duelId === "string" ? body.duelId : null;
      if (!duelId) return jsonResponse({ error: "Missing duelId" }, 400);

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", userId)
        .maybeSingle();

      const servers = Array.isArray(botStatus.servers) ? botStatus.servers : [];
      const activeServers = servers.filter((server: any) => server.enabled && server.webhookUrl);
      if (activeServers.length === 0)
        return jsonResponse({ error: "No active Discord server configured" }, 400);

      const username = String(body.username || profile?.username || "Duelista");
      const link = `https://duelverse.site/join/${duelId}`;
      const content = `/dv @everyone 📺 **${username}** está transmitindo um duelo ao vivo no DuelVerse! Entre como espectador: ${link}`;

      const webhookPayload = {
        content,
        username: "DuelVerse Live",
        allowed_mentions: { parse: ["everyone"] },
      };

      const results: Array<{ ok: boolean; status?: number }> = [];
      for (const server of activeServers) {
        try {
          const response = await fetch(server.webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });
          results.push({ ok: response.ok, status: response.status });
        } catch (err) {
          console.error("[discord-bridge] broadcast_duel error:", err);
          results.push({ ok: false });
        }
      }

      return jsonResponse({ success: results.some((r) => r.ok), link, results });
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
