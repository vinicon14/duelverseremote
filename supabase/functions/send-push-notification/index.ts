import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Build query for subscriptions
    let query = supabaseAdmin.from('push_subscriptions').select('*');
    
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
      ? subscriptions.filter((s: any) => s.user_id !== exclude_user_id)
      : subscriptions;

    const payload = JSON.stringify({
      title: title || 'Duelverse',
      body: body || 'Nova notificação',
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: data || {},
    });

    // Create VAPID application server
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: "mailto:duelverse@duelverse.app",
      vapidKeys: {
        publicKey: VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY,
      },
    });

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of filteredSubs) {
      try {
        // Create a PushSubscription object
        const pushSub = webpush.PushSubscription.fromJSON({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        });

        // Build the encrypted push message
        const pushMsg = await appServer.buildPushMessage(pushSub, payload);
        
        // Send the push message
        const response = await fetch(pushMsg.endpoint, {
          method: "POST",
          headers: pushMsg.headers,
          body: pushMsg.body,
        });

        if (response.status === 201 || response.status === 200) {
          sent++;
          console.log(`✅ Push sent to ${sub.endpoint.substring(0, 50)}...`);
        } else if (response.status === 410 || response.status === 404) {
          expiredEndpoints.push(sub.endpoint);
          failed++;
        } else {
          const respText = await response.text();
          console.error(`Push failed: ${response.status} ${respText}`);
          failed++;
        }
      } catch (err) {
        console.error(`Error sending push to ${sub.endpoint}:`, err);
        failed++;
      }
    }

    // Clean up expired subscriptions
    if (expiredEndpoints.length > 0) {
      await supabaseAdmin
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
