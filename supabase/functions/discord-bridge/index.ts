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
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { type, username, content, serverId, channelId, discordUserId }: DiscordMessage & { discordUserId?: string } = await req.json();

    if (type === "discord_to_chat") {
      const { error } = await supabase.from("global_chat_messages").insert({
        user_id: discordUserId || "discord",
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

    if (type === "chat_to_discord") {
      return new Response(JSON.stringify({
        success: true,
        serverId,
        channelId,
        username,
        content,
        message: "Message ready to send to Discord"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "get_servers") {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "discord_bot_status")
        .maybeSingle();

      let servers: any[] = [];
      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        servers = parsed.servers?.filter((s: any) => s.enabled) || [];
      }

      return new Response(JSON.stringify({ servers }), {
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