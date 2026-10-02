/**
 * Testes de segurança para send-push-notification
 */
import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { handler } from "./index.ts";

const mockDeps = (overrides: any = {}) => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve(overrides.duelData || { data: null, error: new Error('Not found') }),
          gte: () => Promise.resolve(overrides.rateLimitData || { count: 0, error: null }),
        }),
        eq: () => ({
          eq: () => Promise.resolve(overrides.subscriptionsData || { data: [], error: null }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
      delete: () => ({
        in: () => Promise.resolve({ error: null }),
      }),
    }),
    auth: {
      getUser: overrides.getUser || (() => Promise.resolve({ user: null, error: new Error('Invalid') })),
    },
  },
  getUser: overrides.getUser || (async () => ({ user: null, error: new Error('Invalid token') })),
  getEnv: overrides.getEnv || (() => 'mock-key'),
  buildAppServer: overrides.buildAppServer || (async () => ({
    buildPushMessage: () => Promise.resolve({ endpoint: 'https://push.test', headers: {}, body: new ArrayBuffer(0) }),
  })),
  fetchPush: overrides.fetchPush || (async () => new Response(null, { status: 201 })),
});

Deno.test("OPTIONS retorna 200 sem auth", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "OPTIONS",
  });

  const res = await handler(req, mockDeps());
  assertEquals(res.status, 200);
});

Deno.test("sem Authorization header retorna 401", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    body: JSON.stringify({ notification_type: 'duel_invite', context: {} }),
  });

  const res = await handler(req, mockDeps());
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Authentication required");
});

Deno.test("anon key sozinha (sem JWT) retorna 401", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: {
      "Authorization": "Bearer anon-key-only",
    },
    body: JSON.stringify({ notification_type: 'duel_invite', context: {} }),
  });

  const res = await handler(req, mockDeps({
    getUser: async () => ({ user: null, error: new Error('anon key not sufficient') }),
  }));

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid or expired token");
});

Deno.test("JWT inválido retorna 401", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: {
      "Authorization": "Bearer invalid-jwt",
    },
    body: JSON.stringify({ notification_type: 'duel_invite', context: {} }),
  });

  const res = await handler(req, mockDeps({
    getUser: async () => ({ user: null, error: new Error('Invalid token') }),
  }));

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid or expired token");
});

Deno.test("notification_type faltando retorna 400", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: {
      "Authorization": "Bearer valid-jwt",
    },
    body: JSON.stringify({ context: {} }),
  });

  const res = await handler(req, mockDeps({
    getUser: async () => ({ user: { id: 'user-123' }, error: null }),
  }));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.includes("notification_type"), true);
});

Deno.test("notification_type desconhecido retorna 400", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: {
      "Authorization": "Bearer valid-jwt",
    },
    body: JSON.stringify({ 
      notification_type: 'unknown_type', 
      context: { targetUserId: 'target-456', duelId: 'duel-789' } 
    }),
  });

  const res = await handler(req, mockDeps({
    getUser: async () => ({ user: { id: 'user-123' }, error: null }),
  }));

  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.includes("Unknown notification type"), true);
});

Deno.test("duel_invite sem targetUserId retorna 500", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: {
      "Authorization": "Bearer valid-jwt",
    },
    body: JSON.stringify({ 
      notification_type: 'duel_invite', 
      context: { duelId: 'duel-789' } 
    }),
  });

  const res = await handler(req, mockDeps({
    getUser: async () => ({ user: { id: 'user-123' }, error: null }),
  }));

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error.includes("targetUserId"), true);
});

Deno.test("duel_invite com targetUserId errado retorna 500", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: {
      "Authorization": "Bearer valid-jwt",
    },
    body: JSON.stringify({ 
      notification_type: 'duel_invite', 
      context: { 
        duelId: 'duel-789',
        targetUserId: 'wrong-user',
      } 
    }),
  });

  const mockDepsWithDuel = mockDeps({
    getUser: async () => ({ user: { id: 'user-123' }, error: null }),
  });

  // Override the from method to mock duel data
  mockDepsWithDuel.supabaseAdmin.from = (table: string) => {
    if (table === 'push_notification_rate_limit') {
      return {
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 0, error: null }),
          }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    }
    if (table === 'live_duels') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ 
              data: { creator_id: 'user-123', opponent_id: 'correct-opponent' }, 
              error: null 
            }),
          }),
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { username: 'TestUser' }, error: null }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    };
  };

  const res = await handler(req, mockDepsWithDuel);

  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error.includes("other duel participant"), true);
});

Deno.test("duel_invite válido retorna 200", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: {
      "Authorization": "Bearer valid-jwt",
    },
    body: JSON.stringify({ 
      notification_type: 'duel_invite', 
      context: { 
        duelId: 'duel-789',
        targetUserId: 'opponent-456',
      } 
    }),
  });

  const mockDepsValid = mockDeps({
    getUser: async () => ({ user: { id: 'user-123' }, error: null }),
  });

  mockDepsValid.supabaseAdmin.from = (table: string) => {
    if (table === 'push_notification_rate_limit') {
      return {
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 0, error: null }),
          }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    }
    if (table === 'live_duels') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ 
              data: { creator_id: 'user-123', opponent_id: 'opponent-456' }, 
              error: null 
            }),
          }),
        }),
      };
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { username: 'TestUser' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'push_subscriptions') {
      return {
        select: () => ({
          eq: () => Promise.resolve({ 
            data: [
              { 
                endpoint: 'https://push.test/endpoint1', 
                p256dh: 'test-p256dh', 
                auth: 'test-auth' 
              }
            ], 
            error: null 
          }),
        }),
        delete: () => ({
          in: () => Promise.resolve({ error: null }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    };
  };

  const res = await handler(req, mockDepsValid);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.sent, 1);
});

Deno.test("rate limit excedido retorna 429", async () => {
  const req = new Request("http://localhost/send-push-notification", {
    method: "POST",
    headers: {
      "Authorization": "Bearer valid-jwt",
    },
    body: JSON.stringify({ 
      notification_type: 'duel_invite', 
      context: { 
        duelId: 'duel-789',
        targetUserId: 'opponent-456',
      } 
    }),
  });

  const mockDepsRateLimit = mockDeps({
    getUser: async () => ({ user: { id: 'user-123' }, error: null }),
  });

  mockDepsRateLimit.supabaseAdmin.from = (table: string) => {
    if (table === 'push_notification_rate_limit') {
      return {
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 51, error: null }), // Over limit
          }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    }
    return {
      select: () => ({
        eq: () => Promise.resolve({ data: [], error: null }),
      }),
    };
  };

  const res = await handler(req, mockDepsRateLimit);

  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.error.includes("Rate limit exceeded"), true);
});
