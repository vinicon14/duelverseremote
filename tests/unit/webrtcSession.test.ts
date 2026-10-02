import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  decideOffer,
  decideAnswer,
  decideCandidate,
  remoteInstanceChanged,
  pushDeferred,
  takeDeferredFor,
  createCandidateBatcher,
  createIceRecovery,
  sampleInbound,
  assessMediaHealth,
  applyVideoBitrateCap,
  type SessionView,
} from "@/utils/webrtcSession";

const view = (over: Partial<SessionView> = {}): SessionView => ({
  localPcId: "local-1",
  remotePcId: "remote-1",
  remoteInst: "tab-1",
  ...over,
});

describe("session decisions (reload / rebuild detection)", () => {
  it("accepts offers when there is no peer or the message is legacy", () => {
    expect(decideOffer(undefined, { pcId: "x" })).toBe("accept");
    expect(decideOffer(view(), {})).toBe("accept");
    expect(decideOffer(view({ remotePcId: null, remoteInst: null }), { pcId: "x", inst: "y" })).toBe("accept");
  });

  it("rebuilds when the remote reloaded or created a new PeerConnection", () => {
    expect(decideOffer(view(), { inst: "tab-2", pcId: "remote-9" })).toBe("rebuild");
    expect(decideOffer(view(), { inst: "tab-1", pcId: "remote-2" })).toBe("rebuild");
    expect(decideOffer(view(), { inst: "tab-1", pcId: "remote-1" })).toBe("accept");
    expect(remoteInstanceChanged(view(), { inst: "tab-2" })).toBe(true);
    expect(remoteInstanceChanged(view({ remoteInst: null }), { inst: "tab-2" })).toBe(false);
  });

  it("drops answers addressed to a discarded local PeerConnection", () => {
    expect(decideAnswer(view(), { toPc: "local-0" })).toBe("drop");
    expect(decideAnswer(view(), { toPc: "local-1", pcId: "remote-1" })).toBe("accept");
    expect(decideAnswer(view(), { toPc: "local-1", inst: "tab-2" })).toBe("rebuild");
    expect(decideAnswer(view(), {})).toBe("accept");
  });

  it("drops stale candidates and defers candidates of a future remote PC", () => {
    expect(decideCandidate(view(), { toPc: "local-0" })).toBe("drop");
    expect(decideCandidate(view(), { pcId: "remote-2" })).toBe("defer");
    expect(decideCandidate(view(), { pcId: "remote-1", toPc: "local-1" })).toBe("accept");
    expect(decideCandidate(view({ remotePcId: null }), { pcId: "remote-2" })).toBe("accept");
    expect(decideCandidate(view(), {})).toBe("accept");
  });

  it("keeps a bounded deferred queue and releases only the matching PC", () => {
    const q: Parameters<typeof pushDeferred>[0] = [];
    for (let i = 0; i < 5; i++) pushDeferred(q, { pcId: i % 2 ? "b" : "a", candidate: { candidate: `c${i}` } }, 4);
    expect(q).toHaveLength(4);
    expect(takeDeferredFor(q, "a").map((c) => c.candidate)).toEqual(["c2", "c4"]);
    expect(q.every((c) => c.pcId === "b")).toBe(true);
    expect(takeDeferredFor(q, null)).toEqual([]);
  });
});

describe("candidate batcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("groups a burst of candidates into one message", () => {
    const sent: unknown[][] = [];
    const b = createCandidateBatcher((c) => sent.push(c), 50);
    b.push({ candidate: "1" }); b.push({ candidate: "2" }); b.push({ candidate: "3" });
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(sent).toEqual([[{ candidate: "1" }, { candidate: "2" }, { candidate: "3" }]]);
  });

  it("flushes immediately at end-of-gathering and when the batch is large", () => {
    const sent: unknown[][] = [];
    const b = createCandidateBatcher((c) => sent.push(c), 50);
    b.push({ candidate: "1" }); b.flushNow();
    expect(sent).toHaveLength(1);
    for (let i = 0; i < 16; i++) b.push({ candidate: String(i) });
    expect(sent).toHaveLength(2);
    b.push({ candidate: "x" }); b.cancel(); vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(2);
  });
});

describe("ICE recovery state machine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const calls = { restart: 0, rebuild: 0, remove: 0 };
    const r = createIceRecovery({
      restart: () => calls.restart++,
      rebuild: () => calls.rebuild++,
      remove: () => calls.remove++,
      now: () => Date.now(),
    });
    return { r, calls };
  };

  it("does not restart on a short disconnection that recovers by itself", () => {
    const { r, calls } = setup();
    r.onStateChange("disconnected");
    vi.advanceTimersByTime(2000);
    r.onStateChange("connected");
    vi.advanceTimersByTime(60000);
    expect(calls).toEqual({ restart: 0, rebuild: 0, remove: 0 });
    expect(r.troubleFor()).toBeNull();
  });

  it("restarts ICE after the grace period, retries, then rebuilds and finally removes", () => {
    const { r, calls } = setup();
    r.onStateChange("disconnected");
    vi.advanceTimersByTime(2500);
    expect(calls.restart).toBe(1);
    vi.advanceTimersByTime(6000);
    expect(calls.restart).toBe(2);
    vi.advanceTimersByTime(11500); // t = 20 s
    expect(calls.rebuild).toBe(1);
    expect(calls.restart).toBe(3);
    vi.advanceTimersByTime(30000);
    expect(calls.restart).toBe(3); // capped
    expect(calls.remove).toBe(1);
    expect(calls.rebuild).toBe(1);
  });

  it("restarts immediately on failed and stops everything once connected", () => {
    const { r, calls } = setup();
    r.onStateChange("failed");
    expect(calls.restart).toBe(1);
    r.onStateChange("connected");
    vi.advanceTimersByTime(60000);
    expect(calls).toEqual({ restart: 1, rebuild: 0, remove: 0 });
  });

  it("does not stack timers when the state flaps", () => {
    const { r, calls } = setup();
    for (let i = 0; i < 5; i++) {
      r.onStateChange("disconnected");
      vi.advanceTimersByTime(500);
    }
    vi.advanceTimersByTime(2000);
    expect(calls.restart).toBe(1);
  });

  it("is inert after dispose", () => {
    const { r, calls } = setup();
    r.onStateChange("disconnected");
    r.dispose();
    vi.advanceTimersByTime(60000);
    r.onStateChange("failed");
    expect(calls).toEqual({ restart: 0, rebuild: 0, remove: 0 });
  });
});

describe("media health from getStats", () => {
  const report = (entries: Record<string, unknown>[]) =>
    new Map(entries.map((e, i) => [String(e.id ?? i), e])) as unknown as RTCStatsReport;

  it("reads inbound frames/bytes and the selected candidate pair", () => {
    const s = sampleInbound(report([
      { id: "v", type: "inbound-rtp", kind: "video", framesDecoded: 30, bytesReceived: 1000 },
      { id: "a", type: "inbound-rtp", kind: "audio", bytesReceived: 200 },
      { id: "t", type: "transport", selectedCandidatePairId: "p1" },
      { id: "p0", type: "candidate-pair", bytesReceived: 999999, responsesReceived: 1 },
      { id: "p1", type: "candidate-pair", bytesReceived: 5000, responsesReceived: 7 },
    ]));
    expect(s).toEqual({ videoFrames: 30, videoBytes: 1000, audioBytes: 200, transportActivity: 5007 });
  });

  it("classifies flowing / video-stalled / transport-stalled", () => {
    const base = { videoFrames: 10, videoBytes: 100, audioBytes: 100, transportActivity: 100 };
    expect(assessMediaHealth(null, base)).toBe("unknown");
    expect(assessMediaHealth(base, { ...base, videoFrames: 11 })).toBe("flowing");
    expect(assessMediaHealth(base, { ...base, audioBytes: 150 })).toBe("video-stalled");
    expect(assessMediaHealth(base, { ...base, transportActivity: 101 })).toBe("video-stalled");
    expect(assessMediaHealth(base, base)).toBe("transport-stalled");
  });
});

describe("video bitrate cap", () => {
  it("sets maxBitrate on negotiated video senders only", async () => {
    const setParameters = vi.fn(async () => {});
    const video = { track: { kind: "video" }, getParameters: () => ({ encodings: [{}] }), setParameters };
    const audio = { track: { kind: "audio" }, getParameters: () => ({ encodings: [{}] }), setParameters: vi.fn() };
    const unnegotiated = { track: { kind: "video" }, getParameters: () => ({ encodings: [] }), setParameters: vi.fn() };
    const pc = { getSenders: () => [video, audio, unnegotiated] } as unknown as RTCPeerConnection;
    await applyVideoBitrateCap(pc, 800_000);
    expect(setParameters).toHaveBeenCalledWith({ encodings: [{ maxBitrate: 800_000 }] });
    expect(audio.setParameters).not.toHaveBeenCalled();
    expect(unnegotiated.setParameters).not.toHaveBeenCalled();
  });

  it("never throws when setParameters is rejected", async () => {
    const sender = { track: { kind: "video" }, getParameters: () => ({ encodings: [{}] }), setParameters: async () => { throw new Error("nope"); } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(applyVideoBitrateCap({ getSenders: () => [sender] } as unknown as RTCPeerConnection, 1)).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
