// Returns the ICE server list (STUN + TURN) used by the duel room WebRTC calls.
// TURN credentials are minted server-side so they can be rotated without a deploy.
// SECURITY: Requires authenticated user to prevent credential leakage.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

// Rate limit: max requests per user per window
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20; // 20 requests per minute per user

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

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(userId);
  
  if (!record || now >= record.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Clean up old entries
    if (rateLimitMap.size > 1000) {
      for (const [id, rec] of rateLimitMap.entries()) {
        if (now >= rec.resetAt) rateLimitMap.delete(id);
      }
    }
    return true;
  }
  
  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }
  
  record.count++;
  return true;
}

interface Dependencies {
  getUser: (authHeader: string) => Promise<{ user: unknown; error: unknown }>;
  getEnv: (key: string) => string | undefined;
}

export async function handler(req: Request, deps: Dependencies): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // SECURITY: Validate authenticated user to prevent credential leakage
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    console.log("[ice] Missing Authorization header");
    return new Response(
      JSON.stringify({ error: "Authentication required" }), 
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { user, error: authError } = await deps.getUser(authHeader);
  
  if (authError || !user) {
    console.log("[ice] Authentication failed:", authError);
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }), 
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const userId = (user as { id: string }).id;

  // Rate limit check
  if (!checkRateLimit(userId)) {
    console.log("[ice] Rate limit exceeded for user:", userId);
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), 
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

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
}

// Only start the server if this is the main module (not being imported for tests)
if (import.meta.main) {
  Deno.serve((req: Request) => 
    handler(req, {
      getUser: async (authHeader: string) => {
        const supabaseClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_ANON_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: { user }, error } = await supabaseClient.auth.getUser();
        return { user, error };
      },
      getEnv: Deno.env.get,
    })
  );
}
