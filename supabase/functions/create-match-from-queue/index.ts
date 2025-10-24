import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.31.0";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { player1Id, player2Id, isRanked } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Etapa 1: Obter IDs das entradas da fila de ambos os jogadores
    const { data: queueEntries, error: queueError } = await supabase
      .from('matchmaking_queue')
      .select('id')
      .in('user_id', [player1Id, player2Id])
      .eq('status', 'waiting');

    if (queueError) throw queueError;
    if (!queueEntries || queueEntries.length === 0) {
      throw new Error("As entradas da fila não foram encontradas ou já foram processadas.");
    }

    const queueIds = queueEntries.map(entry => entry.id);

    // Etapa 2: Criar o duelo
    const { data: duel, error: duelError } = await supabase
      .from('live_duels')
      .insert({
        creator_id: player1Id,
        opponent_id: player2Id,
        room_name: `Match ${isRanked ? 'Ranqueado' : 'Casual'}`,
        status: 'in_progress',
        is_ranked: isRanked,
        duration_minutes: 50,
        started_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (duelError) throw duelError;

    // Etapa 3: Atualizar as entradas da fila para 'matched' e incluir o ID do duelo
    await supabase
      .from('matchmaking_queue')
      .update({ status: 'matched', duel_id: duel.id })
      .in('id', queueIds);

    return new Response(JSON.stringify({ duelId: duel.id }), {
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