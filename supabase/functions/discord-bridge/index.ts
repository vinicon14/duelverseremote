import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const path = url.pathname;

    // Discord webhook endpoint - Discord sends messages to this URL
    if (path.endsWith("/webhook") || path.includes("discord-webhook")) {
      const payload = await req.json();
      
      console.log("Discord webhook received:", JSON.stringify(payload));
      
      // Discord sends messages in this format
      if (payload.content || (payload.message && payload.message.content)) {
        const content = payload.content || payload.message?.content;
        const username = payload.author?.username || payload.username || "Discord User";
        
        if (content) {
          const { error } = await supabase.from("global_chat_messages").insert({
            user_id: "discord",
            username: `[Discord] ${username}`,
            message: content,
            tcg_type: "ygopro",
          });

          if (error) {
            console.error("Error inserting message:", error);
            return new Response(JSON.stringify({ error: error.message }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { type, username, content, webhookUrl } = body;

    // Send message from DuelVerse chat to Discord
    if (type === "chat_to_discord" && webhookUrl) {
      const embed = {
        embeds: [{
          title: "💬 Chat Global - DuelVerse",
          description: content,
          color: 0x8B5CF6,
          footer: {
            text: `Enviado por ${username}`
          },
          timestamp: new Date().toISOString()
        }]
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(embed)
      });

      return new Response(JSON.stringify({ success: response.ok }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get Discord config (webhook URL and invite link)
    if (type === "get_config") {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "discord_bot_status")
        .maybeSingle();

      let config = { webhookUrl: "", inviteLink: "", webhookEndpoint: "" };
      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        const enabledServers = parsed.servers?.filter((s: any) => s.enabled) || [];
        if (enabledServers.length > 0) {
          config = {
            webhookUrl: enabledServers[0].webhookUrl || "",
            inviteLink: enabledServers[0].inviteLink || "",
            webhookEndpoint: `${supabaseUrl}/functions/v1/discord-bridge/webhook`,
          };
        }
      }

      return new Response(JSON.stringify(config), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});