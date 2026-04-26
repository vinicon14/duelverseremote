// Discord Interactions Endpoint
// Receives Slash Commands from Discord users and replicates them into the
// DuelVerse Global Chat. Configure this function URL in the Discord Developer
// Portal under "Interactions Endpoint URL".
//
// Supported commands (auto-registered on first GET ?action=register):
//   /dv <message>   -> posts <message> into the DuelVerse global chat
//   /duelverse <message> -> alias

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nacl from "https://esm.sh/tweetnacl@1.0.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature-ed25519, x-signature-timestamp",
};

const DISCORD_API = "https://discord.com/api/v10";

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
} as const;

const hexToUint8Array = (hex: string): Uint8Array => {
  const clean = hex.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const verifySignature = (
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string,
): boolean => {
  if (!signature || !timestamp) {
    console.warn("[discord-interactions] missing signature or timestamp", {
      hasSig: !!signature,
      hasTs: !!timestamp,
    });
    return false;
  }
  try {
    const enc = new TextEncoder();
    const sigBytes = hexToUint8Array(signature);
    const keyBytes = hexToUint8Array(publicKey);
    console.log("[discord-interactions] verify lengths", {
      sig: sigBytes.length,
      key: keyBytes.length,
      tsLen: timestamp.length,
      bodyLen: rawBody.length,
    });
    if (sigBytes.length !== 64 || keyBytes.length !== 32) {
      console.error("[discord-interactions] invalid hex lengths");
      return false;
    }
    return nacl.sign.detached.verify(
      enc.encode(timestamp + rawBody),
      sigBytes,
      keyBytes,
    );
  } catch (err) {
    console.error("[discord-interactions] verify error:", err);
    return false;
  }
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const buildAvatarUrl = (userId: string | undefined, avatarHash: string | null | undefined): string | null => {
  if (!userId || !avatarHash) return null;
  const ext = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}`;
};

// Register the global slash command via the Discord REST API
async function registerGlobalCommand(): Promise<{ ok: boolean; data: any }> {
  const token = Deno.env.get("DISCORD_BOT_TOKEN");
  const appId = Deno.env.get("DISCORD_CLIENT_ID");
  if (!token || !appId) {
    return { ok: false, data: { error: "Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID" } };
  }

  const commands = [
    {
      name: "dv",
      description: "Send a message to the DuelVerse Global Chat",
      options: [
        {
          type: 3, // STRING
          name: "message",
          description: "The message to broadcast",
          required: true,
        },
      ],
    },
    {
      name: "duelverse",
      description: "Send a message to the DuelVerse Global Chat",
      options: [
        {
          type: 3,
          name: "message",
          description: "The message to broadcast",
          required: true,
        },
      ],
    },
  ];

  const results: any[] = [];
  for (const cmd of commands) {
    const res = await fetch(`${DISCORD_API}/applications/${appId}/commands`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
    });
    const data = await res.json().catch(() => ({}));
    results.push({ name: cmd.name, status: res.status, data });
  }
  return { ok: true, data: results };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Manual command registration: GET ?action=register
  if (req.method === "GET" && url.searchParams.get("action") === "register") {
    const result = await registerGlobalCommand();
    return json(result);
  }

  if (req.method === "GET") {
    return json({
      ok: true,
      message: "Discord Interactions Endpoint is live. Use POST for interactions or ?action=register to register slash commands.",
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const publicKey = Deno.env.get("DISCORD_PUBLIC_KEY");
  if (!publicKey) {
    return json({ error: "DISCORD_PUBLIC_KEY not configured" }, 500);
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = await req.text();

  if (!verifySignature(rawBody, signature, timestamp, publicKey)) {
    console.warn("[discord-interactions] invalid signature");
    return new Response("invalid request signature", { status: 401 });
  }

  let interaction: any;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Handle PING (Discord verification handshake)
  if (interaction.type === InteractionType.PING) {
    console.log("[discord-interactions] PING handshake OK");
    return json({ type: InteractionResponseType.PONG });
  }

  // Handle slash commands
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const commandName: string = interaction?.data?.name ?? "";
    const options: Array<{ name: string; value: string }> = interaction?.data?.options ?? [];
    const messageOpt = options.find((o) => o.name === "message");
    const messageContent = (messageOpt?.value ?? "").toString().trim();

    // Member info (when in guild) or user info (when in DM)
    const discordUser = interaction?.member?.user ?? interaction?.user ?? {};
    const discordUserId: string | undefined = discordUser.id;
    const discordUsername: string =
      discordUser.global_name || discordUser.username || "Discord User";
    const avatarUrl = buildAvatarUrl(discordUserId, discordUser.avatar);
    const guildId: string | undefined = interaction?.guild_id;
    const channelId: string | undefined = interaction?.channel_id;

    console.log(
      `[discord-interactions] /${commandName} from ${discordUsername} (${discordUserId}) guild=${guildId} channel=${channelId} msg="${messageContent}"`,
    );

    if (!messageContent) {
      return json({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: "❌ Mensagem vazia.",
          flags: 64, // EPHEMERAL
        },
      });
    }

    if (commandName === "dv" || commandName === "duelverse") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Optional: only accept commands from configured guilds
        const { data: cfg } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "discord_bot_status")
          .maybeSingle();

        let allowAnyGuild = true;
        let allowedGuildIds: string[] = [];
        if (cfg?.value) {
          try {
            const status = typeof cfg.value === "string" ? JSON.parse(cfg.value) : cfg.value;
            const servers = Array.isArray(status?.servers) ? status.servers : [];
            const enabled = servers.filter((s: any) => s?.enabled);
            if (enabled.length > 0) {
              allowAnyGuild = false;
              allowedGuildIds = enabled.map((s: any) => String(s.id));
            }
          } catch {
            /* keep defaults */
          }
        }

        if (!allowAnyGuild && guildId && !allowedGuildIds.includes(String(guildId))) {
          return json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: "⚠️ Este servidor Discord não está autorizado a postar no Chat Global do DuelVerse.",
              flags: 64,
            },
          });
        }

        // Try to resolve linked DuelVerse account
        let userIdToUse: string | null = null;
        let linkedUsername: string | null = null;
        if (discordUserId) {
          const { data: linkedUser } = await supabase.rpc("get_user_by_discord_id", {
            p_discord_id: String(discordUserId),
          });
          if (linkedUser && linkedUser.length > 0) {
            userIdToUse = linkedUser[0].user_id;
            linkedUsername = linkedUser[0].username;
          }
        }

        const { error: insertErr } = await supabase.from("global_chat_messages").insert({
          user_id: userIdToUse,
          message: messageContent,
          tcg_type: "yugioh",
          language_code: "en",
          source_type: "discord",
          source_username: discordUsername,
          source_avatar_url: avatarUrl,
          discord_user_id: discordUserId ? String(discordUserId) : null,
        });

        if (insertErr) {
          console.error("[discord-interactions] insert error:", insertErr);
          return json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: `❌ Falha ao postar no Chat Global: ${insertErr.message}`,
              flags: 64,
            },
          });
        }

        // Public response: looks like a normal chat message from the user.
        // The "Used /dv" badge above is unavoidable in Discord, but the content
        // itself reads cleanly. No emojis, no verbose prefix.
        return json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: messageContent,
            allowed_mentions: { parse: [] },
          },
        });
      } catch (err: any) {
        console.error("[discord-interactions] critical:", err);
        return json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `❌ Erro: ${err.message}`, flags: 64 },
        });
      }
    }

    return json({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: `Unknown command: /${commandName}`, flags: 64 },
    });
  }

  return json({ error: "Unsupported interaction type" }, 400);
});
