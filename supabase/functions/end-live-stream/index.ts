import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0";
import { corsHeaders } from "../_shared/cors.ts";

const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { live_id } = await req.json();

    if (!live_id) {
      throw new Error("O 'live_id' é obrigatório.");
    }

    if (!DAILY_API_KEY) {
      throw new Error("A chave da API Daily.co não está configurada.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Obter o nome da sala a partir do URL
    const { data: liveData, error: liveError } = await supabase
      .from('lives')
      .select('daily_room_url')
      .eq('id', live_id)
      .single();

    if (liveError) throw liveError;
    if (!liveData) throw new Error("Transmissão não encontrada.");

    const roomName = liveData.daily_room_url.split('/').pop();

    if (!roomName) {
        throw new Error("URL da sala inválido.");
    }

    // Deletar a sala no Daily.co
    const dailyResponse = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${DAILY_API_KEY}`,
      },
    });

    if (!dailyResponse.ok) {
        // Se a sala já foi deletada, não tratar como erro fatal
        if (dailyResponse.status !== 404) {
            const errorBody = await dailyResponse.text();
            throw new Error(`Erro ao deletar sala no Daily.co: ${errorBody}`);
        }
    }

    // Atualizar o status da transmissão para 'finished'
    const { data: updatedLive, error: updateError } = await supabase
      .from('lives')
      .update({ status: 'finished', ended_at: new Date().toISOString() })
      .eq('id', live_id)
      .select('id')
      .single();

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, ended_live_id: updatedLive.id }), {
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
