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
            tcg_type: "yugioh",
          });

          if (error) {
            console.error("Error inserting message:", error);
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { type, username, content, channelId, botToken } = body;

    // Permitir criação de webhook sem CORS
    if (type === "create_webhook") {
      if (!channelId || !botToken) {
        return new Response(JSON.stringify({ error: "Missing channelId or botToken" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "DuelVerse Global Chat", avatar: null })
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: response.ok ? 200 : 400 });
    }

    // Buscar a configuração master do Discord setada no painel de administração
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();

    let botStatus = { status: "", inviteLink: "", servers: [] as any[] };
    if (data?.value) {
      if (typeof data.value === 'string') {
        try { botStatus = JSON.parse(data.value); } catch(e) {}
      } else {
        botStatus = data.value;
      }
    }

    if (type === "chat_to_discord") {
      const activeServers = (botStatus.servers || []).filter((s: any) => s.enabled && s.webhookUrl);
      const urls = activeServers.map((s: any) => s.webhookUrl as string);

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
        for (const targetUrl of urls) {
          try {
            const response = await fetch(targetUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(embed)
            });
            results.push({ ok: response.ok, url: targetUrl });
          } catch (e) {
            results.push({ ok: false, url: targetUrl });
          }
        }
        return new Response(JSON.stringify({ success: results.every(r => r.ok), details: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } else {
        return new Response(JSON.stringify({ error: "Nenhum servidor Discord ativo e configurado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    if (type === "get_config") {
      let inviteLink = botStatus.inviteLink;
      if (!inviteLink && botStatus.servers?.length > 0) {
        const sWithLink = botStatus.servers.find((s: any) => s.inviteLink);
        inviteLink = sWithLink ? sWithLink.inviteLink : inviteLink;
      }
      const bridgeEnabled = (botStatus.servers || []).some((s: any) => s.enabled && s.webhookUrl);
      return new Response(JSON.stringify({ inviteLink, bridgeEnabled }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});