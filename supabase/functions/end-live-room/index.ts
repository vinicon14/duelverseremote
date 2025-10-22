// supabase/functions/end-live-room/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { room_name, live_id } = await req.json();

    if (!room_name || !live_id) {
      return new Response(JSON.stringify({ error: "room_name and live_id are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const response = await fetch(`https://api.daily.co/v1/rooms/${room_name}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      return new Response(JSON.stringify({ error: "Failed to delete Daily.co room", details: errorData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { error: liveError } = await supabase
      .from("lives")
      .update({ status: "finished", finished_at: new Date().toISOString() })
      .eq("id", live_id);

    if (liveError) {
      return new Response(JSON.stringify({ error: "Failed to update live stream status", details: liveError }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
