#!/usr/bin/env node
/**
 * E2E: two duelists + one spectator in real headless Chrome (fake camera/mic
 * via --use-fake-device-for-media-stream), running the real WebRTCVideoCall
 * component. Signalling is a local stand-in for Supabase Realtime broadcast
 * (tests/e2e/harness/fakeSupabase.ts); no Supabase project is touched.
 *
 * Scenarios: spectator joining before the duelists, steady state signalling
 * volume, simulated ICE failure on each side (the harness overrides
 * iceConnectionState, the real ICE restart then runs end to end), page reloads
 * and a crash without "leave".
 *
 *   npm run test:e2e:webrtc
 *   DV_SRC=/path/to/other/checkout/src npm run test:e2e:webrtc   # A/B baseline
 *
 * Requires Google Chrome (CHROME_PATH, default /usr/bin/google-chrome).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { startServer } from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 4789);
const LABEL = process.env.E2E_LABEL ?? (process.env.DV_SRC ? `src=${process.env.DV_SRC}` : "worktree");
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 60000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P1 = "aaaaaaaa-0000-4000-8000-000000000001"; // creator, elected offerer
const P2 = "bbbbbbbb-0000-4000-8000-000000000002";
const SPEC = "cccccccc-0000-4000-8000-000000000003";

const procs = new Map();
function startPage(name, user, role) {
  const url = `http://127.0.0.1:${PORT}/?name=${name}&user=${user}&role=${role}&p1=${P1}&p2=${P2}&room=e2e`;
  const child = spawn(process.execPath, [path.join(here, "player.mjs"), url], {
    env: { ...process.env, E2E_NAME: name },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdout.on("data", (d) => { if (process.env.E2E_VERBOSE) process.stdout.write(d); });
  child.stderr.on("data", (d) => { if (process.env.E2E_VERBOSE) process.stderr.write(d); });
  procs.set(name, child);
}
function stopPage(name, signal = "SIGTERM") {
  procs.get(name)?.kill(signal);
  procs.delete(name);
}

let server;
const reportsOf = (name) => server.reports.get(name) ?? [];
const latest = (name) => reportsOf(name).at(-1);
/** Video frames advancing on >= minPeers connections, using only reports newer than `since`. */
function advancing(name, minPeers, since) {
  const list = reportsOf(name);
  const now = list.at(-1);
  if (!now || now.at < since + 1500) return false;
  const prev = [...list].reverse().find((r) => r.at <= now.at - 1500 && r.at >= since);
  if (!prev) return false;
  let n = 0;
  for (const p of now.peers) {
    const q = prev.peers.find((x) => x.index === p.index);
    if (q && p.state === "connected" && p.frames > q.frames) n++;
  }
  return n >= minPeers;
}
const allFlowing = (since) => advancing("A", 1, since) && advancing("B", 1, since) && advancing("S", 2, since);
const forcedLeft = () => ["A", "B", "S"].reduce((n, k) => n + (latest(k)?.peers ?? []).filter((p) => p.forced && p.state !== "closed").length, 0);
async function waitFor(pred, timeout = TIMEOUT) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (pred()) return (Date.now() - t0) / 1000;
    await sleep(250);
  }
  return null;
}
const created = () => ({ A: latest("A")?.created ?? 0, B: latest("B")?.created ?? 0, S: latest("S")?.created ?? 0 });
const ufrags = (name) => (latest(name)?.peers ?? []).filter((p) => p.state === "connected").map((p) => `${p.index}:${p.ufrag}`).join(",");

const results = [];
function dumpState() {
  for (const name of ["A", "B", "S"]) {
    const r = latest(name);
    console.log(`[e2e] ${name} last report ${r ? Math.round((Date.now() - r.at) / 1000) + "s ago" : "none"}:`,
      JSON.stringify(r?.peers?.filter((p) => p.state !== "closed")), JSON.stringify(r?.signals));
  }
}
async function scenario(name, action, extraDone = () => true) {
  await waitFor(() => allFlowing(Date.now() - 3000), 15000);
  const before = created();
  const deliveriesBefore = server.broadcasts ?? 0;
  const since = await action();
  const secs = await waitFor(() => extraDone() && allFlowing(since));
  const after = created();
  if (secs === null) dumpState();
  results.push({
    scenario: name,
    recovered: secs === null ? `FAIL (> ${TIMEOUT / 1000}s)` : `${secs.toFixed(1)}s`,
    newPCs: `A+${after.A - before.A} B+${after.B - before.B} S+${after.S - before.S}`,
    signalDeliveries: (server.broadcasts ?? 0) - deliveriesBefore,
  });
  console.log(JSON.stringify(results.at(-1)));
  await sleep(3000);
}

async function main() {
  const dist = process.env.DV_OUT ? path.resolve(process.env.DV_OUT) : path.join(here, ".harness-dist");
  await build({ configFile: path.join(here, "vite.config.e2e.ts"), mode: "production" });
  server = await startServer({ port: PORT, dist });
  console.log(`[e2e] ${LABEL}`);

  startPage("S", SPEC, "spectator"); // spectator joins before the duelists
  await sleep(2000);
  startPage("A", P1, "player");
  startPage("B", P2, "player");

  const t0 = Date.now();
  const initial = await waitFor(() => allFlowing(t0), Number(process.env.E2E_INITIAL_MS ?? 90000));
  results.push({ scenario: "initial connect (spectator joined first)", recovered: initial === null ? "FAIL" : `${initial.toFixed(1)}s`, newPCs: JSON.stringify(created()), signalDeliveries: server.broadcasts ?? 0 });
  console.log(JSON.stringify(results.at(-1)));
  if (initial === null) { dumpState(); throw new Error("initial connection failed"); }

  const d0 = server.broadcasts ?? 0;
  const c0 = created();
  await sleep(20000);
  const c1 = created();
  results.push({ scenario: "steady state 20s (no events)", recovered: allFlowing(Date.now() - 4000) ? "flowing" : "NOT flowing", newPCs: `A+${c1.A - c0.A} B+${c1.B - c0.B} S+${c1.S - c0.S}`, signalDeliveries: (server.broadcasts ?? 0) - d0 });
  console.log(JSON.stringify(results.at(-1)));

  for (const who of ["B", "A"]) {
    let before;
    await scenario(`ICE failure on ${who} (${who === "A" ? "offerer" : "non-offerer"})`, async () => {
      before = { A: ufrags("A"), B: ufrags("B") };
      procs.get(who).stdin.write("force-ice-failure\n");
      await sleep(600);
      return Date.now();
    }, () => forcedLeft() === 0);
    console.log(`[e2e]   ufrags before ${JSON.stringify(before)} after ${JSON.stringify({ A: ufrags("A"), B: ufrags("B") })}`);
  }

  await scenario("B reloads the page (F5)", async () => {
    procs.get("B").stdin.write("reload\n");
    await sleep(500);
    return Date.now();
  });
  await scenario("B crashes (killed, no pagehide/leave) and rejoins", async () => {
    stopPage("B", "SIGKILL");
    await sleep(1500);
    startPage("B", P2, "player");
    return Date.now();
  });
  {
    // Waiting room: only A + spectator for 20 s. Measures heartbeat traffic
    // (each delivery counts toward the project-wide Realtime quota).
    stopPage("B");
    await sleep(3000);
    const w0 = server.broadcasts ?? 0;
    await sleep(20000);
    results.push({ scenario: "waiting 20s for B (A + spectator only)", recovered: "-", newPCs: JSON.stringify(created()), signalDeliveries: (server.broadcasts ?? 0) - w0 });
    console.log(JSON.stringify(results.at(-1)));
    await scenario("B rejoins after the wait", async () => {
      startPage("B", P2, "player");
      return Date.now();
    });
  }
  await scenario("A (offerer) reloads the page (F5)", async () => {
    procs.get("A").stdin.write("reload\n");
    await sleep(500);
    return Date.now();
  });
  await scenario("spectator reloads the page", async () => {
    procs.get("S").stdin.write("reload\n");
    await sleep(500);
    return Date.now();
  });
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  console.error("[e2e] error:", e.message);
} finally {
  for (const name of [...procs.keys()]) stopPage(name);
  server?.close();
  console.log(`\n[e2e] results — ${LABEL}`);
  console.table(results);
  if (results.some((r) => String(r.recovered).startsWith("FAIL") || r.recovered === "NOT flowing")) failed = true;
  process.exit(failed ? 1 : 0);
}
