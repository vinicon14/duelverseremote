// Run: deno test supabase/functions/discord-chat-sync/sync.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { DiscordApiMessage, DiscordChatInput, InsertDiscordChatResult } from "../_shared/discord-chat.ts";
import {
  checkCronAuth,
  type CursorStore,
  MAX_RATE_LIMIT_RETRIES,
  resolveBridgeChannelIds,
  syncChannel,
  type SyncDeps,
} from "./sync.ts";

const CH = "111111111111111111";

const human = (id: string, content = `msg ${id}`): DiscordApiMessage => ({
  id,
  type: 0,
  content,
  author: { id: "222222222222222222", username: "user", global_name: "User", avatar: null, discriminator: "0" },
});

function memCursors(initial: Record<string, string> = {}): CursorStore & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    get: (c) => Promise.resolve(data[c] ?? null),
    set: (c, v) => {
      data[c] = v;
      return Promise.resolve();
    },
  };
}

type Route = (url: URL) => Response;

function makeDeps(route: Route, cursors: CursorStore, overrides: Partial<SyncDeps> = {}) {
  const requests: URL[] = [];
  const inserted: DiscordChatInput[] = [];
  const seen = new Set<string>();
  const sleeps: number[] = [];
  const deps: SyncDeps = {
    botToken: "tok",
    fetchImpl: ((input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      requests.push(url);
      assertEquals((init?.headers as Record<string, string>).Authorization, "Bot tok");
      return Promise.resolve(route(url));
    }) as typeof fetch,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    now: () => 1_700_000_000_000,
    cursors,
    insert: (input): Promise<InsertDiscordChatResult> => {
      if (seen.has(input.discordMessageId!)) return Promise.resolve({ ok: true, inserted: false, linkedUsername: null });
      seen.add(input.discordMessageId!);
      inserted.push(input);
      return Promise.resolve({ ok: true, inserted: true, linkedUsername: null });
    },
    ...overrides,
  };
  return { deps, requests, inserted, sleeps };
}

const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

Deno.test("resolveBridgeChannelIds uses enabled servers with webhook (same as chat_to_discord)", () => {
  const value = JSON.stringify({
    servers: [
      { id: "g1", enabled: true, webhookUrl: "https://w/1", channelId: "123456789012345678" },
      { id: "g2", enabled: false, webhookUrl: "https://w/2", channelId: "223456789012345678" },
      { id: "g3", enabled: true, webhookUrl: null, channelId: "323456789012345678" },
      { id: "g4", enabled: true, webhookUrl: "https://w/4", channelId: "../../evil" },
      { id: "g5", enabled: true, webhookUrl: "https://w/5", channelId: "123456789012345678" },
    ],
  });
  assertEquals(resolveBridgeChannelIds(value), ["123456789012345678"]);
  assertEquals(resolveBridgeChannelIds({ servers: [] }), []);
  assertEquals(resolveBridgeChannelIds("not json"), []);
  assertEquals(resolveBridgeChannelIds(null), []);
});

Deno.test("first run: stores newest id, imports nothing", async () => {
  const cursors = memCursors();
  const { deps, requests, inserted } = makeDeps(() => jsonRes([human("1000000000000000500")]), cursors);
  const r = await syncChannel(deps, CH);
  assertEquals(r.status, "initialized");
  assertEquals(cursors.data[CH], "1000000000000000500");
  assertEquals(inserted.length, 0);
  assertEquals(requests[0].searchParams.get("limit"), "1");
  assertEquals(requests[0].searchParams.get("after"), null);
});

Deno.test("first run on empty channel: cursor = snowflake(now)", async () => {
  const cursors = memCursors();
  const { deps } = makeDeps(() => jsonRes([]), cursors);
  await syncChannel(deps, CH);
  assert(BigInt(cursors.data[CH]) > 0n);
});

Deno.test("imports new human messages oldest-first, skips bots/webhooks, advances cursor", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  const batch: DiscordApiMessage[] = [
    human("1004", "quarta"),
    { ...human("1003"), webhook_id: "w", content: "/dv eco do app" },
    { ...human("1002"), author: { id: "9", username: "bot", bot: true } },
    human("1001", "primeira"),
  ];
  const { deps, requests, inserted } = makeDeps(() => jsonRes(batch), cursors);
  const r = await syncChannel(deps, CH);
  assertEquals(r.status, "synced");
  assertEquals(inserted.map((i) => i.content), ["primeira", "quarta"]);
  assertEquals(r.skipped, { webhook: 1, bot: 1 });
  assertEquals(cursors.data[CH], "1004");
  assertEquals(requests[0].searchParams.get("after"), "1000");
  assertEquals(requests[0].searchParams.get("limit"), "100");
  assertEquals(requests[0].pathname, `/api/v10/channels/${CH}/messages`);
});

Deno.test("cursor advances past skipped-only batches", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  const { deps, inserted } = makeDeps(() => jsonRes([{ ...human("1001"), webhook_id: "w" }]), cursors);
  await syncChannel(deps, CH);
  assertEquals(inserted.length, 0);
  assertEquals(cursors.data[CH], "1001");
});

Deno.test("paginates when a full page (100) is returned", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  const page1 = Array.from({ length: 100 }, (_, i) => human(String(1001 + i))).reverse();
  const page2 = [human("1101")];
  const { deps, requests, inserted } = makeDeps((url) => {
    return url.searchParams.get("after") === "1000" ? jsonRes(page1) : jsonRes(page2);
  }, cursors);
  const r = await syncChannel(deps, CH);
  assertEquals(inserted.length, 101);
  assertEquals(requests[1].searchParams.get("after"), "1100");
  assertEquals(cursors.data[CH], "1101");
  assertEquals(r.cursor, "1101");
});

Deno.test("429: waits retry_after then retries", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  let calls = 0;
  const { deps, sleeps, inserted } = makeDeps(() => {
    calls++;
    return calls === 1 ? jsonRes({ message: "You are being rate limited.", retry_after: 1.5, global: false }, 429) : jsonRes([human("1001")]);
  }, cursors);
  const r = await syncChannel(deps, CH);
  assertEquals(r.status, "synced");
  assertEquals(sleeps, [1500]);
  assertEquals(inserted.length, 1);
});

Deno.test("429 persistently: gives up without moving the cursor", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  const { deps, sleeps } = makeDeps(() => jsonRes({ retry_after: 0.1 }, 429), cursors);
  const r = await syncChannel(deps, CH);
  assertEquals(r.status, "error");
  assertEquals(sleeps.length, MAX_RATE_LIMIT_RETRIES);
  assertEquals(cursors.data[CH], "1000");
});

Deno.test("429 with huge retry_after: does not sleep the function", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  const { deps, sleeps } = makeDeps(() => jsonRes({ retry_after: 120 }, 429), cursors);
  const r = await syncChannel(deps, CH);
  assertEquals(r.status, "error");
  assertEquals(sleeps.length, 0);
});

Deno.test("Discord 403 (missing access) reported as error, cursor untouched", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  const { deps } = makeDeps(() => jsonRes({ message: "Missing Access", code: 50001 }, 403), cursors);
  const r = await syncChannel(deps, CH);
  assertEquals(r.status, "error");
  assert(r.error?.includes("403"));
  assertEquals(cursors.data[CH], "1000");
});

Deno.test("insert failure stops at last good message (retried next run)", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  let n = 0;
  const { deps } = makeDeps(() => jsonRes([human("1003"), human("1002"), human("1001")]), cursors, {
    insert: () => {
      n++;
      return Promise.resolve(
        n === 2 ? { ok: false, stage: "insert", error: "db down" } : { ok: true, inserted: true, linkedUsername: null },
      );
    },
  });
  const r = await syncChannel(deps, CH);
  assertEquals(r.status, "error");
  assertEquals(cursors.data[CH], "1001");
});

Deno.test("dedupe: re-processing the same messages (stale cursor / overlapping runs) never double-inserts", async () => {
  const cursors = memCursors({ [CH]: "1000" });
  const { deps, inserted } = makeDeps(() => jsonRes([human("1002"), human("1001")]), cursors);
  await syncChannel(deps, CH);
  cursors.data[CH] = "1000"; // simulate a concurrent run that saved an older cursor
  const r = await syncChannel(deps, CH);
  assertEquals(inserted.length, 2);
  assertEquals(r.duplicates, 2);
});

Deno.test("checkCronAuth fails closed", () => {
  const secret = "0123456789abcdef0123456789abcdef";
  assertEquals(checkCronAuth(null, secret), "not_configured");
  assertEquals(checkCronAuth("", secret), "not_configured");
  assertEquals(checkCronAuth("short", "short"), "not_configured");
  assertEquals(checkCronAuth(secret, null), "unauthorized");
  assertEquals(checkCronAuth(secret, secret + "x"), "unauthorized");
  assertEquals(checkCronAuth(secret, secret.replace("0", "1")), "unauthorized");
  assertEquals(checkCronAuth(secret, secret), "ok");
});
