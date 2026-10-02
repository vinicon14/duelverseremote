import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RATE_LIMIT_PER_HOUR = 50;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

interface NotificationTemplate {
  title: string;
  body: string;
  getRecipients: (userId: string, context: any, supabase: any) => Promise<string[]>;
}

const NOTIFICATION_TYPES: Record<string, NotificationTemplate> = {
  duel_invite: {
    title: '⚔️ Desafio de Duelo!',
    body: 'Você foi desafiado para um duelo!',
    getRecipients: async (userId: string, context: any, supabase: any) => {
      if (!context.targetUserId || !context.duelId) {
        throw new Error('Missing targetUserId or duelId for duel_invite');
      }
      
      const { data: duel } = await supabase
        .from('duels')
        .select('creator_id, opponent_id')
        .eq('id', context.duelId)
        .single();
      
      if (!duel || (duel.creator_id !== userId && duel.opponent_id !== userId)) {
        throw new Error('User not authorized for this duel');
      }
      
      return [context.targetUserId];
    }
  }
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const supabaseUser = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { notification_type, context } = await req.json();

    if (!notification_type || !NOTIFICATION_TYPES[notification_type]) {
      return new Response(
        JSON.stringify({ error: 'Invalid notification type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cutoffTime = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { data: recentRequests, error: rateLimitError } = await supabaseAdmin
      .from('push_notification_rate_limit')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', cutoffTime);

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
    } else if (recentRequests && recentRequests.length >= RATE_LIMIT_PER_HOUR) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await supabaseAdmin.from('push_notification_rate_limit').insert({
      user_id: user.id,
      notification_type,
    });

    const template = NOTIFICATION_TYPES[notification_type];
    const recipientIds = await template.getRecipients(user.id, context, supabaseAdmin);

    const { data: subscriptions, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .in('user_id', recipientIds);

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

    const payload = JSON.stringify({
      title: template.title,
      body: template.body,
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: { type: notification_type, ...context },
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

    for (const sub of subscriptions) {
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
      JSON.stringify({ success: true, sent, failed, total: subscriptions.length }),
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
