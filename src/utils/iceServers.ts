/**
 * DuelVerse - Servidores ICE compartilhados (WebRTC)
 * Cache renovável; uma indisponibilidade não fica memorizada pela sessão inteira.
 */
import { supabase } from "@/integrations/supabase/client";

const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const FALLBACK_TURN: RTCIceServer[] = [
  {
    urls: [
      "turn:global.relay.metered.ca:80",
      "turn:global.relay.metered.ca:443",
      "turn:global.relay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

let runtimeIceServers: RTCIceServer[] = [...STUN_SERVERS, ...FALLBACK_TURN];
let promise: Promise<RTCIceServer[]> | null = null;
let expiresAt = 0;
let verifiedTurn = false;
// Last list that contained managed TURN credentials. A transient failure of
// the edge function must never replace working credentials with the public
// fallback relay (that is what broke ICE restarts on 4G/CGNAT).
let lastVerified: { servers: RTCIceServer[]; at: number } | null = null;
let loadedOnce = false;
let failures = 0;
const CACHE_MS = 5 * 60 * 1000;
const RETRY_MS = 5000;
const MAX_RETRY_MS = 60 * 1000;
const UNVERIFIED_CACHE_MS = 60 * 1000;
// Managed TURN credentials stay usable for a long time; keep them while the
// edge function is unreachable instead of falling back to the public relay.
const LAST_VERIFIED_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const hasTurn = (servers: RTCIceServer[]) =>
  servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === "string" && u.startsWith("turn"));
  });

export const getIceServers = (): RTCIceServer[] => runtimeIceServers;
export const hasVerifiedTurn = () => verifiedTurn && Date.now() < expiresAt;

const refresh = (): Promise<RTCIceServer[]> => {
  if (promise) return promise;
  // Abort the request itself, not just its caller's wait. An obsolete response
  // must never overwrite credentials obtained by a later attempt.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("ICE configuration timed out"));
    }, 8000);
  });
  promise = (async () => {
    try {
      const { data, error } = await Promise.race([
        supabase.functions.invoke("get-ice-servers", { signal: controller.signal }),
        timeout,
      ]);
      const servers = data?.iceServers;
      if (!error && Array.isArray(servers) && servers.length > 0) {
        const list = servers as RTCIceServer[];
        const verified = data.hasTurn === true && hasTurn(list);
        failures = 0;
        if (verified) {
          runtimeIceServers = list;
          verifiedTurn = true;
          lastVerified = { servers: list, at: Date.now() };
          expiresAt = Date.now() + CACHE_MS;
        } else if (lastVerified && Date.now() - lastVerified.at < LAST_VERIFIED_MAX_AGE_MS) {
          // Server temporarily lost its managed TURN: keep the known-good list.
          runtimeIceServers = lastVerified.servers;
          verifiedTurn = true;
          expiresAt = Date.now() + RETRY_MS;
        } else {
          runtimeIceServers = hasTurn(list) ? list : [...list, ...FALLBACK_TURN];
          verifiedTurn = false;
          // No managed TURN configured: do not hammer the edge function every
          // few seconds (and do not make every signal wait for it).
          expiresAt = Date.now() + UNVERIFIED_CACHE_MS;
        }
      } else {
        throw error ?? new Error("Empty ICE configuration");
      }
    } catch (error) {
      failures += 1;
      const backoff = Math.min(RETRY_MS * 2 ** (failures - 1), MAX_RETRY_MS);
      if (lastVerified && Date.now() - lastVerified.at < LAST_VERIFIED_MAX_AGE_MS) {
        runtimeIceServers = lastVerified.servers;
        verifiedTurn = true;
      } else {
        verifiedTurn = false;
        runtimeIceServers = [...STUN_SERVERS, ...FALLBACK_TURN];
      }
      expiresAt = Date.now() + backoff;
      console.warn("[WebRTC] ICE configuration unavailable; retry scheduled", error);
    } finally {
      clearTimeout(timer!);
      promise = null;
      loadedOnce = true;
    }
    return runtimeIceServers;
  })();
  return promise;
};

/**
 * Resolve the ICE server list.
 * - Default: waits for a refresh when the cache expired (used once at startup,
 *   before the first RTCPeerConnection exists).
 * - `{ background: true }`: after the first load, never blocks. It returns the
 *   current list immediately and refreshes in the background. Signal handlers
 *   use this: waiting for the edge function before answering an offer delayed
 *   (or, on timeouts, stalled for 8 s) every renegotiation and ICE restart.
 */
export const ensureIceServers = (opts: { background?: boolean } = {}): Promise<RTCIceServer[]> => {
  if (Date.now() < expiresAt && !promise) return Promise.resolve(runtimeIceServers);
  if (opts.background && loadedOnce) {
    void refresh();
    return Promise.resolve(runtimeIceServers);
  }
  return refresh();
};

// Keep direct candidates available even during recovery. TURN is already tried
// by ICE under "all"; a transient disconnect does not prove direct paths unusable.
export const buildPcConfig = (): RTCConfiguration => ({
  iceServers: runtimeIceServers,
  iceTransportPolicy: "all",
  // max-bundle needs a single transport; a larger pool only pre-allocated
  // extra TURN allocations for every spectator connection.
  iceCandidatePoolSize: 1,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
});

export const partyPcConfig = (): RTCConfiguration => ({
  iceServers: runtimeIceServers,
  iceCandidatePoolSize: 2,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
});
