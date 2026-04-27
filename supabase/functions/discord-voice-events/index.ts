// Discord Voice Events Bridge
// Receives VOICE_STATE_UPDATE notifications from the Java bot and:
//  - Creates a DuelRoom (live_duels) the first time someone joins a voice channel
//  - Tracks the roster of users in that channel (discord_voice_participants)
//  - Closes the voice room when the last user leaves
//
// Auth: shared secret in header `x-bot-secret` (DISCORD_BOT_BRIDGE_SECRET).
// Service role is used to bypass RLS — clients should NEVER call this directly.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface VoicePayload {
  event: "join" | "leave";
  guild_id: string;
  guild_name?: string;
  channel_id: string;
  channel_name?: string;
  discord_user_id: string;
  discord_username: string;
  discord_avatar_url?: string;
  is_bot?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Shared-secret auth so only the Java bot can call this
  const expectedSecret = Deno.env.get("DISCORD_BOT_BRIDGE_SECRET");
  const providedSecret = req.headers.get("x-bot-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: VoicePayload;
  try {
    body = (await req.json()) as VoicePayload;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body?.event || !body?.guild_id || !body?.channel_id || !body?.discord_user_id) {
    return json({ error: "Missing required fields" }, 400);
  }

  // Ignore bots (including ourselves) — never create rooms for bots
  if (body.is_bot) return json({ ok: true, skipped: "bot_user" });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only process events from voice channels that admins explicitly enabled
  // for this guild. If the guild is not configured at all, ignore.
  try {
    const { data: cfg } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();
    const status: any = cfg?.value
      ? (typeof cfg.value === "string" ? JSON.parse(cfg.value) : cfg.value)
      : { servers: [] };
    const servers: any[] = Array.isArray(status?.servers) ? status.servers : [];
    const guildCfg = servers.find((s: any) => s.id === body.guild_id && s.enabled);
    if (!guildCfg) {
      return json({ ok: true, skipped: "guild_not_configured" });
    }
    const allowedVoice: string[] = Array.isArray(guildCfg.voiceChannelIds)
      ? guildCfg.voiceChannelIds
      : [];
    // If admin set a list, enforce it. If empty list, allow all voice channels
    // (backwards-compatible).
    if (allowedVoice.length > 0 && !allowedVoice.includes(body.channel_id)) {
      return json({ ok: true, skipped: "voice_channel_not_enabled" });
    }
  } catch (err) {
    console.warn("[discord-voice-events] config lookup failed:", err);
  }

  // Try to resolve the linked DuelVerse user (if any)
  let duelverseUserId: string | null = null;
  let duelverseUsername: string | null = null;
  try {
    const { data: linked } = await supabase.rpc("get_user_by_discord_id", {
      p_discord_id: body.discord_user_id,
    });
    if (Array.isArray(linked) && linked.length > 0) {
      duelverseUserId = linked[0].user_id;
      duelverseUsername = linked[0].username;
    }
  } catch (err) {
    console.warn("[discord-voice-events] discord link lookup failed:", err);
  }

  if (body.event === "join") {
    return await handleJoin(supabase, body, duelverseUserId, duelverseUsername);
  }
  if (body.event === "leave") {
    return await handleLeave(supabase, body);
  }

  return json({ error: "Unknown event" }, 400);
});

async function handleJoin(
  supabase: ReturnType<typeof createClient>,
  body: VoicePayload,
  duelverseUserId: string | null,
  duelverseUsername: string | null,
) {
  // 1. Find or create the voice room mapping (1 sala por canal de voz)
  let { data: room } = await supabase
    .from("discord_voice_rooms")
    .select("id, duel_id, is_active, invite_url")
    .eq("channel_id", body.channel_id)
    .maybeSingle();

  // Try to create / refresh an invite for this voice channel
  // (uses the bot token; falls back to channel deeplink only if it fails)
  let inviteUrl: string | null = (room as any)?.invite_url ?? null;
  if (!inviteUrl) {
    try {
      const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
      if (botToken) {
        const inviteRes = await fetch(
          `https://discord.com/api/v10/channels/${body.channel_id}/invites`,
          {
            method: "POST",
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ max_age: 0, max_uses: 0, unique: false }),
          },
        );
        if (inviteRes.ok) {
          const invData = await inviteRes.json();
          if (invData?.code) inviteUrl = `https://discord.gg/${invData.code}`;
        } else {
          console.warn(
            "[discord-voice-events] failed to create invite:",
            inviteRes.status,
            await inviteRes.text(),
          );
        }
      }
    } catch (err) {
      console.warn("[discord-voice-events] invite creation error:", err);
    }
  }

  let duelId = room?.duel_id ?? null;

  // If room exists but the duel is gone/finished, recreate the duel
  if (duelId) {
    const { data: existingDuel } = await supabase
      .from("live_duels")
      .select("id, status")
      .eq("id", duelId)
      .maybeSingle();
    if (!existingDuel || existingDuel.status === "finished") {
      duelId = null;
    }
  }

  // Create the DuelRoom if needed.
  // We need a creator_id (NOT NULL). Use the linked DuelVerse account when available;
  // otherwise we cannot create a duel — store the room without one and wait.
  if (!duelId) {
    const creatorId = duelverseUserId;
    if (creatorId) {
      const roomName = `Discord: #${body.channel_name ?? body.channel_id}`;
      const { data: newDuel, error: duelErr } = await supabase
        .from("live_duels")
        .insert({
          creator_id: creatorId,
          status: "waiting",
          tcg_type: "yugioh",
          room_name: roomName,
          is_ranked: false,
          max_players: 2,
        })
        .select("id")
        .single();
      if (duelErr) {
        console.error("[discord-voice-events] failed to create duel:", duelErr);
      } else {
        duelId = newDuel.id;
      }
    }
  }

  // Upsert the voice_room row
  if (!room) {
    const { data: created, error: roomErr } = await supabase
      .from("discord_voice_rooms")
      .insert({
        guild_id: body.guild_id,
        guild_name: body.guild_name ?? null,
        channel_id: body.channel_id,
        channel_name: body.channel_name ?? null,
        duel_id: duelId,
        is_active: true,
        invite_url: inviteUrl,
      })
      .select("id")
      .single();
    if (roomErr) {
      console.error("[discord-voice-events] failed to create voice room:", roomErr);
      return json({ error: roomErr.message }, 500);
    }
    room = { id: created.id, duel_id: duelId, is_active: true, invite_url: inviteUrl } as any;
  } else {
    await supabase
      .from("discord_voice_rooms")
      .update({
        is_active: true,
        closed_at: null,
        duel_id: duelId,
        guild_name: body.guild_name ?? null,
        channel_name: body.channel_name ?? null,
        invite_url: inviteUrl ?? (room as any).invite_url ?? null,
      })
      .eq("id", room.id);
  }

  // Insert participant (mark any earlier open record as left first)
  await supabase
    .from("discord_voice_participants")
    .update({ left_at: new Date().toISOString() })
    .eq("voice_room_id", room.id)
    .eq("discord_user_id", body.discord_user_id)
    .is("left_at", null);

  const { error: partErr } = await supabase.from("discord_voice_participants").insert({
    voice_room_id: room.id,
    discord_user_id: body.discord_user_id,
    discord_username: body.discord_username,
    discord_avatar_url: body.discord_avatar_url ?? null,
    duelverse_user_id: duelverseUserId,
    duelverse_username: duelverseUsername,
  });
  if (partErr) console.error("[discord-voice-events] failed to insert participant:", partErr);

  // Send a DM to the Discord user with a button to jump into the DuelVerse DuelRoom
  if (duelId) {
    try {
      await sendDuelRoomInviteDM({
        discordUserId: body.discord_user_id,
        duelId,
        channelName: body.channel_name ?? body.channel_id,
        guildName: body.guild_name ?? "Discord",
        hasAccount: Boolean(duelverseUserId),
      });
    } catch (err) {
      console.warn("[discord-voice-events] failed to send invite DM:", err);
    }
  }

  // Announce in the linked text channel: "/dv @everyone remote <link>"
  try {
    await announceVoiceJoinInTextChannel(supabase, {
      guildId: body.guild_id,
      channelId: body.channel_id,
      channelName: body.channel_name ?? body.channel_id,
      discordUsername: body.discord_username,
      inviteUrl,
    });
  } catch (err) {
    console.warn("[discord-voice-events] failed to announce join in text channel:", err);
  }

  return json({
    ok: true,
    voice_room_id: room.id,
    duel_id: duelId,
    has_duelverse_link: Boolean(duelverseUserId),
  });
}

// ----- DM helper -----
// Opens a DM channel with the user and posts a message with a link button to the DuelRoom.
async function sendDuelRoomInviteDM(opts: {
  discordUserId: string;
  duelId: string;
  channelName: string;
  guildName: string;
  hasAccount: boolean;
}) {
  const botToken = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!botToken) {
    console.warn("[discord-voice-events] DISCORD_BOT_TOKEN missing — skipping DM");
    return;
  }

  const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: opts.discordUserId }),
  });
  if (!dmRes.ok) {
    console.warn("[discord-voice-events] open DM failed:", dmRes.status, await dmRes.text());
    return;
  }
  const dm = await dmRes.json();
  const dmChannelId = dm?.id;
  if (!dmChannelId) return;

  const joinUrl = `https://duelverse.site/join/${opts.duelId}`;

  const payload = {
    content:
      `🎮 Você entrou em **#${opts.channelName}** no servidor **${opts.guildName}**.\n` +
      (opts.hasAccount
        ? "Sua conta DuelVerse está vinculada — toque o botão para abrir a DuelRoom."
        : "Toque o botão para abrir a DuelRoom no DuelVerse (app, site ou navegador)."),
    embeds: [
      {
        title: "Sala de Duelo pronta",
        description:
          "A DuelRoom desta call já está criada. Abra para duelar enquanto continua em chamada no Discord.",
        color: 0x7c3aed,
        url: joinUrl,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "🎮 Abrir DuelRoom", url: joinUrl },
        ],
      },
    ],
  };

  const msgRes = await fetch(
    `https://discord.com/api/v10/channels/${dmChannelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  if (!msgRes.ok) {
    console.warn(
      "[discord-voice-events] DM send failed:",
      msgRes.status,
      await msgRes.text(),
    );
  }
}

async function handleLeave(supabase: ReturnType<typeof createClient>, body: VoicePayload) {
  const { data: room } = await supabase
    .from("discord_voice_rooms")
    .select("id, duel_id")
    .eq("channel_id", body.channel_id)
    .maybeSingle();

  if (!room) return json({ ok: true, skipped: "unknown_channel" });

  // Mark this user's open participant row as left
  await supabase
    .from("discord_voice_participants")
    .update({ left_at: new Date().toISOString() })
    .eq("voice_room_id", room.id)
    .eq("discord_user_id", body.discord_user_id)
    .is("left_at", null);

  // If no one is left, close the voice room (and the duel if still waiting)
  const { count } = await supabase
    .from("discord_voice_participants")
    .select("id", { count: "exact", head: true })
    .eq("voice_room_id", room.id)
    .is("left_at", null);

  if ((count ?? 0) === 0) {
    await supabase
      .from("discord_voice_rooms")
      .update({ is_active: false, closed_at: new Date().toISOString() })
      .eq("id", room.id);

    if (room.duel_id) {
      // Only finish if still waiting — don't kill an active duel
      await supabase
        .from("live_duels")
        .update({ status: "finished", finished_at: new Date().toISOString() })
        .eq("id", room.duel_id)
        .eq("status", "waiting");
    }
  }

  return json({ ok: true, voice_room_id: room.id, remaining: count ?? 0 });
}
