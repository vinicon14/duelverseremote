/**
 * Testes de segurança e entrega para send-push-notification
 */
import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { createWebPushSender, type Dependencies, handler, RATE_LIMIT_MAX } from "./index.ts";

// ---------------------------------------------------------------------------
// Minimal in-memory fake of the supabase-js query builder
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function fakeSupabase(tables: Tables, opts: { rpcError?: boolean; failTable?: string } = {}) {
  const calls: { rpc: unknown[]; deletes: { table: string; filters: unknown[] }[] } = { rpc: [], deletes: [] };
  const quota: Row[] = (tables.push_notification_rate_limit ??= []);
  function builder(table: string) {
    const filters: [string, string, unknown][] = [];
    let op: 'select' | 'delete' = 'select';
    let lim: number | undefined;
    const rows = () => {
      if (opts.failTable === table) return { data: null, error: { message: 'boom' } };
      let r = (tables[table] ?? []).filter((row) =>
        filters.every(([kind, col, v]) => kind === 'eq' ? row[col] === v : (v as unknown[]).includes(row[col]))
      );
      if (lim !== undefined) r = r.slice(0, lim);
      return { data: r, error: null };
    };
    const run = () => {
      if (op === 'delete') {
        calls.deletes.push({ table, filters: [...filters] });
        const keep = (tables[table] ?? []).filter((row) =>
          !filters.every(([kind, col, v]) => kind === 'eq' ? row[col] === v : (v as unknown[]).includes(row[col]))
        );
        tables[table] = keep;
        if (table === 'push_notification_rate_limit') { quota.length = 0; quota.push(...keep); tables[table] = quota; }
        return { data: null, error: null };
      }
      return rows();
    };
    const b: Record<string, unknown> = {
      select: () => { op = 'select'; return b; },
      delete: () => { op = 'delete'; return b; },
      eq: (col: string, v: unknown) => { filters.push(['eq', col, v]); return b; },
      in: (col: string, v: unknown[]) => { filters.push(['in', col, v]); return b; },
      limit: (n: number) => { lim = n; return b; },
      maybeSingle: () => { const r = rows(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  }
  const client = {
    from: (t: string) => builder(t),
    rpc: (name: string, args: Row) => {
      calls.rpc.push({ name, args });
      if (opts.rpcError) return Promise.resolve({ data: null, error: { message: 'function does not exist' } });
      const count = quota.filter((q) => q.user_id === args.p_user_id).length;
      if (count >= (args.p_max as number)) return Promise.resolve({ data: null, error: null });
      const id = crypto.randomUUID();
      quota.push({ id, user_id: args.p_user_id });
      return Promise.resolve({ data: id, error: null });
    },
  };
  return { client, calls, quota };
}

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const EVE = "33333333-3333-3333-3333-333333333333";
const DUEL = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const SERVICE_KEY = "service-role-key-xyz";

function baseTables(): Tables {
  return {
    live_duels: [{ id: DUEL, creator_id: ALICE, opponent_id: null, status: "waiting" }],
    duel_invites: [{ id: "inv1", duel_id: DUEL, sender_id: ALICE, receiver_id: BOB, status: "pending" }],
    profiles: [{ user_id: ALICE, username: "alice" }],
    push_subscriptions: [
      { user_id: BOB, endpoint: "https://push.test/bob1", p256dh: "k", auth: "a" },
      { user_id: EVE, endpoint: "https://push.test/eve1", p256dh: "k", auth: "a" },
    ],
  };
}

function deps(tables: Tables, o: Partial<Dependencies> & { rpcError?: boolean; failTable?: string; pushStatus?: number } = {}) {
  const sb = fakeSupabase(tables, o);
  const pushed: { endpoint: string; payload: string }[] = [];
  const d: Dependencies = {
    // deno-lint-ignore no-explicit-any
    supabaseAdmin: sb.client as any,
    getUser: o.getUser ?? (async (token: string) =>
      token === "jwt-alice" ? { user: { id: ALICE }, error: null }
      : token === "jwt-eve" ? { user: { id: EVE }, error: null }
      : { user: null, error: new Error("invalid") }),
    getEnv: o.getEnv ?? ((k: string) => ({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv" } as Record<string, string>)[k]),
    sendPush: o.sendPush ?? (async (sub, payload) => { pushed.push({ endpoint: sub.endpoint, payload }); return o.pushStatus ?? 201; }),
    isServiceRoleToken: o.isServiceRoleToken,
  };
  return { d, sb, pushed };
}

const post = (token: string | null, body: unknown) =>
  new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const invite = (ctx: Record<string, unknown> = {}) => ({ notification_type: "duel_invite", context: { duelId: DUEL, targetUserId: BOB, ...ctx } });

Deno.test("OPTIONS retorna 200", async () => {
  const { d } = deps(baseTables());
  const res = await handler(new Request("http://x", { method: "OPTIONS" }), d);
  assertEquals(res.status, 200);
});

Deno.test("sem Authorization retorna 401", async () => {
  const { d } = deps(baseTables());
  assertEquals((await handler(post(null, invite()), d)).status, 401);
});

Deno.test("anon key / JWT inválido retorna 401 e não consome quota", async () => {
  const { d, sb, pushed } = deps(baseTables());
  const res = await handler(post("anon-key", invite()), d);
  assertEquals(res.status, 401);
  assertEquals(sb.calls.rpc.length, 0);
  assertEquals(pushed.length, 0);
});

Deno.test("getUser recebe o token do chamador (sem 'Bearer ')", async () => {
  let seen = "";
  const { d } = deps(baseTables(), { getUser: async (t) => { seen = t; return { user: { id: ALICE }, error: null }; } });
  await handler(post("jwt-alice", invite()), d);
  assertEquals(seen, "jwt-alice");
});

Deno.test("duel_invite válido (opponent_id ainda NULL, convite pendente) entrega ao alvo", async () => {
  const { d, pushed, sb } = deps(baseTables());
  const res = await handler(post("jwt-alice", invite()), d);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.sent, 1);
  assertEquals(pushed.map((p) => p.endpoint), ["https://push.test/bob1"]);
  const msg = JSON.parse(pushed[0].payload);
  assertEquals(msg.title, "Convite de Duelo");
  assertEquals(msg.body, "alice te desafiou para um duelo!");
  assertEquals(sb.quota.length, 1);
});

Deno.test("título/corpo do cliente são ignorados (server-controlled)", async () => {
  const { d, pushed } = deps(baseTables());
  await handler(post("jwt-alice", { ...invite(), title: "PHISH", body: "click http://evil" }), d);
  assert(!pushed[0].payload.includes("PHISH") && !pushed[0].payload.includes("evil"));
});

Deno.test("alvo sem convite pendente (UUID arbitrário) retorna 403 e não consome quota", async () => {
  const { d, pushed, sb } = deps(baseTables());
  const res = await handler(post("jwt-alice", invite({ targetUserId: EVE })), d);
  assertEquals(res.status, 403);
  assertEquals(pushed.length, 0);
  assertEquals(sb.calls.rpc.length, 0);
});

Deno.test("quem não criou o duelo retorna 403", async () => {
  const { d, pushed } = deps(baseTables());
  const res = await handler(post("jwt-eve", invite()), d);
  assertEquals(res.status, 403);
  assertEquals(pushed.length, 0);
});

Deno.test("opponent_id preenchido com outro usuário retorna 403", async () => {
  const t = baseTables();
  t.live_duels[0].opponent_id = EVE;
  const { d } = deps(t);
  assertEquals((await handler(post("jwt-alice", invite()), d)).status, 403);
});

Deno.test("duelo inexistente retorna 404; campos faltando retornam 400", async () => {
  const { d } = deps(baseTables());
  assertEquals((await handler(post("jwt-alice", invite({ duelId: "nope" })), d)).status, 404);
  assertEquals((await handler(post("jwt-alice", invite({ targetUserId: undefined })), d)).status, 400);
  assertEquals((await handler(post("jwt-alice", { notification_type: "duel_invite" }), d)).status, 400);
  assertEquals((await handler(post("jwt-alice", { notification_type: "custom", context: {} }), d)).status, 400);
});

Deno.test("rate limit: 51ª notificação na janela retorna 429", async () => {
  const t = baseTables();
  t.push_notification_rate_limit = Array.from({ length: RATE_LIMIT_MAX }, () => ({ id: crypto.randomUUID(), user_id: ALICE }));
  const { d, pushed } = deps(t);
  const res = await handler(post("jwt-alice", invite()), d);
  assertEquals(res.status, 429);
  assertEquals(pushed.length, 0);
});

Deno.test("rate limit: falha de entrega devolve a quota", async () => {
  const { d, sb } = deps(baseTables(), { pushStatus: 500 });
  const res = await handler(post("jwt-alice", invite()), d);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).sent, 0);
  assertEquals(sb.quota.length, 0);
});

Deno.test("rate limit: erro ao buscar subscriptions devolve a quota", async () => {
  const { d, sb } = deps(baseTables(), { failTable: "push_subscriptions" });
  const res = await handler(post("jwt-alice", invite()), d);
  assertEquals(res.status, 500);
  assertEquals(sb.quota.length, 0);
});

Deno.test("rate limit: alvo sem subscriptions não consome quota", async () => {
  const t = baseTables();
  t.push_subscriptions = [];
  const { d, sb } = deps(t);
  assertEquals((await handler(post("jwt-alice", invite()), d)).status, 200);
  assertEquals(sb.quota.length, 0);
});

Deno.test("rate limit: RPC indisponível (migration não aplicada) não bloqueia o envio", async () => {
  const { d, pushed } = deps(baseTables(), { rpcError: true });
  assertEquals((await handler(post("jwt-alice", invite()), d)).status, 200);
  assertEquals(pushed.length, 1);
});

Deno.test("410 remove subscription expirada", async () => {
  const t = baseTables();
  const { d } = deps(t, { pushStatus: 410 });
  await handler(post("jwt-alice", invite()), d);
  assertEquals(t.push_subscriptions.map((s) => s.endpoint), ["https://push.test/eve1"]);
});

// --- internal callers (DB triggers using the service_role key, legacy payload) ---
Deno.test("trigger (service_role) com payload legado user_ids entrega", async () => {
  const { d, pushed } = deps(baseTables());
  const res = await handler(post(SERVICE_KEY, { user_ids: [BOB], title: "Pedido de Amizade", body: "x quer ser seu amigo!", data: { url: "/friends" } }), d);
  assertEquals(res.status, 200);
  assertEquals(pushed.map((p) => p.endpoint), ["https://push.test/bob1"]);
  assertEquals(JSON.parse(pushed[0].payload).title, "Pedido de Amizade");
});

Deno.test("trigger (service_role) broadcast com exclude_user_id", async () => {
  const { d, pushed } = deps(baseTables());
  const res = await handler(post(SERVICE_KEY, { title: "📰 Nova Notícia", body: "t", exclude_user_id: EVE }), d);
  assertEquals(res.status, 200);
  assertEquals(pushed.map((p) => p.endpoint), ["https://push.test/bob1"]);
});

Deno.test("payload legado com JWT de usuário comum é rejeitado (400, nada enviado)", async () => {
  const { d, pushed } = deps(baseTables());
  const res = await handler(post("jwt-alice", { user_ids: [BOB], title: "x", body: "y" }), d);
  assertEquals(res.status, 400);
  assertEquals(pushed.length, 0);
});

Deno.test("JWT forjado com role=service_role é rejeitado se não provar ser chave válida", async () => {
  const forged = `e30.${btoa(JSON.stringify({ role: "service_role" }))}.sig`;
  const { d, pushed } = deps(baseTables(), { isServiceRoleToken: async () => false });
  const res = await handler(post(forged, { title: "x", body: "y" }), d);
  assertEquals(res.status, 401);
  assertEquals(pushed.length, 0);
});

// ---------------------------------------------------------------------------
// Real delivery through @negrel/webpush: encrypt -> capture -> decrypt (RFC 8291)
// ---------------------------------------------------------------------------
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const te = new TextEncoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const k = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource }, k, len * 8));
}

Deno.test("entrega real: VAPID em base64url (formato web-push) + payload cifrado aes128gcm decifrável", async () => {
  // VAPID keys in the standard web-push format (what VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY hold)
  const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const vapidPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey));
  const vapidPrivJwk = await crypto.subtle.exportKey("jwk", vapid.privateKey);
  const env: Record<string, string> = { VAPID_PUBLIC_KEY: b64u(vapidPubRaw), VAPID_PRIVATE_KEY: vapidPrivJwk.d! };

  // Browser (user agent) subscription
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const uaPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey));
  const authSecret = crypto.getRandomValues(new Uint8Array(16));

  const realFetch = globalThis.fetch;
  let captured: { url: string; headers: Headers; body: Uint8Array } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured = { url, headers: new Headers(init.headers), body: new Uint8Array(init.body as ArrayBuffer) };
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  try {
    const send = createWebPushSender((k) => env[k]);
    const status = await send({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: b64u(uaPubRaw), auth: b64u(authSecret) }, JSON.stringify({ title: "Olá", body: "teste" }));
    assertEquals(status, 201);
  } finally {
    globalThis.fetch = realFetch;
  }
  const c = captured!;
  assertEquals(c.url, "https://fcm.googleapis.com/fcm/send/abc");
  assertEquals(c.headers.get("content-encoding"), "aes128gcm");
  const auth = c.headers.get("authorization")!;
  assertMatch(auth, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  assertEquals(auth.split("k=")[1], b64u(vapidPubRaw));

  // VAPID JWT signature verifies with our public key and targets the push service origin
  const jwt = auth.slice("vapid t=".length).split(",")[0];
  const [h, p, s] = jwt.split(".");
  assert(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, vapid.publicKey, unb64u(s) as BufferSource, te.encode(`${h}.${p}`)));
  assertEquals(JSON.parse(new TextDecoder().decode(unb64u(p))).aud, "https://fcm.googleapis.com");

  // Decrypt per RFC 8291 / RFC 8188
  const body = c.body;
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPubRaw = body.slice(21, 21 + idlen);
  const ciphertext = body.slice(21 + idlen);
  const asPub = await crypto.subtle.importKey("raw", asPubRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asPub }, ua.privateKey, 256));
  const keyInfo = new Uint8Array([...te.encode("WebPush: info\0"), ...uaPubRaw, ...asPubRaw]);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as BufferSource }, key, ciphertext));
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  assertEquals(plain[end], 2); // last-record delimiter
  assertEquals(JSON.parse(new TextDecoder().decode(plain.slice(0, end))), { title: "Olá", body: "teste" });
});
