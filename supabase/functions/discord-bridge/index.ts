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
    const isDiscordWebhook =
      path.endsWith("/webhook") ||
      path.includes("discord-webhook") ||
      url.searchParams.get("source") === "discord";

    console.log(`[discord-bridge] ${req.method} path=${path} isWebhook=${isDiscordWebhook}`);

    // ===========================================================
    // ENTRADA DO DISCORD (bot Java POSTa aqui)
    // ===========================================================
    if (isDiscordWebhook) {
      const payload = await req.json();
      console.log("Discord webhook received:", JSON.stringify(payload));

      const content = payload.content || payload.message?.content;
      const discordUserId = payload.author?.id || payload.discord_user_id;
      const discordUsername = payload.author?.username || payload.username || "Discord User";
      const discordAvatar = payload.author?.avatar_url || payload.avatar_url || null;

      if (!content || !discordUserId) {
        return new Response(JSON.stringify({ ok: true, skipped: "no content or user" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Buscar perfil DuelVerse vinculado a este Discord ID
      const { data: linkedUser } = await supabase
        .rpc("get_user_by_discord_id", { p_discord_id: discordUserId });

      let userIdToUse: string;
      let usernameLabel: string;

      if (linkedUser && linkedUser.length > 0) {
        // Usuário tem conta vinculada: posta como ele mesmo
        userIdToUse = linkedUser[0].user_id;
        usernameLabel = linkedUser[0].username;
      } else {
        // Sem vinculação: usa um placeholder genérico (sem RLS-friendly user_id real)
        // Estratégia: armazenar como mensagem do "discord_proxy" e prefixar username
        // Como user_id é NOT NULL, usamos o creator do bot — vamos rejeitar mensagens não vinculadas
        return new Response(JSON.stringify({
          ok: true,
          skipped: "discord_account_not_linked",
          hint: "User must link their Discord account at duelverse.site/profile",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await supabase.from("global_chat_messages").insert({
        user_id: userIdToUse,
        message: content,
        tcg_type: "yugioh",
      });

      if (error) {
        console.error("Error inserting message:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, posted_as: usernameLabel }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===========================================================
    // CHAMADAS DO FRONTEND / TRIGGER
    // ===========================================================
    const body = await req.json();
    const { type, username, content, channelId, botToken, avatarUrl, userId } = body;

    if (type === "create_webhook") {
      if (!channelId || !botToken) {
        return new Response(JSON.stringify({ error: "Missing channelId or botToken" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "DuelVerse Global Chat", avatar: null }),
      });
      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: response.ok ? 200 : 400,
      });
    }

    // Buscar configuração do Discord
    const { data: cfg } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "discord_bot_status")
      .maybeSingle();

    let botStatus: { status: string; inviteLink: string; servers: any[] } = {
      status: "",
      inviteLink: "",
      servers: [],
    };
    if (cfg?.value) {
      try {
        botStatus = typeof cfg.value === "string" ? JSON.parse(cfg.value) : cfg.value;
      } catch {}
    }

    if (type === "chat_to_discord") {
      const activeServers = (botStatus.servers || []).filter((s: any) => s.enabled && s.webhookUrl);
      const urls: string[] = activeServers.map((s: any) => s.webhookUrl);

      if (urls.length === 0) {
        return new Response(JSON.stringify({ error: "No active Discord server configured" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Se userId foi fornecido, usar avatar Discord vinculado (se houver)
      let finalUsername = username;
      let finalAvatar = avatarUrl;

      if (userId) {
        const { data: discordLink } = await supabase
          .rpc("get_discord_link_for_user", { p_user_id: userId });
        if (discordLink && discordLink.length > 0) {
          finalUsername = discordLink[0].discord_username || username;
          finalAvatar = discordLink[0].discord_avatar_url || avatarUrl;
        }
      }

      const webhookPayload = {
        content,
        username: finalUsername || "DuelVerse",
        avatar_url: finalAvatar || undefined,
        allowed_mentions: { parse: [] },
      };

      const results: Array<{ ok: boolean; url: string }> = [];
      for (const targetUrl of urls) {
        try {
          const response = await fetch(targetUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });
          results.push({ ok: response.ok, url: targetUrl });
        } catch {
          results.push({ ok: false, url: targetUrl });
        }
      }

      return new Response(JSON.stringify({
        success: results.every((r) => r.ok),
        details: results,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (type === "get_config") {
      let inviteLink = botStatus.inviteLink;
      if (!inviteLink && botStatus.servers?.length > 0) {
        const sWithLink = botStatus.servers.find((s: any) => s.inviteLink);
        inviteLink = sWithLink ? sWithLink.inviteLink : inviteLink;
      }
      const bridgeEnabled = (botStatus.servers || []).some((s: any) => s.enabled && s.webhookUrl);
      return new Response(JSON.stringify({ inviteLink, bridgeEnabled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
