// supabase/functions/create-live-room/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { match_id } = await req.json();

    if (!match_id) {
      return new Response(JSON.stringify({ error: "match_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const response = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: `duelverse_live_${match_id}`,
        privacy: "public",
        properties: {
          enable_chat: true,
          enable_screenshare: false,
          enable_knocking: false,
          exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
          eject_at_room_exp: true,
          start_video_off: false,
          start_audio_off: false,
          owner_only_broadcast: true,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({ error: "Failed to create Daily.co room", details: errorData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const room = await response.json();
    const roomUrl = room.url;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: liveData, error: liveError } = await supabase
      .from("lives")
      .insert([{ match_id, daily_room_url: roomUrl, status: "active" }])
      .select()
      .single();

    if (liveError) {
      return new Response(JSON.stringify({ error: "Failed to save live stream to database", details: liveError }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ roomUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
