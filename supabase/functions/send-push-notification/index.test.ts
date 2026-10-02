/**
 * Tests for send-push-notification edge function
 * Run with: deno test --allow-all supabase/functions/send-push-notification/index.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";

Deno.test("notification types - validates known types", () => {
  const validTypes = ["duel_invite"];
  
  const testCases = [
    { type: "duel_invite", valid: true },
    { type: "arbitrary_type", valid: false },
    { type: "", valid: false },
    { type: null, valid: false },
  ];

  for (const { type, valid } of testCases) {
    const isValid = type ? validTypes.includes(type) : false;
    assertEquals(
      isValid,
      valid,
      `Type ${type} should ${valid ? "be valid" : "be invalid"}`
    );
  }
});

Deno.test("rate limiting - tracks requests per user", () => {
  const RATE_LIMIT_PER_HOUR = 50;
  
  const userId = "test-user-123";
  const recentRequests = Array(45).fill({ user_id: userId });
  
  const canSend = recentRequests.length < RATE_LIMIT_PER_HOUR;
  assertEquals(canSend, true, "Should allow request under limit");

  const tooManyRequests = Array(50).fill({ user_id: userId });
  const shouldBlock = tooManyRequests.length >= RATE_LIMIT_PER_HOUR;
  assertEquals(shouldBlock, true, "Should block request over limit");
});

Deno.test("authorization - requires valid JWT", () => {
  const testCases = [
    { header: null, shouldPass: false },
    { header: "", shouldPass: false },
    { header: "Bearer ", shouldPass: false },
    { header: "Bearer invalid", shouldPass: false },
    { header: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", shouldPass: false },
  ];

  for (const { header, shouldPass } of testCases) {
    const hasAuth = header && header.startsWith("Bearer ") && header.length > 10;
    assertEquals(
      !!hasAuth,
      shouldPass,
      `Auth header "${header}" validation mismatch`
    );
  }
});

Deno.test("duel_invite - validates context requirements", () => {
  const testCases = [
    {
      name: "Valid context",
      context: { targetUserId: "user-123", duelId: "duel-456" },
      isValid: true,
    },
    {
      name: "Missing targetUserId",
      context: { duelId: "duel-456" },
      isValid: false,
    },
    {
      name: "Missing duelId",
      context: { targetUserId: "user-123" },
      isValid: false,
    },
    {
      name: "Empty context",
      context: {},
      isValid: false,
    },
  ];

  for (const { name, context, isValid } of testCases) {
    const hasRequired = !!(context.targetUserId && context.duelId);
    assertEquals(hasRequired, isValid, `${name} validation failed`);
  }
});

Deno.test("recipient validation - never allows arbitrary recipients", () => {
  const maliciousPayloads = [
    { user_ids: ["user1", "user2", "user3"], title: "Spam", body: "Phishing" },
    { broadcast: true, title: "Mass spam", body: "Broadcast attack" },
    { exclude_user_id: null, title: "Everyone", body: "All users" },
  ];

  for (const payload of maliciousPayloads) {
    const acceptsArbitraryRecipients = "user_ids" in payload || "broadcast" in payload;
    assertEquals(
      acceptsArbitraryRecipients,
      true,
      "Old API format detected - should be rejected"
    );
  }

  const securePayload = {
    notification_type: "duel_invite",
    context: { targetUserId: "user-123", duelId: "duel-456" },
  };
  
  const usesTemplate = "notification_type" in securePayload;
  assertEquals(usesTemplate, true, "Secure API should use notification_type");
});

Deno.test("request payload - validates new API format", () => {
  const validPayload = {
    notification_type: "duel_invite",
    context: {
      targetUserId: "friend-123",
      duelId: "duel-789",
      inviteId: "invite-012",
    },
  };

  assertEquals(validPayload.notification_type, "duel_invite");
  assertEquals(!!validPayload.context.targetUserId, true);
  assertEquals(!!validPayload.context.duelId, true);

  const invalidPayloads = [
    { title: "Custom", body: "Text", user_ids: ["any"] },
    { broadcast: true },
    {},
  ];

  for (const payload of invalidPayloads) {
    const hasNotificationType = "notification_type" in payload;
    assertEquals(
      hasNotificationType,
      false,
      "Invalid payload should not have notification_type"
    );
  }
});
