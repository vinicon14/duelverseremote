/**
 * Testes de autorização da edge function get-ice-servers
 */
import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { handler } from "./index.ts";

Deno.test("sem Authorization header retorna 401", async () => {
  const req = new Request("http://localhost/get-ice-servers", {
    method: "GET",
  });

  const mockDeps = {
    getUser: async () => ({ user: null, error: new Error("No auth") }),
    getEnv: () => undefined,
  };

  const res = await handler(req, mockDeps);
  
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Authentication required");
});

Deno.test("getUser com erro retorna 401", async () => {
  const req = new Request("http://localhost/get-ice-servers", {
    method: "GET",
    headers: { "Authorization": "Bearer invalid-token" },
  });

  const mockDeps = {
    getUser: async () => ({ user: null, error: new Error("Invalid token") }),
    getEnv: () => undefined,
  };

  const res = await handler(req, mockDeps);
  
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid or expired token");
});

Deno.test("getUser com user nulo retorna 401", async () => {
  const req = new Request("http://localhost/get-ice-servers", {
    method: "GET",
    headers: { "Authorization": "Bearer anon-key" },
  });

  const mockDeps = {
    getUser: async () => ({ user: null, error: null }),
    getEnv: () => undefined,
  };

  const res = await handler(req, mockDeps);
  
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Invalid or expired token");
});

Deno.test("usuário válido retorna 200 com iceServers", async () => {
  const req = new Request("http://localhost/get-ice-servers", {
    method: "GET",
    headers: { "Authorization": "Bearer valid-token" },
  });

  const mockDeps = {
    getUser: async () => ({ user: { id: "user-123" }, error: null }),
    getEnv: () => undefined,
  };

  const res = await handler(req, mockDeps);
  
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body.iceServers), true);
  assertEquals(typeof body.hasTurn, "boolean");
  assertEquals(body.iceServers.length > 0, true);
});

Deno.test("21ª chamada no mesmo minuto retorna 429", async () => {
  const mockDeps = {
    getUser: async () => ({ user: { id: "rate-limit-test-user" }, error: null }),
    getEnv: () => undefined,
  };

  // Primeira 20 requisições devem passar
  for (let i = 0; i < 20; i++) {
    const req = new Request("http://localhost/get-ice-servers", {
      method: "GET",
      headers: { "Authorization": "Bearer valid-token" },
    });
    const res = await handler(req, mockDeps);
    assertEquals(res.status, 200, `Request ${i + 1} should succeed`);
  }

  // 21ª requisição deve retornar 429
  const req21 = new Request("http://localhost/get-ice-servers", {
    method: "GET",
    headers: { "Authorization": "Bearer valid-token" },
  });
  const res21 = await handler(req21, mockDeps);
  
  assertEquals(res21.status, 429);
  const body = await res21.json();
  assertEquals(body.error, "Rate limit exceeded. Please try again later.");
});

Deno.test("OPTIONS retorna 200 sem auth", async () => {
  const req = new Request("http://localhost/get-ice-servers", {
    method: "OPTIONS",
  });

  const mockDeps = {
    getUser: async () => ({ user: null, error: new Error("Should not be called") }),
    getEnv: () => undefined,
  };

  const res = await handler(req, mockDeps);
  
  assertEquals(res.status, 200);
});
