// Accepts a matchmaking invite created by another user. Authenticates the
// caller via JWT, then runs the SECURITY DEFINER RPC that pairs the two users
// and returns the duel id so the client can redirect into the duel room.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing_auth" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return json({ error: "invalid_token" }, 401);

    let body: { invite_id?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (!body?.invite_id) return json({ error: "missing_invite_id" }, 400);

    const { data, error } = await supabase.rpc("accept_matchmaking_invite", {
      p_invite_id: body.invite_id,
      p_user_id: userData.user.id,
    });

    if (error) {
      console.error("[accept-match-invite] rpc error:", error);
      return json({ error: error.message }, 500);
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) return json({ error: "no_result" }, 500);

    return json(row);
  } catch (err: any) {
    console.error("[accept-match-invite] error:", err);
    return json({ error: err.message ?? "internal_error" }, 500);
  }
});
