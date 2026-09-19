/**
 * DuelVerse - Servidores ICE compartilhados (WebRTC)
 * Busca credenciais TURN no backend uma vez por carregamento de página.
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

const hasTurn = (servers: RTCIceServer[]) =>
  servers.some((s) => {
    const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
    return urls.some((u) => typeof u === "string" && u.startsWith("turn"));
  });

export const getIceServers = (): RTCIceServer[] => runtimeIceServers;

export const ensureIceServers = (): Promise<RTCIceServer[]> => {
  if (promise) return promise;
  const load = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("get-ice-servers");
      const servers = (data as any)?.iceServers;
      if (!error && Array.isArray(servers) && servers.length > 0) {
        const list = servers as RTCIceServer[];
        runtimeIceServers = hasTurn(list) ? list : [...list, ...FALLBACK_TURN];
      }
    } catch {
      /* mantém a lista padrão */
    }
    return runtimeIceServers;
  })();
  promise = Promise.race([
    load,
    new Promise<RTCIceServer[]>((resolve) => setTimeout(() => resolve(runtimeIceServers), 3000)),
  ]);
  return promise;
};

export const partyPcConfig = (): RTCConfiguration => ({
  iceServers: runtimeIceServers,
  iceCandidatePoolSize: 2,
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
});
