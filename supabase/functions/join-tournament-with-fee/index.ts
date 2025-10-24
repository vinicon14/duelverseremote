import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tournament_id } = await req.json();
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

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("entry_fee, created_by")
      .eq("id", tournament_id)
      .single();

    if (tournamentError || !tournament) {
      throw new Error("Tournament not found");
    }

    const { data: participantProfile, error: participantProfileError } = await supabase
      .from("profiles")
      .select("duelcoins")
      .eq("user_id", user.id)
      .single();

    if (participantProfileError || !participantProfile) {
      throw new Error("Participant profile not found");
    }

    if (participantProfile.duelcoins < tournament.entry_fee) {
      throw new Error("Insufficient DuelCoins to pay the entry fee");
    }

    // Deduct entry fee from participant
    const { error: deductError } = await supabase
      .from("profiles")
      .update({ duelcoins: participantProfile.duelcoins - tournament.entry_fee })
      .eq("user_id", user.id);

    if (deductError) {
      throw deductError;
    }

    // Add entry fee to creator
    const { data: creatorProfile, error: creatorProfileError } = await supabase
        .from("profiles")
        .select("duelcoins")
        .eq("user_id", tournament.created_by)
        .single();

    if (creatorProfileError || !creatorProfile) {
        // Rollback participant's duelcoin deduction
        await supabase
            .from("profiles")
            .update({ duelcoins: participantProfile.duelcoins })
            .eq("user_id", user.id);
        throw new Error("Creator profile not found");
    }

    const { error: creditError } = await supabase
      .from("profiles")
      .update({ duelcoins: creatorProfile.duelcoins + tournament.entry_fee })
      .eq("user_id", tournament.created_by);

    if (creditError) {
      // Rollback participant's duelcoin deduction
      await supabase
        .from("profiles")
        .update({ duelcoins: participantProfile.duelcoins })
        .eq("user_id", user.id);
      throw creditError;
    }

    // Add participant to tournament
    const { error: insertError } = await supabase
      .from("tournament_participants")
      .insert({ tournament_id, user_id: user.id });

    if (insertError) {
      // Rollback both duelcoin transactions
      await supabase
        .from("profiles")
        .update({ duelcoins: participantProfile.duelcoins })
        .eq("user_id", user.id);
      await supabase
        .from("profiles")
        .update({ duelcoins: creatorProfile.duelcoins })
        .eq("user_id", tournament.created_by);
      throw insertError;
    }

    return new Response(JSON.stringify({ success: true }), {
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
