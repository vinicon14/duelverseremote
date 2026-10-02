import { createRoot } from "react-dom/client";

const params = new URLSearchParams(location.search);
const name = params.get("name") ?? "anon";
const userId = params.get("user")!;
const role = params.get("role") ?? "player";
const p1 = params.get("p1")!;
const p2 = params.get("p2")!;

// Instrument every RTCPeerConnection the component creates.
const pcs: RTCPeerConnection[] = [];
const Native = window.RTCPeerConnection;
const ufragOf = (pc: RTCPeerConnection) => /a=ice-ufrag:(\S+)/.exec(pc.localDescription?.sdp ?? "")?.[1] ?? "";
class Tracked extends Native {
  /** Test hook: pretend ICE failed (the media path itself keeps working). */
  forcedIce: RTCIceConnectionState | null = null;
  constructor(cfg?: RTCConfiguration) {
    super(cfg);
    pcs.push(this);
  }
  added = 0;
  addErrors: string[] = [];
  sampleCand = "";
  async addIceCandidate(c?: RTCIceCandidateInit | null) {
    this.added++;
    if (c?.candidate) this.sampleCand = c.candidate.slice(0, 80);
    try { return await super.addIceCandidate(c ?? undefined); } catch (e) { this.addErrors.push(String(e).slice(0, 120)); throw e; }
  }
  get iceConnectionState(): RTCIceConnectionState {
    return this.forcedIce ?? super.iceConnectionState;
  }
}
// Simulates an ICE failure on every connected PC of this page. The override is
// lifted as soon as the component performs an ICE restart on that PC (new local
// ufrag + stable signalling) — or the PC is closed by a rebuild.
(window as unknown as { __forceIceFailure: () => number }).__forceIceFailure = () => {
  const targets = (pcs as Tracked[]).filter((pc) => pc.connectionState === "connected");
  for (const pc of targets) {
    const before = ufragOf(pc);
    pc.forcedIce = "failed";
    pc.oniceconnectionstatechange?.(new Event("iceconnectionstatechange"));
    const timer = window.setInterval(() => {
      if (pc.connectionState === "closed") { pc.forcedIce = null; window.clearInterval(timer); return; }
      if (ufragOf(pc) !== before && pc.signalingState === "stable") {
        pc.forcedIce = null;
        window.clearInterval(timer);
        pc.oniceconnectionstatechange?.(new Event("iceconnectionstatechange"));
      }
    }, 200);
  }
  return targets.length;
};
(window as unknown as { RTCPeerConnection: typeof RTCPeerConnection }).RTCPeerConnection = Tracked;

const { WebRTCVideoCall } = await import("@/components/duel/WebRTCVideoCall");

createRoot(document.getElementById("root")!).render(
  <div style={{ width: 640, height: 360 }}>
    <WebRTCVideoCall
      duelId={params.get("room") ?? "room"}
      userId={userId}
      isCreator={userId === p1}
      isSpectator={role === "spectator"}
      creatorId={p1}
      playerIds={[p1, p2]}
      maxPlayers={2}
      className="w-full h-full"
    />
  </div>,
);

setInterval(async () => {
  const peers = await Promise.all(
    pcs.map(async (pc, index) => {
      let frames = 0;
      let ufrag = "";
      let localCands = 0;
      let remoteCands = 0;
      try {
        const report = await pc.getStats();
        report.forEach((s: Record<string, unknown> & { type: string }) => {
          if (s.type === "inbound-rtp" && (s.kind ?? s.mediaType) === "video") frames += Number(s.framesDecoded ?? 0);
          if (s.type === "local-candidate") localCands++;
          if (s.type === "remote-candidate") remoteCands++;
        });
        ufrag = /a=ice-ufrag:(\S+)/.exec(pc.localDescription?.sdp ?? "")?.[1] ?? "";
      } catch { /* closed */ }
      return { index, state: pc.connectionState, ice: pc.iceConnectionState, frames, ufrag, forced: !!(pc as Tracked).forcedIce, sig: pc.signalingState, remote: !!pc.remoteDescription, localCands, remoteCands, added: (pc as Tracked).added, addErrors: (pc as Tracked).addErrors.slice(-2), sample: (pc as Tracked).sampleCand };
    }),
  );
  void fetch("/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, role, at: Date.now(), created: pcs.length, peers, signals: (window as unknown as { __signalStats?: unknown }).__signalStats }),
  }).catch(() => {});
}, 1000);
