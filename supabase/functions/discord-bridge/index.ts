import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DiscordMessage {
  type: string;
  username: string;
  content: string;
  serverId?: string;
  channelId?: string;
  webhookUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type, username, content, webhookUrl }: DiscordMessage = await req.json();

    if (type === "discord_to_chat") {
      const { error } = await supabase.from("global_chat_messages").insert({
        user_id: "discord",
        username: `[Discord] ${username}`,
        message: content,
        tcg_type: "ygopro",
      });

      if (error) {
        console.error("Error inserting message:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "chat_to_discord" && webhookUrl) {
      const embed = {
        embeds: [{
          title: "💬 Nova mensagem no Chat Global",
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

    if (type === "get_webhook") {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "discord_bot_status")
        .maybeSingle();

      let webhookUrl = "";
      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        const enabledServers = parsed.servers?.filter((s: any) => s.enabled && s.webhookUrl) || [];
        if (enabledServers.length > 0) {
          webhookUrl = enabledServers[0].webhookUrl;
        }
      }

      return new Response(JSON.stringify({ webhookUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid type" }), {
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