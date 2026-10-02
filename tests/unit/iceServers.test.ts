import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
const onAuthStateChange = vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: () => {} } } });
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: "test-user" } } } });

vi.mock("@/integrations/supabase/client", () => ({ 
  supabase: { 
    functions: { invoke },
    auth: { onAuthStateChange, getSession }
  } 
}));

const managed = { hasTurn: true, iceServers: [{ urls: "turn:managed.example", username: "u", credential: "p" }] };

async function freshModule() {
  vi.resetModules();
  return import("@/utils/iceServers");
}

describe("ICE server cache", () => {
  beforeEach(() => {
    invoke.mockReset();
    getSession.mockResolvedValue({ data: { session: { user: { id: "test-user" } } } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("keeps the last managed TURN list when the edge function fails later", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const ice = await freshModule();
    invoke.mockResolvedValueOnce({ data: managed });
    await ice.ensureIceServers();
    now = 10 * 60 * 1000; // cache expired
    invoke.mockResolvedValueOnce({ error: new Error("edge down") });
    await ice.ensureIceServers();
    expect(ice.getIceServers()[0].urls).toBe("turn:managed.example");
    expect(ice.hasVerifiedTurn()).toBe(true);
  });

  it("background mode never blocks a signal on the edge function after the first load", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    // Ensure getSession returns valid session for this test
    getSession.mockResolvedValue({ data: { session: { user: { id: "test-user" } } } });
    const ice = await freshModule();
    invoke.mockResolvedValueOnce({ data: managed });
    await ice.ensureIceServers();
    now = 10 * 60 * 1000;
    let release!: (v: unknown) => void;
    invoke.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const result = await ice.ensureIceServers({ background: true });
    expect(result[0].urls).toBe("turn:managed.example");
    // Give time for background refresh to start
    await new Promise((r) => setTimeout(r, 10));
    expect(invoke).toHaveBeenCalledTimes(2); // refresh started in background
    release({ data: { hasTurn: true, iceServers: [{ urls: "turn:rotated.example" }] } });
    await new Promise((r) => setTimeout(r, 10));
    expect(ice.getIceServers()[0].urls).toBe("turn:rotated.example");
  });

  it("backs off exponentially instead of refetching every 5 s while the function is down", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const ice = await freshModule();
    invoke.mockResolvedValue({ error: new Error("down") });
    await ice.ensureIceServers(); // fail #1 -> retry after 5 s
    now = 6000; await ice.ensureIceServers(); // fail #2 -> retry after 10 s
    expect(invoke).toHaveBeenCalledTimes(2);
    now = 12000; await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(2);
    now = 17000; await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it("uses a single pre-gathered candidate pool with max-bundle", async () => {
    const ice = await freshModule();
    const cfg = ice.buildPcConfig();
    expect(cfg.iceCandidatePoolSize).toBe(1);
    expect(cfg.bundlePolicy).toBe("max-bundle");
    expect(cfg.iceTransportPolicy).toBe("all");
  });

  it("skips function call when no session and retries after SIGNED_IN", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    
    // Mock getSession to return no session
    const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
    const authStateListeners: Array<(event: string) => void> = [];
    const onAuthStateChange = vi.fn((callback) => {
      authStateListeners.push(callback);
      return { data: { subscription: { unsubscribe: () => {} } } };
    });
    
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        functions: { invoke },
        auth: { getSession, onAuthStateChange }
      }
    }));
    
    const ice = await freshModule();
    
    // Verify onAuthStateChange was registered
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
    
    // First call: no session, should not call invoke and use STUN + fallback
    await ice.ensureIceServers();
    expect(invoke).not.toHaveBeenCalled();
    const servers = ice.getIceServers();
    expect(servers.some((s) => s.urls.includes("stun:"))).toBe(true);
    expect(ice.hasVerifiedTurn()).toBe(false);
    
    // Simulate SIGNED_IN event
    now = 1000;
    getSession.mockResolvedValue({ data: { session: { user: { id: "user-123" } } } });
    invoke.mockResolvedValueOnce({ data: managed });
    authStateListeners.forEach(cb => cb("SIGNED_IN"));
    
    // Should now fetch with auth
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(ice.getIceServers()[0].urls).toBe("turn:managed.example");
    expect(ice.hasVerifiedTurn()).toBe(true);
  });

  it("uses exponential backoff for 401 errors without infinite loop", async () => {
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    
    const ice = await freshModule();
    
    // Mock 401 error (simulating FunctionsHttpError)
    const error401 = { message: "Edge Function returned a non-2xx status code" };
    invoke.mockResolvedValue({ data: null, error: error401 });
    
    // First attempt: should fail with 401 and set backoff to 5s
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(ice.getIceServers().some((s) => s.urls.includes("stun:"))).toBe(true);
    expect(ice.hasVerifiedTurn()).toBe(false);
    
    // Before 5s: should not retry
    now = 4000;
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(1);
    
    // After 5s: should retry (2nd failure, backoff 10s)
    now = 6000;
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(2);
    
    // Before 10s: should not retry
    now = 12000;
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(2);
    
    // After 10s: should retry (3rd failure, backoff 20s)
    now = 17000;
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(3);
    
    // After 20s: should retry (4th failure, backoff 40s)
    now = 38000;
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(4);
    
    // After 40s: should retry (5th failure, backoff capped at 60s)
    now = 79000;
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(5);
    
    // After 60s: should retry (backoff still capped at 60s)
    now = 140000;
    await ice.ensureIceServers();
    expect(invoke).toHaveBeenCalledTimes(6);
    
    // Verify it still falls back to STUN + FALLBACK
    expect(ice.getIceServers().some((s) => s.urls.includes("stun:"))).toBe(true);
    expect(ice.hasVerifiedTurn()).toBe(false);
  });
});
