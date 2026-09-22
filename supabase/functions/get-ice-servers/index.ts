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

let cache: { at: number; servers: unknown[]; hasTurn: boolean } | null = null;
const CACHE_OK_MS = 10 * 60 * 1000;
// When no managed TURN could be minted, retry soon instead of serving a
// degraded list for 10 minutes (that is what breaks cameras on 4G/CGNAT).
const CACHE_FAIL_MS = 30 * 1000;

function normalizeHost(raw: string | undefined): string | null {
  if (!raw) return null;
  const host = raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  // Guard against misconfigured values (e.g. a token pasted into the domain).
  const looksLikeHost = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host);
  if (!looksLikeHost) {
    console.log("[ice] ignoring invalid METERED_DOMAIN value");
    return null;
  }
  return host;
}

async function meteredServers(): Promise<unknown[]> {
  const apiKey = Deno.env.get("METERED_API_KEY");
  if (!apiKey) {
    console.log("[ice] METERED_API_KEY missing");
    return [];
  }
  const domain = normalizeHost(Deno.env.get("METERED_DOMAIN"));
  const hosts = [
    ...(domain ? [domain] : []),
    "duelverse.metered.live",
    "global.relay.metered.ca",
  ].filter((h, i, arr) => arr.indexOf(h) === i);

  for (const host of hosts) {
    try {
      const res = await fetch(
        `https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(4000) },
      );
      const bodyText = await res.text();
      console.log("[ice] metered host", host, "status", res.status, "len", bodyText.length);
      if (!res.ok) {
        console.log("[ice] metered error body", bodyText.slice(0, 200));
        continue;
      }
      let list: unknown;
      try {
        list = JSON.parse(bodyText);
      } catch {
        console.log("[ice] metered invalid json from", host);
        continue;
      }
      if (Array.isArray(list) && list.length > 0) {
        console.log("[ice] metered ok via", host, "servers", list.length);
        return list;
      }
      console.log("[ice] metered host", host, "returned no servers");
    } catch (e) {
      console.log("[ice] metered fetch failed", host, String(e));
    }
  }
  return [];
}

// Best-effort public relay. Used only when no managed TURN is configured.
// It is NOT reported as a verified relay (hasTurn stays false) so the client
// never forces `iceTransportPolicy: "relay"` onto an unreliable host.
const FALLBACK_TURN = [
  {
    urls: [
      "turn:global.relay.metered.ca:80",
      "turn:global.relay.metered.ca:443",
      "turn:global.relay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

function staticTurn(): unknown[] {
  const urls = Deno.env.get("TURN_URLS");
  const username = Deno.env.get("TURN_USERNAME");
  const credential = Deno.env.get("TURN_CREDENTIAL");
  if (!urls || !username || !credential) return [];
  return [{ urls: urls.split(",").map((u) => u.trim()).filter(Boolean), username, credential }];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const force = url.searchParams.get("refresh") === "1";
  const ttl = cache?.hasTurn ? CACHE_OK_MS : CACHE_FAIL_MS;

  if (!force && cache && Date.now() - cache.at < ttl) {
    return new Response(JSON.stringify({ iceServers: cache.servers, hasTurn: cache.hasTurn }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let turn = [...staticTurn(), ...(await meteredServers())];
  const hasTurn = turn.length > 0;
  if (!hasTurn) turn = [...FALLBACK_TURN];
  const servers = [...STUN_SERVERS, ...turn];
  cache = { at: Date.now(), servers, hasTurn };

  return new Response(JSON.stringify({ iceServers: servers, hasTurn }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
