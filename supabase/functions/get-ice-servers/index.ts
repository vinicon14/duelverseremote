// Returns the ICE server list (STUN + TURN) used by the duel room WebRTC calls.
// TURN credentials are minted server-side so they can be rotated without a deploy.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

let cache: { at: number; servers: unknown[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

async function meteredServers(): Promise<unknown[]> {
  const apiKey = Deno.env.get("METERED_API_KEY");
  if (!apiKey) return [];
  const domain = Deno.env.get("METERED_DOMAIN");
  const hosts = domain
    ? [domain]
    : ["duelverse.metered.live", "global.relay.metered.ca"];
  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(4000) },
      );
      console.log("[ice] metered host", host, "status", res.status);
      if (!res.ok) continue;
      const list = await res.json();
      if (Array.isArray(list) && list.length > 0) return list;
      console.log("[ice] metered host", host, "returned no servers");

    } catch (_e) {
      // try next host
    }
  }
  return [];
}


function staticTurn(): unknown[] {
  const urls = Deno.env.get("TURN_URLS");
  const username = Deno.env.get("TURN_USERNAME");
  const credential = Deno.env.get("TURN_CREDENTIAL");
  if (!urls || !username || !credential) return [];
  return [{ urls: urls.split(",").map((u) => u.trim()).filter(Boolean), username, credential }];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return new Response(JSON.stringify({ iceServers: cache.servers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const turn = [...staticTurn(), ...(await meteredServers())];
  const servers = [...STUN_SERVERS, ...turn];
  cache = { at: Date.now(), servers };

  return new Response(JSON.stringify({ iceServers: servers, hasTurn: turn.length > 0 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
