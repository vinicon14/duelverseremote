// Discord Presence Bridge
// Marks the linked Discord account as "playing DuelVerse" by:
//   1. Ensuring a role "🎮 Jogando DuelVerse" exists on each configured guild
//   2. Adding that role to the user when they log in to DuelVerse
//   3. Removing it when they log out
//
// Called from the frontend on auth state changes. Uses the user's JWT to look
// up the linked Discord account, then uses the bot token (server-side) to
// modify guild roles.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";
const PRESENCE_ROLE_NAME = "🎮 Jogando DuelVerse";
const PRESENCE_ROLE_COLOR = 0x7c3aed; // purple

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function discordFetch(token: string, path: string, init: RequestInit = {}) {
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
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function ensurePresenceRole(botToken: string, guildId: string): Promise<string | null> {
  const rolesRes = await discordFetch(botToken, `/guilds/${guildId}/roles`);
  if (rolesRes.ok && Array.isArray(rolesRes.data)) {
    const existing = rolesRes.data.find((r: any) => r.name === PRESENCE_ROLE_NAME);
    if (existing) return existing.id;
  }
  const created = await discordFetch(botToken, `/guilds/${guildId}/roles`, {
    method: "POST",
    body: JSON.stringify({
      name: PRESENCE_ROLE_NAME,
      color: PRESENCE_ROLE_COLOR,
      hoist: true,
      mentionable: false,
      permissions: "0",
    }),
  });
  if (created.ok && created.data?.id) return created.data.id;
  console.warn("[discord-presence] failed to create role on", guildId, created.status, created.data);
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth header" }, 401);

    const body = await req.json().catch(() => ({}));
    const playing = body?.playing !== false; // default true

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
    if (!botToken) return json({ error: "DISCORD_BOT_TOKEN not configured" }, 500);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: "Invalid user token" }, 401);

    // Look up linked Discord account
    const { data: linkRows } = await admin
      .from("discord_links")
      .select("discord_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const discordId = linkRows?.discord_id;
    if (!discordId) return json({ ok: true, skipped: "no_linked_discord" });

    // Get configured guilds
    const { data: cfg } = await admin
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();
    const status: any = cfg?.value
      ? (typeof cfg.value === "string" ? JSON.parse(cfg.value) : cfg.value)
      : { servers: [] };
    const servers: any[] = Array.isArray(status?.servers) ? status.servers : [];
    const enabledServers = servers.filter((s: any) => s.enabled && s.id);
    if (enabledServers.length === 0) return json({ ok: true, skipped: "no_guilds" });

    const results: Array<{ guildId: string; ok: boolean; status?: number; action: string }> = [];

    for (const server of enabledServers) {
      const guildId = String(server.id);

      // Verify the user is in the guild — skip otherwise
      const memberRes = await discordFetch(botToken, `/guilds/${guildId}/members/${discordId}`);
      if (!memberRes.ok) {
        results.push({ guildId, ok: false, status: memberRes.status, action: "not_in_guild" });
        continue;
      }

      const roleId = await ensurePresenceRole(botToken, guildId);
      if (!roleId) {
        results.push({ guildId, ok: false, action: "role_unavailable" });
        continue;
      }

      const method = playing ? "PUT" : "DELETE";
      const res = await discordFetch(
        botToken,
        `/guilds/${guildId}/members/${discordId}/roles/${roleId}`,
        { method },
      );
      results.push({
        guildId,
        ok: res.ok,
        status: res.status,
        action: playing ? "added" : "removed",
      });
    }

    return json({ success: true, playing, results });
  } catch (err: any) {
    console.error("[discord-presence] critical:", err);
    return json({ error: err?.message || "Internal error" }, 500);
  }
});
