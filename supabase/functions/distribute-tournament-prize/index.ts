import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.2";

serve(async (req) => {
  const { tournament_id, winner_id } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("prize_pool, created_by")
    .eq("id", tournament_id)
    .single();

  if (tournamentError) {
    return new Response(JSON.stringify({ error: tournamentError.message }), {
      status: 500,
    });
  }

  const { error: prizeError } = await supabase.rpc(
    "transfer_duelcoins",
    {
      sender_id: tournament.created_by,
      receiver_id: winner_id,
      amount: tournament.prize_pool,
    },
  );

  if (prizeError) {
    return new Response(JSON.stringify({ error: prizeError.message }), {
      status: 500,
    });
  }

  const { error: updateError } = await supabase
    .from("tournaments")
    .update({ status: "completed", winner_id })
    .eq("id", tournament_id);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
    });
  }

  return new Response(null, { status: 204 });
});
