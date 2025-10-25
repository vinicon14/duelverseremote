import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.2";

serve(async (req) => {
  const { tournament_id, user_id } = await req.json();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tournament, error: tournamentError } = await supabase
    .from("tournaments")
    .select("entry_fee, created_by")
    .eq("id", tournament_id)
    .single();

  if (tournamentError) {
    return new Response(JSON.stringify({ error: tournamentError.message }), {
      status: 500,
    });
  }

  const { data: user, error: userError } = await supabase
    .from("profiles")
    .select("duelcoins")
    .eq("user_id", user_id)
    .single();

  if (userError) {
    return new Response(JSON.stringify({ error: userError.message }), {
      status: 500,
    });
  }

  if (user.duelcoins < tournament.entry_fee) {
    return new Response(JSON.stringify({ error: "Insufficient DuelCoins" }), {
      status: 400,
    });
  }

  const { error: debitError } = await supabase.rpc(
    "transfer_duelcoins",
    {
      sender_id: user_id,
      receiver_id: tournament.created_by,
      amount: tournament.entry_fee,
    },
  );

  if (debitError) {
    return new Response(JSON.stringify({ error: debitError.message }), {
      status: 500,
    });
  }

  return new Response(null, { status: 204 });
});
