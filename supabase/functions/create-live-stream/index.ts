import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dailyApiKey = Deno.env.get('DAILY_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      throw new Error('Não autorizado');
    }

    // Verificar se é admin ou participante do duelo
    const { duel_id, tournament_id, match_id, recording_enabled, featured } = await req.json();

    let isAuthorized = false;

    // Verificar se é admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleData) {
      isAuthorized = true;
    } else if (duel_id) {
      // Verificar se é participante do duelo
      const { data: duelData } = await supabase
        .from('live_duels')
        .select('creator_id, opponent_id')
        .eq('id', duel_id)
        .single();

      if (duelData && (duelData.creator_id === user.id || duelData.opponent_id === user.id)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new Error('Não autorizado');
    }

    // Verificar se já existe uma stream ativa para este duel
    if (duel_id) {
      const { data: existingStream, error: checkError } = await supabase
        .from('live_streams')
        .select('id')
        .eq('duel_id', duel_id)
        .eq('status', 'active')
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') throw checkError;

      if (existingStream) {
        return new Response(
          JSON.stringify({ error: 'Já existe uma transmissão ativa para este duelo' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Criar sala Daily
    const roomName = `duelverse_live_${duel_id || match_id || tournament_id}_${Date.now()}`;
    
    const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${dailyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "public",
        properties: {
          enable_chat: true,
          enable_screenshare: false,
          enable_knocking: false,
          exp: Math.floor(Date.now() / 1000) + 86400, // 24h
          eject_at_room_exp: true,
          start_video_off: false,
          start_audio_off: false,
          owner_only_broadcast: false,
          enable_recording: recording_enabled ? "cloud" : "off",
        },
      }),
    });

    const dailyRoom = await dailyResponse.json();
    
    if (!dailyResponse.ok) {
      throw new Error(dailyRoom.error || 'Erro ao criar sala Daily');
    }

    // Salvar stream no banco
    const { data: stream, error: streamError } = await supabase
      .from('live_streams')
      .insert({
        tournament_id,
        match_id: match_id || duel_id,
        duel_id: duel_id,
        daily_room_name: dailyRoom.name,
        daily_room_url: dailyRoom.url,
        recording_enabled,
        featured: featured || false,
      })
      .select()
      .single();

    if (streamError) throw streamError;

    console.log('Stream criada:', stream.id);

    return new Response(
      JSON.stringify({ success: true, stream, room: dailyRoom }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});