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
    const eventType = body.type; // "voice_join" or "voice_leave"
    const guildId = body.guild_id;
    const channelId = body.channel_id;
    const userId = body.user_id;
    const username = body.username;

    console.log(`[discord-voice-handler] Received ${eventType} event for user ${username} in channel ${channelId}`);

    // Check if this guild/channel is configured for DuelVerse
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();

    if (settingsError) {
      console.error("[discord-voice-handler] Error fetching settings:", settingsError);
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

    // Find the server configuration
    const serverConfig = botStatus.servers?.find(
      (server: any) => server.id === guildId && server.enabled && server.channelId === channelId
    );

    if (!serverConfig) {
      console.log(`[discord-voice-handler] No configuration found for guild ${guildId}, channel ${channelId}`);
      return jsonResponse({ ok: true, skipped: "not_configured" });
    }

    if (eventType === "voice_join") {
      // Handle user joining voice channel - create or join duelroom
      return await handleVoiceJoin(supabase, serverConfig, userId, username);
    } else if (eventType === "voice_leave") {
      // Handle user leaving voice channel - potentially cleanup
      return await handleVoiceLeave(supabase, serverConfig, userId, username);
    } else {
      return jsonResponse({ error: "Invalid event type" }, 400);
    }
  } catch (error: any) {
    console.error("[discord-voice-handler] critical error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});

async function handleVoiceJoin(
  supabase: ReturnType<typeof createClient>,
  serverConfig: any,
  discordUserId: string,
  discordUsername: string
) {
  try {
    // Check if the Discord user is linked to a DuelVerse account
    const { data: linkedUser, error: linkedUserError } = await supabase.rpc(
      "get_user_by_discord_id",
      { p_discord_id: discordUserId }
    );

    if (linkedUserError) {
      console.error("[discord-voice-handler] lookup error:", linkedUserError);
      return jsonResponse({ error: linkedUserError.message }, 500);
    }

    const hasLinkedUser = Boolean(linkedUser && linkedUser.length > 0);
    const duelverseUserId = hasLinkedUser ? linkedUser[0].user_id : null;
    const usernameLabel = hasLinkedUser ? linkedUser[0].username : discordUsername;

    // Create a duelroom name based on Discord info
    const duelRoomName = `discord-${discordUsername}`;

    // Check if a duelroom already exists for this Discord channel
    const { data: existingDuel, error: existingDuelError } = await supabase
      .from('live_duels')
      .select('id, status, creator_id, opponent_id, player3_id, player4_id, max_players, tcg_type, duration_minutes, is_ranked')
      .eq('discord_channel_id', serverConfig.channelId)
      .maybeSingle();

    if (existingDuelError) {
      console.error("[discord-voice-handler] error checking existing duel:", existingDuelError);
      return jsonResponse({ error: existingDuelError.message }, 500);
    }

    let duelId: string;
    let isNewDuel = false;

    if (existingDuel) {
      // Use existing duel
      duelId = existingDuel.id;
      console.log(`[discord-voice-handler] Using existing duel ${duelId}`);
    } else {
      // Create new duel
      isNewDuel = true;
      const { data: newDuel, error: newDuelError } = await supabase
        .from('live_duels')
        .insert({
          creator_id: duelverseUserId, // Creator will be the first user who joins
          discord_channel_id: serverConfig.channelId,
          discord_guild_id: serverConfig.id,
          status: 'waiting',
          tcg_type: 'yugioh', // Default, could be made configurable
          duration_minutes: 50,
          is_ranked: false, // Default to casual, could be made configurable
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
        console.error("[discord-voice-handler] error creating duel:", newDuelError);
        return jsonResponse({ error: newDuelError.message }, 500);
      }

      duelId = newDuel.id;
      console.log(`[discord-voice-handler] Created new duel ${duelId}`);

      // If user is linked to DuelVerse, update their info in the duel
      if (duelverseUserId) {
        const { error: updateError } = await supabase
          .from('live_duels')
          .update({ creator_id: duelverseUserId })
          .eq('id', duelId);

        if (updateError) {
          console.error("[discord-voice-handler] error updating duel creator:", updateError);
          // Don't fail the whole operation for this
        }
      }
    }

    // Notify the user (could send a Discord message or just log)
    console.log(`[discord-voice-handler] User ${usernameLabel} (${discordUserId}) joined voice channel, duelroom: ${duelId}`);

    // TODO: Send a Discord message to the channel informing about the duelroom creation
    // This would require sending a message via webhook or the bot

    return jsonResponse({
      success: true,
      duelId,
      isNewDuel,
      userInfo: {
        discordUserId,
        discordUsername,
        duelverseUserId,
        usernameLabel
      }
    });
  } catch (error: any) {
    console.error("[discord-voice-handler] error in handleVoiceJoin:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}

async function handleVoiceLeave(
  supabase: ReturnType<typeof createClient>,
  serverConfig: any,
  discordUserId: string,
  discordUsername: string
) {
  try {
    // Check if the Discord user is linked to a DuelVerse account
    const { data: linkedUser, error: linkedUserError } = await supabase.rpc(
      "get_user_by_discord_id",
      { p_discord_id: discordUserId }
    );

    if (linkedUserError) {
      console.error("[discord-voice-handler] lookup error:", linkedUserError);
      return jsonResponse({ error: linkedUserError.message }, 500);
    }

    const hasLinkedUser = Boolean(linkedUser && linkedUser.length > 0);
    const duelverseUserId = hasLinkedUser ? linkedUser[0].user_id : null;
    const usernameLabel = hasLinkedUser ? linkedUser[0].username : discordUsername;

    // Check if there's an active duel for this Discord channel
    const { data: activeDuel, error: activeDuelError } = await supabase
      .from('live_duels')
      .select('id, status, creator_id, opponent_id, player3_id, player4_id')
      .eq('discord_channel_id', serverConfig.channelId)
      .in('status', ['waiting', 'in_progress'])
      .maybeSingle();

    if (activeDuelError) {
      console.error("[discord-voice-handler] error checking active duel:", activeDuelError);
      return jsonResponse({ error: activeDuelError.message }, 500);
    }

    if (activeDuel) {
      // User left voice channel - check if we should end the duel or just note their departure
      // For now, we'll just log it - more sophisticated logic could be added later
      console.log(`[discord-voice-handler] User ${usernameLabel} (${discordUserId}) left voice channel, duel ${activeDuel.id} status: ${activeDuel.status}`);

      // TODO: Implement logic to handle user departure:
      // - If duel is waiting and creator left, maybe end duel
      // - If duel in progress and opponent left, maybe pause or handle forfeit
      // - If duel in progress and spectator left, just note it
    }

    return jsonResponse({
      success: true,
      message: `User ${usernameLabel} left voice channel processed`
    });
  } catch (error: any) {
    console.error("[discord-voice-handler] error in handleVoiceLeave:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}