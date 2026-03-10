import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Web Push VAPID implementation
function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - base64Url.length % 4) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function importVapidKey(base64Key: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  const keyData = base64UrlToUint8Array(base64Key);
  
  if (usage === "sign") {
    return await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } else {
    return await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  }
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function createJWT(vapidPrivateKey: string, vapidPublicKey: string, audience: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: "mailto:duelverse@duelverse.app",
  };

  const headerB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // Import the private key - it's a raw 32-byte key
  const keyData = base64UrlToUint8Array(vapidPrivateKey);
  
  // Build PKCS8 wrapper for the raw 32-byte private key
  const pkcs8Header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48,
    0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20
  ]);
  const pkcs8Key = new Uint8Array(pkcs8Header.length + keyData.length);
  pkcs8Key.set(pkcs8Header);
  pkcs8Key.set(keyData, pkcs8Header.length);

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8Key,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw r||s format
  const sigArray = new Uint8Array(signature);
  let r: Uint8Array, s: Uint8Array;
  
  if (sigArray[0] === 0x30) {
    // DER format
    let offset = 2;
    const rLen = sigArray[offset + 1];
    r = sigArray.slice(offset + 2, offset + 2 + rLen);
    offset = offset + 2 + rLen;
    const sLen = sigArray[offset + 1];
    s = sigArray.slice(offset + 2, offset + 2 + sLen);
    
    // Remove leading zeros
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    
    // Pad to 32 bytes
    const rPadded = new Uint8Array(32);
    const sPadded = new Uint8Array(32);
    rPadded.set(r, 32 - r.length);
    sPadded.set(s, 32 - s.length);
    
    const rawSig = new Uint8Array(64);
    rawSig.set(rPadded);
    rawSig.set(sPadded, 32);
    
    return `${unsignedToken}.${uint8ArrayToBase64Url(rawSig)}`;
  } else {
    // Already raw format
    return `${unsignedToken}.${uint8ArrayToBase64Url(sigArray)}`;
  }
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string
): Promise<Response> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  
  const jwt = await createJWT(vapidPrivateKey, vapidPublicKey, audience);
  
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "identity",
      "TTL": "86400",
      "Authorization": `vapid t=${jwt}, k=${vapidPublicKey}`,
      "Urgency": "high",
    },
    body: payload,
  });
  
  return response;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error('VAPID keys not configured');
    }

    const { user_ids, title, body, data, exclude_user_id } = await req.json();

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Build query for subscriptions
    let query = supabase.from('push_subscriptions').select('*');
    
    if (user_ids && user_ids.length > 0) {
      query = query.in('user_id', user_ids);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      console.error('Error fetching subscriptions:', error);
      throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter out excluded user
    const filteredSubs = exclude_user_id 
      ? subscriptions.filter(s => s.user_id !== exclude_user_id)
      : subscriptions;

    const payload = JSON.stringify({
      title: title || 'Duelverse',
      body: body || 'Nova notificação',
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: data || {},
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    // Send to all subscriptions
    for (const sub of filteredSubs) {
      try {
        const response = await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
          VAPID_PUBLIC_KEY,
          VAPID_PRIVATE_KEY
        );

        if (response.status === 201 || response.status === 200) {
          sent++;
        } else if (response.status === 410 || response.status === 404) {
          // Subscription expired, mark for deletion
          expiredEndpoints.push(sub.endpoint);
          failed++;
        } else {
          console.error(`Push failed for ${sub.endpoint}: ${response.status} ${await response.text()}`);
          failed++;
        }
      } catch (err) {
        console.error(`Error sending push to ${sub.endpoint}:`, err);
        failed++;
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints);
      console.log(`Cleaned up ${expiredEndpoints.length} expired subscriptions`);
    }

    return new Response(
      JSON.stringify({ success: true, sent, failed, total: filteredSubs.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
