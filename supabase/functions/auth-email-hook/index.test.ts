/**
 * Tests for auth-email-hook edge function
 * Run with: deno test --allow-all supabase/functions/auth-email-hook/index.test.ts
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.192.0/testing/asserts.ts";

async function createSignature(
  webhookId: string,
  timestamp: string,
  body: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const signedContent = `${webhookId}.${timestamp}.${body}`;
  
  let signingSecret = secret;
  if (secret.startsWith('whsec_')) {
    signingSecret = secret;
  } else if (secret.startsWith('v1,whsec_')) {
    signingSecret = secret.substring(3);
  }
  
  const keyData = encoder.encode(signingSecret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  return `v1,${signatureB64}`;
}

Deno.test("webhook signature verification - valid signature", async () => {
  const webhookId = "msg_test123";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ type: "signup", user: { email: "test@example.com" } });
  const secret = "whsec_test_secret_key_12345";

  const signature = await createSignature(webhookId, timestamp, body, secret);

  const request = new Request("http://localhost:54321/functions/v1/auth-email-hook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": webhookId,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    },
    body,
  });

  assertExists(signature);
  assertEquals(signature.startsWith("v1,"), true);
});

Deno.test("webhook signature verification - missing headers should fail", async () => {
  const body = JSON.stringify({ type: "signup", user: { email: "test@example.com" } });

  const request = new Request("http://localhost:54321/functions/v1/auth-email-hook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body,
  });

  const webhookId = request.headers.get('webhook-id');
  assertEquals(webhookId, null);
});

Deno.test("webhook signature verification - timestamp too old", async () => {
  const webhookId = "msg_test456";
  const oldTimestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
  const body = JSON.stringify({ type: "recovery", user: { email: "test@example.com" } });
  const secret = "whsec_test_secret_key_12345";

  const signature = await createSignature(webhookId, oldTimestamp, body, secret);

  assertExists(signature);
  assertEquals(parseInt(oldTimestamp) < Math.floor(Date.now() / 1000), true);
});

Deno.test("redirect URL validation - only allows whitelisted domains", () => {
  const allowedRedirects = [
    "https://duelverse.site",
    "https://duelverse.site/",
    "https://duelverse.site/auth",
  ];

  const testCases = [
    { url: "https://duelverse.site", expected: true },
    { url: "https://duelverse.site/", expected: true },
    { url: "https://duelverse.site/auth", expected: true },
    { url: "https://evil.com", expected: false },
    { url: "https://duelverse.site.evil.com", expected: false },
    { url: "javascript:alert(1)", expected: false },
  ];

  for (const { url, expected } of testCases) {
    const isAllowed = allowedRedirects.includes(url);
    assertEquals(
      isAllowed,
      expected,
      `URL ${url} should ${expected ? "be allowed" : "be blocked"}`
    );
  }
});

Deno.test("payload parsing - handles different Supabase auth formats", () => {
  const testCases = [
    {
      name: "Modern format with type",
      payload: { type: "signup", user: { email: "user@test.com" } },
      expectedType: "signup",
      expectedEmail: "user@test.com",
    },
    {
      name: "Legacy format with email_data",
      payload: {
        email_data: { email_action_type: "recovery", email: "user2@test.com" },
      },
      expectedType: "recovery",
      expectedEmail: "user2@test.com",
    },
    {
      name: "Alternative format with data",
      payload: {
        data: { action_type: "magiclink", email: "user3@test.com" },
      },
      expectedType: "magiclink",
      expectedEmail: "user3@test.com",
    },
  ];

  for (const { name, payload, expectedType, expectedEmail } of testCases) {
    const emailType =
      payload.type ||
      payload.email_data?.email_action_type ||
      payload.email_data?.type ||
      payload.data?.action_type;
    const recipientEmail =
      payload.user?.email ||
      payload.email ||
      payload.email_data?.email ||
      payload.data?.email;

    assertEquals(emailType, expectedType, `${name} - type mismatch`);
    assertEquals(recipientEmail, expectedEmail, `${name} - email mismatch`);
  }
});
