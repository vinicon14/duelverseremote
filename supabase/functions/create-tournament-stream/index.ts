import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { match_id } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: match, error: matchError } = await supabase
      .from("tournament_matches")
      .select("id, player1_id, player2_id")
      .eq("id", match_id)
      .single();

    if (matchError || !match) {
      throw new Error("Match not found");
    }

    if (user.id !== match.player1_id && user.id !== match.player2_id) {
      throw new Error("Only participants can create a stream for this match");
    }

    const dailyApiKey = Deno.env.get("DAILY_API_KEY");
    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dailyApiKey}`,
      },
      body: JSON.stringify({
        properties: {
          enable_screenshare: true,
          enable_chat: true,
          start_video_off: false,
          start_audio_off: false,
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to create Daily.co room");
    }

    const room = await response.json();

    const { data: stream, error: streamError } = await supabase
      .from("lives")
      .insert({
        room_id: room.id,
        room_url: room.url,
        creator_id: user.id,
        tournament_match_id: match.id,
        title: `Tournament Match: ${match_id}`,
      })
      .select()
      .single();

    if (streamError) {
      throw streamError;
    }

    return new Response(JSON.stringify({ stream }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
