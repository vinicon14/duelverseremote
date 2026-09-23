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
const CACHE_MS = 5 * 60 * 1000;
const RETRY_MS = 5000;

const hasTurn = (servers: RTCIceServer[]) =>
  servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === "string" && u.startsWith("turn"));
  });

export const getIceServers = (): RTCIceServer[] => runtimeIceServers;
export const hasVerifiedTurn = () => verifiedTurn && Date.now() < expiresAt;

export const ensureIceServers = (): Promise<RTCIceServer[]> => {
  if (promise) return promise;
  if (Date.now() < expiresAt) return Promise.resolve(runtimeIceServers);
  // Abort the request itself, not just its caller's wait. An obsolete response
  // must never overwrite credentials obtained by a later attempt.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("ICE configuration timed out"));
    }, 3000);
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
        runtimeIceServers = hasTurn(list) ? list : [...list, ...FALLBACK_TURN];
        verifiedTurn = data.hasTurn === true && hasTurn(list);
        expiresAt = Date.now() + (verifiedTurn ? CACHE_MS : RETRY_MS);
      } else {
        throw error ?? new Error("Empty ICE configuration");
      }
    } catch (error) {
      verifiedTurn = false;
      runtimeIceServers = [...STUN_SERVERS, ...FALLBACK_TURN];
      expiresAt = Date.now() + RETRY_MS;
      console.warn("[WebRTC] ICE configuration unavailable; retry scheduled", error);
    } finally {
      clearTimeout(timer!);
      promise = null;
    }
    return runtimeIceServers;
  })();
  return promise;
};

// Keep direct candidates available even during recovery. TURN is already tried
// by ICE under "all"; a transient disconnect does not prove direct paths unusable.
export const buildPcConfig = (): RTCConfiguration => ({
  iceServers: runtimeIceServers,
  iceTransportPolicy: "all",
  iceCandidatePoolSize: 4,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
});

export const partyPcConfig = (): RTCConfiguration => ({
  iceServers: runtimeIceServers,
  iceCandidatePoolSize: 2,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
});
