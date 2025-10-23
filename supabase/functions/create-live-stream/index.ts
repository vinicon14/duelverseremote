import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0";
import { corsHeaders } from "../_shared/cors.ts";

const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { duel_id } = await req.json();

    if (!duel_id) {
      throw new Error("O 'duel_id' é obrigatório.");
    }

    if (!DAILY_API_KEY) {
      throw new Error("A chave da API Daily.co não está configurada.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verificar se já existe uma live para este duelo
    const { data: existingLive, error: existingLiveError } = await supabase
      .from('lives')
      .select('id, daily_room_url')
      .eq('duel_id', duel_id)
      .maybeSingle();

    if (existingLiveError) throw existingLiveError;

    if (existingLive) {
      return new Response(JSON.stringify({ live: existingLive }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Criar sala no Daily.co
    const dailyRoomData = {
      name: `duelverse_live_${duel_id}`,
      privacy: "public",
      properties: {
        enable_chat: true,
        enable_screenshare: false,
        enable_knocking: false,
        exp: Math.floor(Date.now() / 1000) + 86400, // 24 horas
        eject_at_room_exp: true,
        owner_only_broadcast: true,
        enable_recording: "cloud",
        recording_layout: "single-participant"
      },
    };

    const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DAILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dailyRoomData),
    });

    if (!dailyResponse.ok) {
      const errorBody = await dailyResponse.text();
      throw new Error(`Erro ao criar sala no Daily.co: ${errorBody}`);
    }

    const room = await dailyResponse.json();
    const roomUrl = room.url;

    // Inserir na tabela 'lives'
    const { data: newLive, error: insertError } = await supabase
      .from('lives')
      .insert({
        duel_id: duel_id,
        daily_room_url: roomUrl,
        status: 'active',
      })
      .select('id, daily_room_url')
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ live: newLive }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
