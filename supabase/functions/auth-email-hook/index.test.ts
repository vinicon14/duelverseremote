/**
 * Testes de segurança para auth-email-hook
 */
import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { handler, verifyStandardWebhookSignature } from "./index.ts";
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

// deno-lint-ignore no-explicit-any
const mockDeps = (overrides: any = {}): any => ({
  supabase: {
    from: () => ({
      insert: () => Promise.resolve({ error: null }),
    }),
    rpc: () => Promise.resolve({ error: null }),
  },
  getEnv: overrides.getEnv || ((key: string) => {
    if (key === 'SEND_EMAIL_HOOK_SECRET') return overrides.hookSecret;
    if (key === 'SMTP_USER') return 'noreply@duelverse.site';
    return undefined;
  }),
  verifySignature: overrides.verifySignature || (async () => true),
});

const validPayload = {
  type: 'signup',
  user: { email: 'test@example.com' },
  email_data: {
    token_hash: 'test-token-hash',
    redirect_to: 'https://duelverse.site/',
  },
};

Deno.test("OPTIONS retorna 200 sem auth", async () => {
  const req = new Request("http://localhost/auth-email-hook", {
    method: "OPTIONS",
  });

  const res = await handler(req, mockDeps());
  assertEquals(res.status, 200);
});

Deno.test("sem SEND_EMAIL_HOOK_SECRET, processa sem verificar", async () => {
  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    body: JSON.stringify(validPayload),
  });

  const res = await handler(req, mockDeps({ hookSecret: undefined }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("com secret, sem headers de assinatura retorna 401", async () => {
  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    body: JSON.stringify(validPayload),
  });

  const res = await handler(req, mockDeps({ hookSecret: 'whsec_testsecret' }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.includes("Missing signature headers"), true);
});

Deno.test("com secret, timestamp expirado retorna 401", async () => {
  const expiredTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000); // 10 minutes ago

  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    headers: {
      'webhook-id': 'test-id',
      'webhook-timestamp': expiredTimestamp.toString(),
      'webhook-signature': 'v1,testsignature',
    },
    body: JSON.stringify(validPayload),
  });

  const res = await handler(req, mockDeps({ 
    hookSecret: 'whsec_testsecret',
    verifySignature: async () => true,
  }));

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.includes("Timestamp out of tolerance"), true);
});

Deno.test("com secret, assinatura inválida retorna 401", async () => {
  const timestamp = Math.floor(Date.now() / 1000);

  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    headers: {
      'webhook-id': 'test-id',
      'webhook-timestamp': timestamp.toString(),
      'webhook-signature': 'v1,invalidsignature',
    },
    body: JSON.stringify(validPayload),
  });

  const res = await handler(req, mockDeps({ 
    hookSecret: 'whsec_testsecret',
    verifySignature: async () => false, // Invalid signature
  }));

  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error.includes("Invalid signature"), true);
});

Deno.test("com secret, assinatura válida retorna 200", async () => {
  const timestamp = Math.floor(Date.now() / 1000);

  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    headers: {
      'webhook-id': 'test-id',
      'webhook-timestamp': timestamp.toString(),
      'webhook-signature': 'v1,validsignature',
    },
    body: JSON.stringify(validPayload),
  });

  const res = await handler(req, mockDeps({ 
    hookSecret: 'whsec_testsecret',
    verifySignature: async () => true,
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
});

Deno.test("payload.data.url é ignorado (usa URL server-side)", async () => {
  const payloadWithMaliciousUrl = {
    type: 'signup',
    user: { email: 'test@example.com' },
    email_data: {
      token_hash: 'test-token-hash',
      redirect_to: 'https://duelverse.site/',
    },
    data: {
      url: 'https://evil.com/phishing', // Should be ignored
    },
  };

  const timestamp = Math.floor(Date.now() / 1000);

  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    headers: {
      'webhook-id': 'test-id',
      'webhook-timestamp': timestamp.toString(),
      'webhook-signature': 'v1,validsignature',
    },
    body: JSON.stringify(payloadWithMaliciousUrl),
  });

  const res = await handler(req, mockDeps({ 
    hookSecret: 'whsec_testsecret',
    verifySignature: async () => true,
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  // The URL should be built server-side, not from payload.data.url
});

Deno.test("redirect_to fora da whitelist usa URL padrão", async () => {
  const payloadWithBadRedirect = {
    type: 'signup',
    user: { email: 'test@example.com' },
    email_data: {
      token_hash: 'test-token-hash',
      redirect_to: 'https://evil.com/phishing',
    },
  };

  const timestamp = Math.floor(Date.now() / 1000);

  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    headers: {
      'webhook-id': 'test-id',
      'webhook-timestamp': timestamp.toString(),
      'webhook-signature': 'v1,validsignature',
    },
    body: JSON.stringify(payloadWithBadRedirect),
  });

  const res = await handler(req, mockDeps({ 
    hookSecret: 'whsec_testsecret',
    verifySignature: async () => true,
  }));

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  // Should use default redirect, not the evil one
});

Deno.test("tipo de email desconhecido retorna 400", async () => {
  const payloadWithUnknownType = {
    type: 'unknown_type',
    user: { email: 'test@example.com' },
    email_data: {
      token_hash: 'test-token-hash',
    },
  };

  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    body: JSON.stringify(payloadWithUnknownType),
  });

  const res = await handler(req, mockDeps({ hookSecret: undefined }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.includes("Unknown email type"), true);
});

Deno.test("email faltando retorna 400", async () => {
  const payloadWithoutEmail = {
    type: 'signup',
    email_data: {
      token_hash: 'test-token-hash',
    },
  };

  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    body: JSON.stringify(payloadWithoutEmail),
  });

  const res = await handler(req, mockDeps({ hookSecret: undefined }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error.includes("Missing email type or recipient"), true);
});

// ---------------------------------------------------------------------------
// Interop with the reference `standardwebhooks` library (what Supabase Auth uses)
// ---------------------------------------------------------------------------
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const rawKey = randomKey();
const supabaseSecret = `v1,whsec_${rawKey}`; // format shown in the Supabase dashboard
const interopBody = JSON.stringify(validPayload);
const msgId = "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W";
const signedAt = new Date();
const signedTs = Math.floor(signedAt.getTime() / 1000).toString();
const libSign = (key: string) => new Webhook(key).sign(msgId, signedAt, interopBody);

Deno.test("interop: assinatura da lib standardwebhooks é aceita (v1,whsec_)", async () => {
  assertEquals(await verifyStandardWebhookSignature(supabaseSecret, msgId, signedTs, interopBody, libSign(rawKey)), true);
});

Deno.test("interop: secret com prefixo whsec_ também funciona", async () => {
  assertEquals(await verifyStandardWebhookSignature(`whsec_${rawKey}`, msgId, signedTs, interopBody, libSign(rawKey)), true);
});

Deno.test("interop: header com várias assinaturas separadas por espaço (rotação de chave)", async () => {
  const header = `${libSign(randomKey())} ${libSign(rawKey)}`;
  // a lib de referência aceita este header
  new Webhook(rawKey).verify(interopBody, { "webhook-id": msgId, "webhook-timestamp": signedTs, "webhook-signature": header });
  assertEquals(await verifyStandardWebhookSignature(supabaseSecret, msgId, signedTs, interopBody, header), true);
  assertEquals(await verifyStandardWebhookSignature(supabaseSecret, msgId, signedTs, interopBody, `${libSign(rawKey)} ${libSign(randomKey())}`), true);
});

Deno.test("interop: corpo adulterado / secret errado / versão errada são rejeitados", async () => {
  assertEquals(await verifyStandardWebhookSignature(supabaseSecret, msgId, signedTs, interopBody + " ", libSign(rawKey)), false);
  assertEquals(await verifyStandardWebhookSignature(`v1,whsec_${randomKey()}`, msgId, signedTs, interopBody, libSign(rawKey)), false);
  assertEquals(await verifyStandardWebhookSignature(supabaseSecret, msgId, signedTs, interopBody, libSign(rawKey).replace(/^v1,/, "v2,")), false);
  assertEquals(await verifyStandardWebhookSignature(supabaseSecret, msgId, signedTs, interopBody, "garbage"), false);
});

Deno.test("e2e: handler + verificador real + assinatura da lib => 200", async () => {
  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    headers: { "webhook-id": msgId, "webhook-timestamp": signedTs, "webhook-signature": libSign(rawKey) },
    body: interopBody,
  });
  const res = await handler(req, mockDeps({ hookSecret: supabaseSecret, verifySignature: verifyStandardWebhookSignature }));
  assertEquals(res.status, 200);
});

Deno.test("e2e: timestamp não numérico retorna 401", async () => {
  const req = new Request("http://localhost/auth-email-hook", {
    method: "POST",
    headers: { "webhook-id": msgId, "webhook-timestamp": "abc", "webhook-signature": libSign(rawKey) },
    body: interopBody,
  });
  const res = await handler(req, mockDeps({ hookSecret: supabaseSecret, verifySignature: verifyStandardWebhookSignature }));
  assertEquals(res.status, 401);
});
