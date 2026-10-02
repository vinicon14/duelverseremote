/**
 * Test-only replacement for "@/integrations/supabase/client" used by the e2e
 * harness. Broadcast channels are emulated with Server-Sent Events (down) and
 * POST (up) against tests/e2e/server.mjs, so a network drop of the browser also
 * drops its signalling — like the real Supabase Realtime websocket.
 */
type Handler = (msg: { payload: unknown }) => void;
const clientId = Math.random().toString(36).slice(2);
export const signalStats: Record<string, number> = {};
(window as unknown as { __signalStats: Record<string, number> }).__signalStats = signalStats;

class FakeChannel {
  private handlers = new Map<string, Handler[]>();
  private es: EventSource | null = null;
  private watchdog: number | null = null;
  private lastSeen = 0;
  private closed = false;
  constructor(public topic: string) {}

  on(_type: string, filter: { event: string }, cb: Handler) {
    const list = this.handlers.get(filter.event) ?? [];
    list.push(cb);
    this.handlers.set(filter.event, list);
    return this;
  }

  subscribe(cb?: (status: string) => void) {
    const es = new EventSource(`/events?topic=${encodeURIComponent(this.topic)}&client=${clientId}`);
    this.es = es;
    let opened = false;
    es.onopen = () => {
      this.lastSeen = Date.now();
      if (!opened) { opened = true; cb?.("SUBSCRIBED"); }
    };
    es.onmessage = (ev) => {
      this.lastSeen = Date.now();
      if (!ev.data || ev.data === "ping") return;
      const msg = JSON.parse(ev.data);
      if (msg.from === clientId) return; // broadcast.self = false
      const t = `in:${(msg.payload as { type?: string })?.type}`;
      signalStats[t] = (signalStats[t] ?? 0) + 1;
      this.handlers.get(msg.event)?.forEach((h) => h({ payload: msg.payload }));
    };
    const fail = () => {
      if (this.closed) return;
      this.teardown();
      cb?.("CHANNEL_ERROR");
    };
    es.onerror = () => { if (es.readyState === EventSource.CLOSED) fail(); };
    // The server pings every second; a silent connection is a dead one.
    this.watchdog = window.setInterval(() => {
      if (opened && Date.now() - this.lastSeen > 4000) fail();
    }, 1000);
    return this;
  }

  async send(msg: { type: string; event: string; payload: unknown }) {
    const t = `out:${(msg.payload as { type?: string })?.type}`;
    signalStats[t] = (signalStats[t] ?? 0) + 1;
    try {
      const res = await fetch("/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: this.topic, event: msg.event, payload: msg.payload, from: clientId }),
      });
      return res.ok ? "ok" : "error";
    } catch {
      return "error";
    }
  }

  presenceState() { return {}; }
  async track() { return "ok"; }

  teardown() {
    this.closed = true;
    if (this.watchdog) window.clearInterval(this.watchdog);
    this.watchdog = null;
    this.es?.close();
    this.es = null;
  }
}

export const supabase = {
  channel: (topic: string) => new FakeChannel(topic),
  removeChannel: async (ch: FakeChannel) => { ch.teardown(); return "ok"; },
  functions: {
    // A closed local port as "managed TURN": no public relays in the test.
    invoke: async () => ({
      data: { hasTurn: true, iceServers: [{ urls: "turn:127.0.0.1:3479", username: "x", credential: "x" }] },
      error: null,
    }),
  },
  from: () => ({ update() { return this; }, eq() { return this; }, select() { return this; } }),
};
