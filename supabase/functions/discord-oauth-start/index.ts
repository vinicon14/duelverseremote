import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("DISCORD_CLIENT_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!clientId) {
      return new Response(JSON.stringify({ error: "DISCORD_CLIENT_ID not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let origin = "https://duelverse.site";
    let returnPath = "/profile";

    try {
      const body = await req.json();
      if (typeof body?.origin === "string" && /^https?:\/\//.test(body.origin)) {
        origin = body.origin;
      }
      if (typeof body?.returnPath === "string" && body.returnPath.startsWith("/")) {
        returnPath = body.returnPath;
      }
    } catch {
      // body is optional
    }

    const state = btoa(JSON.stringify({
      user_id: userData.user.id,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
      origin,
      return_path: returnPath,
    }));

    const redirectUri = `${supabaseUrl}/functions/v1/discord-oauth-callback`;
    const scopes = [
      "identify",
      "email",
      "guilds",
      "guilds.join",
      "connections"
    ].join(" ");

    const oauthUrl = new URL("https://discord.com/oauth2/authorize");
    oauthUrl.searchParams.set("client_id", clientId);
    oauthUrl.searchParams.set("redirect_uri", redirectUri);
    oauthUrl.searchParams.set("response_type", "code");
    oauthUrl.searchParams.set("scope", scopes);
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("prompt", "consent");
    oauthUrl.searchParams.set("integration_type", "0");
    oauthUrl.searchParams.set("permissions", "8");

    return new Response(JSON.stringify({ url: oauthUrl.toString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("discord-oauth-start error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});