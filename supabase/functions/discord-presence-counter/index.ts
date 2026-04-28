/**
 * discord-presence-counter
 *
 * Updates Discord "stats" channels on every configured server with the current
 * count of online users (Discord-linked + DuelVerse online), in the format:
 *   "👥 Online: <total>"
 *
 * Each server in system_settings.discord_bot_status.servers may have an optional
 * `statsChannelId` (a voice or text channel that the bot has Manage Channels on).
 *
 * Triggered:
 *   - by clients on login/logout (via useDiscordPresence)
 *   - by cron (pg_cron / scheduled invocation) every few minutes
 *
 * Discord channel rename has a strict rate limit (2 per 10 minutes per channel),
 * so we throttle: only rename if the cached value differs AND we haven't renamed
 * the same channel in the last 5 minutes.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DISCORD_API = "https://discord.com/api/v10";
const RENAME_THROTTLE_MS = 5 * 60 * 1000; // 5 min

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function discordPatchChannel(channelId: string, name: string) {
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!token) throw new Error("DISCORD_BOT_TOKEN not configured");
  const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 300) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Count online users
    const [{ count: discordOnline }, { count: duelverseOnline }] = await Promise.all([
      supabase.from("discord_links").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("user_id", { count: "exact", head: true })
        .eq("is_online", true),
    ]);

    const totalDiscord = discordOnline ?? 0;
    const totalDuelverse = duelverseOnline ?? 0;
    const total = totalDiscord + totalDuelverse;
    const desiredName = `👥 Online: ${total}`;

    // 2. Load servers config
    const { data: cfgRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();
    const cfg: any = cfgRow?.value
      ? typeof cfgRow.value === "string"
        ? JSON.parse(cfgRow.value)
        : cfgRow.value
      : { servers: [] };
    const servers: any[] = Array.isArray(cfg.servers) ? cfg.servers : [];

    // 3. Throttle / rename cache
    const { data: cacheRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_stats_cache")
      .maybeSingle();
    const cache: Record<string, { name: string; ts: number }> = cacheRow?.value
      ? typeof cacheRow.value === "string"
        ? JSON.parse(cacheRow.value)
        : cacheRow.value
      : {};

    const now = Date.now();
    const results: Array<{ guildId: string; channelId: string; renamed: boolean; reason?: string; status?: number }> = [];

    for (const server of servers) {
      const channelId: string | undefined = server?.statsChannelId;
      if (!channelId || !server?.enabled) continue;
      const last = cache[channelId];
      if (last && last.name === desiredName && now - last.ts < RENAME_THROTTLE_MS) {
        results.push({ guildId: server.id, channelId, renamed: false, reason: "cached" });
        continue;
      }
      try {
        const r = await discordPatchChannel(channelId, desiredName);
        if (r.ok) {
          cache[channelId] = { name: desiredName, ts: now };
          results.push({ guildId: server.id, channelId, renamed: true, status: r.status });
        } else {
          results.push({ guildId: server.id, channelId, renamed: false, status: r.status, reason: r.body });
        }
      } catch (err: any) {
        results.push({ guildId: server.id, channelId, renamed: false, reason: err?.message ?? "error" });
      }
    }

    // 4. Persist cache
    await supabase
      .from("system_settings")
      .upsert({ key: "discord_stats_cache", value: JSON.stringify(cache) }, { onConflict: "key" });

    return json({
      success: true,
      totals: { discord: totalDiscord, duelverse: totalDuelverse, total },
      desiredName,
      results,
    });
  } catch (err: any) {
    console.error("[discord-presence-counter] error:", err);
    return json({ error: err?.message ?? "unknown" }, 500);
  }
});
