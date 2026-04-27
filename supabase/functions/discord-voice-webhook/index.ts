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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { type, guild_id, channel_id, user_id, username } = body;

    console.log(`[discord-voice-webhook] Received ${type} event for user ${username} in channel ${channel_id}`);

    // Verify this is from a configured Discord server
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();

    if (settingsError) {
      console.error("[discord-voice-webhook] Error fetching settings:", settingsError);
      return jsonResponse({ error: "Failed to fetch settings" }, 500);
    }

    let botStatus = { servers: [] };
    if (settings?.value) {
      try {
        botStatus = typeof settings.value === "string" ? JSON.parse(settings.value) : settings.value;
      } catch {
        botStatus = { servers: [] };
      }
    }

    const serverConfig = botStatus.servers?.find(
      (server: any) => server.id === guild_id && server.enabled
    );

    if (!serverConfig) {
      console.log(`[discord-voice-webhook] Server ${guild_id} not configured`);
      return jsonResponse({ ok: true, skipped: "not_configured" });
    }

    if (type === "voice_join") {
      return await handleVoiceJoin(supabase, serverConfig, user_id, username, channel_id);
    } else if (type === "voice_leave") {
      return await handleVoiceLeave(supabase, serverConfig, user_id, username, channel_id);
    } else {
      return jsonResponse({ error: "Invalid event type" }, 400);
    }
  } catch (error: any) {
    console.error("[discord-voice-webhook] critical error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});

async function handleVoiceJoin(
  supabase: ReturnType<typeof createClient>,
  serverConfig: any,
  discordUserId: string,
  discordUsername: string,
  channelId: string
) {
  try {
    // Check if the Discord user is linked to a DuelVerse account
    const { data: linkedUser, error: linkedUserError } = await supabase.rpc(
      "get_user_by_discord_id",
      { p_discord_id: discordUserId }
    );

    if (linkedUserError) {
      console.error("[discord-voice-webhook] lookup error:", linkedUserError);
      return jsonResponse({ error: linkedUserError.message }, 500);
    }

    const hasLinkedUser = Boolean(linkedUser && linkedUser.length > 0);
    const duelverseUserId = hasLinkedUser ? linkedUser[0].user_id : null;
    const displayName = hasLinkedUser ? linkedUser[0].username : discordUsername;

    // Check if a duelroom already exists for this Discord channel
    const { data: existingDuel, error: existingDuelError } = await supabase
      .from('live_duels')
      .select('id, status, creator_id, opponent_id, discord_channel_id')
      .eq('discord_channel_id', channelId)
      .maybeSingle();

    if (existingDuelError) {
      console.error("[discord-voice-webhook] error checking existing duel:", existingDuelError);
      return jsonResponse({ error: existingDuelError.message }, 500);
    }

    let duelId: string;
    let isNewDuel = false;

    if (existingDuel) {
      duelId = existingDuel.id;
      console.log(`[discord-voice-webhook] Using existing duel ${duelId}`);
    } else {
      // Create new duelroom
      isNewDuel = true;
      const { data: newDuel, error: newDuelError } = await supabase
        .from('live_duels')
        .insert({
          creator_id: duelverseUserId,
          discord_channel_id: channelId,
          discord_guild_id: serverConfig.id,
          status: 'waiting',
          tcg_type: 'yugioh',
          duration_minutes: 50,
          is_ranked: false,
          bet_amount: 0,
          player1_lp: 8000,
          player2_lp: 8000,
          player3_lp: 8000,
          player4_lp: 8000,
          custom_counters: [],
        })
        .select('id')
        .single();

      if (newDuelError) {
        console.error("[discord-voice-webhook] error creating duel:", newDuelError);
        return jsonResponse({ error: newDuelError.message }, 500);
      }

      duelId = newDuel.id;

      if (duelverseUserId) {
        await supabase
          .from('live_duels')
          .update({ creator_id: duelverseUserId })
          .eq('id', duelId);
      }
    }

    // Notify via realtime channel
    const realtimeChannel = supabase.channel(`discord-voice-${channelId}`);
    await realtimeChannel.send({
      type: 'broadcast',
      event: 'discord_user_joined',
      payload: {
        userId: discordUserId,
        username: displayName,
        duelverseUserId,
        duelId,
        isNewDuel,
        channelId,
        guildId: serverConfig.id,
      }
    });

    console.log(`[discord-voice-webhook] User ${displayName} joined, duelroom: ${duelId}`);

    return jsonResponse({
      success: true,
      duelId,
      isNewDuel,
      displayName,
      channelId,
      guildId: serverConfig.id,
    });
  } catch (error: any) {
    console.error("[discord-voice-webhook] error in handleVoiceJoin:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleVoiceLeave(
  supabase: ReturnType<typeof createClient>,
  serverConfig: any,
  discordUserId: string,
  discordUsername: string,
  channelId: string
) {
  try {
    const { data: linkedUser } = await supabase.rpc(
      "get_user_by_discord_id",
      { p_discord_id: discordUserId }
    );

    const displayName = (linkedUser && linkedUser.length > 0) ? linkedUser[0].username : discordUsername;

    // Notify via realtime channel
    const realtimeChannel = supabase.channel(`discord-voice-${channelId}`);
    await realtimeChannel.send({
      type: 'broadcast',
      event: 'discord_user_left',
      payload: {
        userId: discordUserId,
        username: displayName,
        channelId,
        guildId: serverConfig.id,
      }
    });

    console.log(`[discord-voice-webhook] User ${displayName} left voice channel`);

    return jsonResponse({
      success: true,
      displayName,
    });
  } catch (error: any) {
    console.error("[discord-voice-webhook] error in handleVoiceLeave:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}