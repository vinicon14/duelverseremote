/**
 * DuelVerse - Regras puras de sessão/recuperação da videochamada WebRTC.
 *
 * Mantidas fora do componente para serem testáveis (vitest) e para que o
 * WebRTCVideoCall.tsx só orquestre. Tudo aqui é retrocompatível: mensagens de
 * clientes antigos (PWA em cache) não trazem `v`/`inst`/`pcId` e caem no
 * comportamento legado.
 */

/** Versão do protocolo de sinalização. v2 = inst/pcId + candidatos em lote. */
export const SIGNAL_PROTOCOL_VERSION = 2;

export const newSignalId = (): string => {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Identidade da sessão de sinalização do lado remoto, conhecida localmente. */
export interface SessionView {
  /** Id da nossa RTCPeerConnection atual para esse peer. */
  localPcId: string;
  /** Id da RTCPeerConnection remota com que estamos negociando (null = ainda desconhecido/legado). */
  remotePcId: string | null;
  /** Id da montagem (aba/visita) remota (null = desconhecido/legado). */
  remoteInst: string | null;
}

export interface SessionFields {
  inst?: string;
  pcId?: string;
  toPc?: string;
}

/**
 * O remoto recarregou a página / remontou a sala? Uma conexão antiga pode
 * continuar "connected" por até ~30 s depois de um F5; negociar contra ela
 * falha (fingerprint DTLS diferente) e o vídeo fica congelado.
 */
export const remoteInstanceChanged = (peer: SessionView | undefined, payload: SessionFields) =>
  !!peer && !!payload.inst && !!peer.remoteInst && payload.inst !== peer.remoteInst;

/** Decide o que fazer com uma offer recebida. */
export function decideOffer(peer: SessionView | undefined, payload: SessionFields): "accept" | "rebuild" {
  if (!peer) return "accept";
  if (remoteInstanceChanged(peer, payload)) return "rebuild";
  // Mesma aba, mas uma RTCPeerConnection remota nova: precisamos de uma nova
  // também (ICE/DTLS novos não podem ser aplicados na conexão antiga).
  if (payload.pcId && peer.remotePcId && payload.pcId !== peer.remotePcId) return "rebuild";
  return "accept";
}

/** Decide o que fazer com uma answer recebida. */
export function decideAnswer(peer: SessionView, payload: SessionFields): "accept" | "drop" | "rebuild" {
  // Answer para uma conexão nossa que já foi descartada.
  if (payload.toPc && payload.toPc !== peer.localPcId) return "drop";
  // Answer de uma aba remota nova respondendo nossa offer antiga.
  if (remoteInstanceChanged(peer, payload)) return "rebuild";
  if (payload.pcId && peer.remotePcId && payload.pcId !== peer.remotePcId) return "rebuild";
  return "accept";
}

/** Decide o que fazer com um candidato ICE recebido. */
export function decideCandidate(peer: SessionView, payload: SessionFields): "accept" | "drop" | "defer" {
  if (payload.toPc && payload.toPc !== peer.localPcId) return "drop";
  if (remoteInstanceChanged(peer, payload)) return "defer";
  if (payload.pcId && peer.remotePcId && payload.pcId !== peer.remotePcId) return "defer";
  return "accept";
}

export interface DeferredCandidate {
  pcId?: string;
  inst?: string;
  candidate: RTCIceCandidateInit;
}

/** Fila limitada de candidatos de uma conexão remota cuja offer ainda não chegou. */
export function pushDeferred(queue: DeferredCandidate[], item: DeferredCandidate, max = 128) {
  if (queue.length >= max) queue.shift();
  queue.push(item);
}

/** Retira da fila os candidatos que pertencem à conexão remota agora conhecida. */
export function takeDeferredFor(queue: DeferredCandidate[], remotePcId: string | null): RTCIceCandidateInit[] {
  if (!remotePcId) return [];
  const matched: RTCIceCandidateInit[] = [];
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].pcId === remotePcId) matched.unshift(queue.splice(i, 1)[0].candidate);
  }
  return matched;
}

type TimerFns = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
};

const defaultTimers = (): TimerFns => ({
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
});

/**
 * Agrupa candidatos ICE gerados em rajada numa única mensagem. Cada broadcast
 * do Supabase Realtime é entregue a TODOS os inscritos da sala (jogadores e
 * espectadores) e conta no limite de mensagens/s do projeto inteiro.
 */
export function createCandidateBatcher(
  send: (candidates: RTCIceCandidateInit[]) => void,
  delayMs = 60,
  timers: TimerFns = defaultTimers(),
) {
  let buffer: RTCIceCandidateInit[] = [];
  let timer: unknown = null;
  const flushNow = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    send(batch);
  };
  return {
    push(candidate: RTCIceCandidateInit) {
      buffer.push(candidate);
      if (buffer.length >= 16) return flushNow();
      if (timer === null) timer = timers.setTimeout(flushNow, delayMs);
    },
    flushNow,
    cancel() {
      if (timer !== null) timers.clearTimeout(timer);
      timer = null;
      buffer = [];
    },
  };
}

export interface IceRecoveryOptions {
  /** Pede um ICE restart (o ofertante refaz a offer; o outro lado pede a ele). */
  restart: () => void;
  /** Reconstrução completa da conexão depois que restarts não resolveram. */
  rebuild: () => void;
  /** Última instância: remove o peer da UI ("Aguardando jogador"). */
  remove: () => void;
  /** Quedas curtas (troca de antena/Wi‑Fi) costumam voltar sozinhas. */
  disconnectGraceMs?: number;
  restartRetryMs?: number;
  maxRestarts?: number;
  rebuildAfterMs?: number;
  removeAfterMs?: number;
  timers?: TimerFns;
  now?: () => number;
}

/**
 * Máquina de recuperação por peer, dirigida por iceConnectionState:
 *  - "disconnected": espera `disconnectGraceMs`; se não voltou, ICE restart;
 *  - "failed": ICE restart imediato;
 *  - restarts repetidos a cada `restartRetryMs` (máx. `maxRestarts`);
 *  - sem reconectar em `rebuildAfterMs`: reconstrói a conexão (uma vez);
 *  - sem reconectar em `removeAfterMs`: remove o peer;
 *  - "connected"/"completed": cancela tudo.
 * Oscilações connected/disconnected não acumulam timers.
 */
export function createIceRecovery(opts: IceRecoveryOptions) {
  const timers = opts.timers ?? defaultTimers();
  const now = opts.now ?? (() => Date.now());
  const grace = opts.disconnectGraceMs ?? 2500;
  const retry = opts.restartRetryMs ?? 6000;
  const maxRestarts = opts.maxRestarts ?? 3;
  const rebuildAfter = opts.rebuildAfterMs ?? 20000;
  const removeAfter = opts.removeAfterMs ?? 45000;

  let troubleSince: number | null = null;
  let restarts = 0;
  let rebuilt = false;
  let lastRestartAt = -Infinity;
  let disposed = false;
  let graceTimer: unknown = null;
  let retryTimer: unknown = null;
  let rebuildTimer: unknown = null;
  let removeTimer: unknown = null;
  let state: RTCIceConnectionState | "unknown" = "unknown";

  const clear = (id: unknown) => { if (id !== null) timers.clearTimeout(id); };
  const clearAll = () => {
    clear(graceTimer); clear(retryTimer); clear(rebuildTimer); clear(removeTimer);
    graceTimer = retryTimer = rebuildTimer = removeTimer = null;
  };
  const unhealthy = () => state === "disconnected" || state === "failed";

  const doRestart = () => {
    if (disposed || !unhealthy()) return;
    if (now() - lastRestartAt < 1500) return;
    if (restarts >= maxRestarts) return;
    restarts += 1;
    lastRestartAt = now();
    opts.restart();
    clear(retryTimer);
    retryTimer = timers.setTimeout(() => { retryTimer = null; doRestart(); }, retry);
  };

  const startEscalation = () => {
    if (troubleSince !== null) return;
    troubleSince = now();
    rebuildTimer = timers.setTimeout(() => {
      rebuildTimer = null;
      if (disposed || !unhealthy() || rebuilt) return;
      rebuilt = true;
      opts.rebuild();
    }, rebuildAfter);
    removeTimer = timers.setTimeout(() => {
      removeTimer = null;
      if (disposed || !unhealthy()) return;
      opts.remove();
    }, removeAfter);
  };

  return {
    onStateChange(next: RTCIceConnectionState) {
      if (disposed) return;
      state = next;
      if (next === "connected" || next === "completed") {
        clearAll();
        troubleSince = null;
        restarts = 0;
        rebuilt = false;
        return;
      }
      if (next === "closed") { this.dispose(); return; }
      if (next === "disconnected") {
        startEscalation();
        if (graceTimer === null && retryTimer === null) {
          graceTimer = timers.setTimeout(() => { graceTimer = null; doRestart(); }, grace);
        }
        return;
      }
      if (next === "failed") {
        startEscalation();
        clear(graceTimer); graceTimer = null;
        doRestart();
      }
    },
    /** Há quanto tempo a conexão está com problema (null = saudável). */
    troubleFor(): number | null {
      return troubleSince === null ? null : now() - troubleSince;
    },
    dispose() {
      disposed = true;
      clearAll();
    },
  };
}

/** Amostra de estatísticas de recepção de um peer. */
export interface InboundSample {
  videoFrames: number;
  videoBytes: number;
  audioBytes: number;
  /** bytes + respostas STUN (consent) no par de candidatos selecionado */
  transportActivity: number;
}

export function sampleInbound(report: RTCStatsReport): InboundSample {
  const sample: InboundSample = { videoFrames: 0, videoBytes: 0, audioBytes: 0, transportActivity: 0 };
  const pairs: Record<string, unknown>[] = [];
  let selectedPairId: string | undefined;
  report.forEach((raw) => {
    const s = raw as Record<string, unknown> & { type: string };
    if (s.type === "inbound-rtp") {
      const kind = (s.kind ?? s.mediaType) as string | undefined;
      if (kind === "video") {
        sample.videoFrames += Number(s.framesDecoded ?? 0);
        sample.videoBytes += Number(s.bytesReceived ?? 0);
      } else if (kind === "audio") {
        sample.audioBytes += Number(s.bytesReceived ?? 0);
      }
    } else if (s.type === "transport" && typeof s.selectedCandidatePairId === "string") {
      selectedPairId = s.selectedCandidatePairId;
    } else if (s.type === "candidate-pair") {
      pairs.push(s);
    }
  });
  const pair =
    pairs.find((p) => p.id === selectedPairId) ??
    pairs.find((p) => p.selected === true || (p.nominated === true && p.state === "succeeded"));
  if (pair) sample.transportActivity = Number(pair.bytesReceived ?? 0) + Number(pair.responsesReceived ?? 0);
  return sample;
}

export type MediaHealth = "flowing" | "video-stalled" | "transport-stalled" | "unknown";

/**
 * Classifica a saúde da recepção entre duas amostras:
 *  - flowing: quadros de vídeo decodificados avançando;
 *  - video-stalled: vídeo parado mas o caminho de rede vivo (áudio/RTCP/STUN
 *    chegando) — problema na câmera do REMOTO; reconstruir não ajuda;
 *  - transport-stalled: nada chega — rede travada; vale ICE restart.
 */
export function assessMediaHealth(prev: InboundSample | null | undefined, next: InboundSample): MediaHealth {
  if (!prev) return "unknown";
  if (next.videoFrames > prev.videoFrames) return "flowing";
  const alive =
    next.audioBytes > prev.audioBytes ||
    next.videoBytes > prev.videoBytes ||
    next.transportActivity > prev.transportActivity;
  return alive ? "video-stalled" : "transport-stalled";
}

/** Limites de envio de vídeo: protegem o uplink do jogador (malha 1:N). */
export const OPPONENT_VIDEO_MAX_BITRATE = 1_800_000;
export const SPECTATOR_VIDEO_MAX_BITRATE = 800_000;

/** Aplica teto de bitrate no(s) sender(s) de vídeo. Idempotente; nunca lança. */
export async function applyVideoBitrateCap(pc: RTCPeerConnection, maxBitrate: number) {
  const senders = typeof pc.getSenders === "function" ? pc.getSenders() : [];
  await Promise.all(senders.map(async (sender) => {
    if (sender.track?.kind !== "video") return;
    if (typeof sender.getParameters !== "function" || typeof sender.setParameters !== "function") return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) return; // ainda não negociado
      let changed = false;
      for (const encoding of params.encodings) {
        if (encoding.maxBitrate !== maxBitrate) {
          encoding.maxBitrate = maxBitrate;
          changed = true;
        }
      }
      if (changed) await sender.setParameters(params);
    } catch (error) {
      console.warn("[WebRTC] Could not apply video bitrate cap", error);
    }
  }));
}
