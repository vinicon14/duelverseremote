/**
 * DuelVerse - Discord Voice Handler
 * Gerencia eventos de voz do Discord: criação automática de DuelRoom,
 * identificação de usuário vinculado, suporte a ranked e transmissão de tela.
 */
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
    const eventType = body.type; // "voice_join", "voice_leave", "join_voice_channel", "get_partner_servers", "start_screenshare"
    const guildId = body.guild_id;
    const channelId = body.channel_id;
    const userId = body.user_id;
    const username = body.username;

    console.log(`[discord-voice-handler] Received ${eventType} event for user ${username} in channel ${channelId}`);

    // Rota especial: listar servidores parceiros para seleção no frontend
    if (eventType === "get_partner_servers") {
      return await getPartnerServers(supabase);
    }

    // Rota especial: iniciar transmissão de tela para canal de voz Discord
    if (eventType === "start_screenshare") {
      return await handleStartScreenshare(supabase, body);
    }

    // Verificar configuração do guild/channel
    const { data: settings, error: settingsError } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();

    if (settingsError) {
      console.error("[discord-voice-handler] Error fetching settings:", settingsError);
      return jsonResponse({ error: "Failed to fetch settings" }, 500);
    }

    let botStatus: { servers: any[] } = { servers: [] };
    if (settings?.value) {
      try {
        botStatus = typeof settings.value === "string" ? JSON.parse(settings.value) : settings.value;
      } catch {
        botStatus = { servers: [] };
      }
    }

    // Para join_voice_channel (chamado pelo frontend), aceitar qualquer servidor habilitado
    if (eventType === "join_voice_channel") {
      const serverConfig = botStatus.servers?.find(
        (server: any) => server.id === guildId && server.enabled
      );
      if (!serverConfig) {
        return jsonResponse({ error: "Server not configured or not enabled" }, 404);
      }
      return await handleVoiceJoin(supabase, { ...serverConfig, channelId: channelId || serverConfig.voiceChannelId || serverConfig.channelId }, userId, username, body.duel_id, body.is_ranked);
    }

    // Para eventos do bot (voice_join / voice_leave), verificar canal de voz configurado
    const serverConfig = botStatus.servers?.find(
      (server: any) => server.id === guildId && server.enabled && (
        server.voiceChannelId === channelId || server.channelId === channelId
      )
    );

    if (!serverConfig) {
      console.log(`[discord-voice-handler] No configuration found for guild ${guildId}, channel ${channelId}`);
      return jsonResponse({ ok: true, skipped: "not_configured" });
    }

    if (eventType === "voice_join") {
      return await handleVoiceJoin(supabase, serverConfig, userId, username, null, false);
    } else if (eventType === "voice_leave") {
      return await handleVoiceLeave(supabase, serverConfig, userId, username);
    } else {
      return jsonResponse({ error: "Invalid event type" }, 400);
    }
  } catch (error: any) {
    console.error("[discord-voice-handler] critical error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});

/**
 * Retorna a lista de servidores parceiros habilitados para o usuário escolher
 * na interface de transmissão de tela.
 */
async function getPartnerServers(supabase: ReturnType<typeof createClient>) {
  try {
    const { data: settings } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();

    let botStatus: { servers: any[] } = { servers: [] };
    if (settings?.value) {
      try {
        botStatus = typeof settings.value === "string" ? JSON.parse(settings.value) : settings.value;
      } catch {
        botStatus = { servers: [] };
      }
    }

    const partnerServers = (botStatus.servers || [])
      .filter((s: any) => s.enabled)
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        channelId: s.voiceChannelId || s.channelId,
        inviteLink: s.inviteLink,
        coverImageUrl: s.coverImageUrl,
      }));

    return jsonResponse({ servers: partnerServers });
  } catch (error: any) {
    return jsonResponse({ error: error.message }, 500);
  }
}

/**
 * Inicia a transmissão de tela do DuelVerse para um canal de voz Discord.
 * Registra no banco de dados que a partida está sendo transmitida.
 */
async function handleStartScreenshare(
  supabase: ReturnType<typeof createClient>,
  body: any
) {
  try {
    const { duel_id, user_id, guild_id, channel_id, discord_invite_link } = body;

    if (!duel_id || !user_id) {
      return jsonResponse({ error: "duel_id and user_id are required" }, 400);
    }

    // Atualizar o duelo com informações de transmissão Discord
    const { error: updateError } = await supabase
      .from("live_duels")
      .update({
        discord_channel_id: channel_id,
        discord_guild_id: guild_id,
        discord_screenshare_active: true,
        discord_invite_link: discord_invite_link || null,
      } as any)
      .eq("id", duel_id);

    if (updateError) {
      console.error("[discord-voice-handler] Error updating duel screenshare:", updateError);
      return jsonResponse({ error: updateError.message }, 500);
    }

    // Broadcast via Supabase Realtime para notificar outros usuários na sala
    await supabase
      .channel(`duel-${duel_id}`)
      .send({
        type: "broadcast",
        event: "discord_screenshare_started",
        payload: {
          duelId: duel_id,
          userId: user_id,
          guildId: guild_id,
          channelId: channel_id,
          inviteLink: discord_invite_link,
        },
      });

    return jsonResponse({
      success: true,
      message: "Screenshare started and duel updated",
    });
  } catch (error: any) {
    console.error("[discord-voice-handler] error in handleStartScreenshare:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}

/**
 * Trata entrada de usuário em canal de voz Discord.
 * - Verifica se o usuário tem conta DuelVerse vinculada
 * - Se vinculado: usa nome DuelVerse, ranked funciona
 * - Se não vinculado: usa nome Discord, ranked desabilitado
 * - Cria DuelRoom automaticamente com nome "discord-{username}"
 * - Notifica via Realtime para o DuelVerse abrir a sala
 */
async function handleVoiceJoin(
  supabase: ReturnType<typeof createClient>,
  serverConfig: any,
  discordUserId: string,
  discordUsername: string,
  existingDuelId: string | null = null,
  requestedRanked: boolean = false
) {
  try {
    // Verificar se o Discord user está vinculado a uma conta DuelVerse
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
    const duelverseUsername = hasLinkedUser ? linkedUser[0].username : null;

    // Nome exibido: DuelVerse se vinculado, Discord se não vinculado
    const displayUsername = duelverseUsername || discordUsername;

    // Ranked só funciona se a conta estiver vinculada ao DuelVerse
    const isRankedAllowed = hasLinkedUser && requestedRanked;
    if (requestedRanked && !hasLinkedUser) {
      console.log(`[discord-voice-handler] User ${discordUsername} requested ranked but has no DuelVerse account linked. Falling back to casual.`);
    }

    // Nome da DuelRoom: "discord-{username}" conforme especificado
    const duelRoomName = `discord-${displayUsername}`;

    // Verificar se já existe uma DuelRoom para este canal Discord
    const channelIdToCheck = serverConfig.voiceChannelId || serverConfig.channelId;
    const { data: existingDuel, error: existingDuelError } = await supabase
      .from("live_duels")
      .select("id, status, creator_id, opponent_id, player3_id, player4_id, max_players, tcg_type, duration_minutes, is_ranked")
      .eq("discord_channel_id", channelIdToCheck)
      .in("status", ["waiting", "in_progress"])
      .maybeSingle();

    if (existingDuelError) {
      console.error("[discord-voice-handler] error checking existing duel:", existingDuelError);
      return jsonResponse({ error: existingDuelError.message }, 500);
    }

    let duelId: string;
    let isNewDuel = false;

    if (existingDuel && !existingDuelId) {
      // Entrar na DuelRoom existente
      duelId = existingDuel.id;
      console.log(`[discord-voice-handler] Joining existing duel ${duelId} for user ${displayUsername}`);

      // Tentar preencher um slot vazio se o usuário tiver conta vinculada
      if (duelverseUserId) {
        const updateData: any = {};
        if (!existingDuel.opponent_id && existingDuel.creator_id !== duelverseUserId) {
          updateData.opponent_id = duelverseUserId;
          updateData.status = "in_progress";
        }
        if (Object.keys(updateData).length > 0) {
          await supabase.from("live_duels").update(updateData).eq("id", duelId);
        }
      }
    } else if (existingDuelId) {
      // Usar duel_id fornecido (transmissão de tela de partida já em andamento)
      duelId = existingDuelId;
    } else {
      // Criar nova DuelRoom automaticamente
      isNewDuel = true;

      const insertData: any = {
        creator_id: duelverseUserId, // null se não vinculado
        discord_channel_id: channelIdToCheck,
        discord_guild_id: serverConfig.id,
        discord_room_name: duelRoomName,
        discord_creator_username: displayUsername,
        discord_creator_discord_id: discordUserId,
        discord_creator_linked: hasLinkedUser,
        status: "waiting",
        tcg_type: "yugioh",
        duration_minutes: 50,
        is_ranked: isRankedAllowed,
        bet_amount: 0,
        player1_lp: 8000,
        player2_lp: 8000,
        player3_lp: 8000,
        player4_lp: 8000,
        custom_counters: [],
      };

      const { data: newDuel, error: newDuelError } = await supabase
        .from("live_duels")
        .insert(insertData)
        .select("id")
        .single();

      if (newDuelError) {
        console.error("[discord-voice-handler] error creating duel:", newDuelError);
        return jsonResponse({ error: newDuelError.message }, 500);
      }

      duelId = newDuel.id;
      console.log(`[discord-voice-handler] Created new duel ${duelId} for Discord user ${displayUsername}`);
    }

    // Broadcast via Supabase Realtime para notificar o DuelVerse sobre o novo usuário Discord
    const broadcastChannel = `discord-voice-${channelIdToCheck}`;
    await supabase
      .channel(broadcastChannel)
      .send({
        type: "broadcast",
        event: "discord_user_joined",
        payload: {
          duelId,
          isNewDuel,
          discordUserId,
          discordUsername,
          duelverseUserId,
          displayUsername,
          hasLinkedAccount: hasLinkedUser,
          isRanked: isRankedAllowed,
          duelRoomName,
          guildId: serverConfig.id,
          channelId: channelIdToCheck,
        },
      });

    console.log(`[discord-voice-handler] User ${displayUsername} (Discord: ${discordUserId}) joined voice channel. DuelRoom: ${duelId}, Ranked: ${isRankedAllowed}, Linked: ${hasLinkedUser}`);

    return jsonResponse({
      success: true,
      duelId,
      isNewDuel,
      duelRoomName,
      userInfo: {
        discordUserId,
        discordUsername,
        duelverseUserId,
        displayUsername,
        hasLinkedAccount: hasLinkedUser,
        isRankedAllowed,
      },
    });
  } catch (error: any) {
    console.error("[discord-voice-handler] error in handleVoiceJoin:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}

/**
 * Trata saída de usuário do canal de voz Discord.
 * - Se criador sair e sala em espera: encerra a sala
 * - Se oponente sair durante partida: registra saída (sem forfeit automático)
 */
async function handleVoiceLeave(
  supabase: ReturnType<typeof createClient>,
  serverConfig: any,
  discordUserId: string,
  discordUsername: string
) {
  try {
    const { data: linkedUser } = await supabase.rpc(
      "get_user_by_discord_id",
      { p_discord_id: discordUserId }
    );

    const hasLinkedUser = Boolean(linkedUser && linkedUser.length > 0);
    const duelverseUserId = hasLinkedUser ? linkedUser[0].user_id : null;
    const displayUsername = hasLinkedUser ? linkedUser[0].username : discordUsername;

    const channelIdToCheck = serverConfig.voiceChannelId || serverConfig.channelId;

    const { data: activeDuel } = await supabase
      .from("live_duels")
      .select("id, status, creator_id, opponent_id")
      .eq("discord_channel_id", channelIdToCheck)
      .in("status", ["waiting", "in_progress"])
      .maybeSingle();

    if (activeDuel) {
      console.log(`[discord-voice-handler] User ${displayUsername} left voice channel, duel ${activeDuel.id} status: ${activeDuel.status}`);

      // Se o criador sair e a sala ainda estiver em espera, encerrar a sala
      if (
        activeDuel.status === "waiting" &&
        duelverseUserId &&
        activeDuel.creator_id === duelverseUserId
      ) {
        await supabase
          .from("live_duels")
          .update({ status: "finished", finished_at: new Date().toISOString() } as any)
          .eq("id", activeDuel.id);
        console.log(`[discord-voice-handler] Duel ${activeDuel.id} closed because creator left waiting room`);
      }

      // Broadcast saída via Realtime
      await supabase
        .channel(`discord-voice-${channelIdToCheck}`)
        .send({
          type: "broadcast",
          event: "discord_user_left",
          payload: {
            duelId: activeDuel.id,
            discordUserId,
            discordUsername,
            duelverseUserId,
            displayUsername,
          },
        });
    }

    return jsonResponse({
      success: true,
      message: `User ${displayUsername} left voice channel processed`,
    });
  } catch (error: any) {
    console.error("[discord-voice-handler] error in handleVoiceLeave:", error);
    return jsonResponse({ error: error.message }, 500);
  }
}
