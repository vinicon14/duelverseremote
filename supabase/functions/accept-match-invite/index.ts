import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: unknown, status = 200) =>
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
    if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);

    const body = await req.json().catch(() => null);
    const inviteId = body?.inviteId;
    if (!inviteId || typeof inviteId !== "string") {
      return jsonResponse({ error: "Missing inviteId" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Invalid user token" }, 401);

    const { data, error } = await adminClient.rpc("accept_matchmaking_invite", {
      p_invite_id: inviteId,
      p_user_id: user.id,
    });

    if (error) {
      console.error("accept_matchmaking_invite error:", error);
      return jsonResponse({ error: error.message }, 500);
    }

    const result = Array.isArray(data) ? data[0] : data;
    const status = result?.status || "unavailable";
    const duelId = result?.duel_id || null;

    // When the invite is successfully matched, delete the announcement
    // messages we posted to Discord so they don't linger in the channel.
    if (status === "matched" || status === "already_matched") {
      try {
        const { data: invite } = await adminClient
          .from("matchmaking_invites")
          .select("discord_messages")
          .eq("id", inviteId)
          .maybeSingle();

        const messages = Array.isArray(invite?.discord_messages) ? invite!.discord_messages : [];
        if (messages.length > 0) {
          await Promise.all(
            messages.map(async (m: any) => {
              if (!m?.webhookUrl || !m?.messageId) return;
              try {
                await fetch(`${m.webhookUrl}/messages/${m.messageId}`, { method: "DELETE" });
              } catch (delErr) {
                console.warn("[accept-match-invite] failed to delete discord message", delErr);
              }
            }),
          );
          await adminClient
            .from("matchmaking_invites")
            .update({ discord_messages: [] })
            .eq("id", inviteId);
        }
      } catch (cleanupErr) {
        console.warn("[accept-match-invite] cleanup error", cleanupErr);
      }
    }

    return jsonResponse({
      success: status === "matched" || status === "already_matched",
      status,
      duelId,
      message: result?.message || status,
    });
  } catch (error: any) {
    console.error("accept-match-invite error:", error);
    return jsonResponse({ error: error.message || "Internal error" }, 500);
  }
});