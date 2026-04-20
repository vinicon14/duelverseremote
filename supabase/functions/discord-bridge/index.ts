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

    if (path.endsWith("/webhook") || path.includes("discord-webhook")) {
      const payload = await req.json();
      
      console.log("Discord webhook received:", JSON.stringify(payload));
      
      if (payload.content || (payload.message && payload.message.content)) {
        const content = payload.content || payload.message?.content;
        const guildId = payload.guild_id ?? payload.guild?.id;
        const channelId = payload.channel_id ?? payload.channel?.id;
        const username = payload.author?.username || payload.username || "Discord User";
        
        if (content) {
          const origin = (guildId && channelId) ? `[Discord ${guildId}:${channelId}]` : "[Discord]";
          const { error } = await supabase.from("global_chat_messages").insert({
            user_id: "discord",
            username: `${origin} ${username}`.trim(),
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

    if (type === "chat_to_discord") {
      const urls: string[] = [];
      if (Array.isArray((body as any).webhookUrls)) {
        (body as any).webhookUrls.forEach((u: string) => urls.push(u));
      } else if (typeof (body as any).webhookUrl === "string") {
        urls.push((body as any).webhookUrl);
      }
      if (urls.length === 0 && typeof webhookUrl === "string") {
        urls.push(webhookUrl);
      }
      
      if (urls.length > 0) {
        const embed = {
          embeds: [{
            title: "💬 Chat Global - DuelVerse",
            description: content,
            color: 0x8B5CF6,
            footer: { text: `Enviado por ${username}` },
            timestamp: new Date().toISOString()
          }]
        };
        const results: Array<{ ok: boolean; url: string }> = [];
        for (const url of urls) {
          try {
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(embed)
            });
            results.push({ ok: response.ok, url });
          } catch (e) {
            results.push({ ok: false, url });
          }
        }
        return new Response(JSON.stringify({ success: results.every(r => r.ok), details: results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } else {
        return new Response(JSON.stringify({ error: "No webhook URLs configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (type === "get_config") {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "discord_bridge_config")
        .maybeSingle();

      let config = { bridges: [] as any[], webhookEndpoint: "" };
      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        config.bridges = parsed.bridges || [];
        config.webhookEndpoint = parsed.webhookEndpoint || `${supabaseUrl}/functions/v1/discord-bridge/webhook`;
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