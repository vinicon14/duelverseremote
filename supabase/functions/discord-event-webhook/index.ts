// Discord Event Webhooks receiver.
// Validates Ed25519 signature and responds to PING (type 0) with type 1.
// Docs: https://discord.com/developers/docs/events/webhook-events
import nacl from "npm:tweetnacl@1.0.3";

const DISCORD_PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY") ?? "";

const hexToBytes = (hex: string) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const body = await req.text();

  if (!signature || !timestamp || !DISCORD_PUBLIC_KEY) {
    return new Response("invalid request signature", { status: 401 });
  }

  const isValid = nacl.sign.detached.verify(
    new TextEncoder().encode(timestamp + body),
    hexToBytes(signature),
    hexToBytes(DISCORD_PUBLIC_KEY),
  );

  if (!isValid) {
    return new Response("invalid request signature", { status: 401 });
  }

  const payload = JSON.parse(body);

  // Discord PING for endpoint verification: type 0
  if (payload.type === 0) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Event webhook payload: type 1 (event)
  if (payload.type === 1) {
    console.log("[discord-event-webhook] event received", JSON.stringify(payload.event));
    // TODO: route payload.event.type to app logic
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
});
