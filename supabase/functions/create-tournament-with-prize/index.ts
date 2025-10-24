import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { name, description, start_date, end_date, max_participants, prize_pool, entry_fee } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("duelcoins")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Profile not found");
    }

    if (profile.duelcoins < prize_pool) {
      throw new Error("Insufficient DuelCoins to cover the prize pool");
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ duelcoins: profile.duelcoins - prize_pool })
      .eq("user_id", user.id);

    if (updateError) {
      throw updateError;
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .insert({
        name,
        description,
        start_date,
        end_date,
        max_participants,
        prize_pool,
        entry_fee,
        created_by: user.id,
      })
      .select()
      .single();

    if (tournamentError) {
      // Rollback the duelcoin deduction
      await supabase
        .from("profiles")
        .update({ duelcoins: profile.duelcoins })
        .eq("user_id", user.id);
      throw tournamentError;
    }

    return new Response(JSON.stringify({ tournament }), {
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
