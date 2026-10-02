import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));

const managed = { hasTurn: true, iceServers: [{ urls: "turn:managed.example", username: "u", credential: "p" }] };

async function freshModule() {
  vi.resetModules();
  return import("@/utils/iceServers");
}

describe("ICE server cache", () => {
  beforeEach(() => {
    invoke.mockReset();
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
    const ice = await freshModule();
    invoke.mockResolvedValueOnce({ data: managed });
    await ice.ensureIceServers();
    now = 10 * 60 * 1000;
    let release!: (v: unknown) => void;
    invoke.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const result = await ice.ensureIceServers({ background: true });
    expect(result[0].urls).toBe("turn:managed.example");
    expect(invoke).toHaveBeenCalledTimes(2); // refresh started in background
    release({ data: { hasTurn: true, iceServers: [{ urls: "turn:rotated.example" }] } });
    await new Promise((r) => setTimeout(r, 0));
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
});
