import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import webpush from 'https://esm.sh/web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse body
    let body;
    try {
      const text = await req.text();
      console.log('📦 Request body:', text);
      body = text ? JSON.parse(text) : {};
    } catch (e) {
      console.error('❌ Error parsing body:', e);
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { userId, title, body: message, data } = body as NotificationRequest;

    if (!userId || !title || !message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: userId, title, body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('📲 Sending push notification to user:', userId);

    // Get user's push subscriptions
    const { data: subscriptions, error: subsError } = await supabaseClient
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId);

    if (subsError) {
      console.error('Error fetching subscriptions:', subsError);
      throw subsError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('No subscriptions found for user:', userId);
      return new Response(
        JSON.stringify({ message: 'No subscriptions found for user' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${subscriptions.length} subscription(s)`);

    // Save notification to history
    await supabaseClient.from('notifications').insert({
      user_id: userId,
      type: data?.type || 'general',
      title,
      message: message,
      data,
    });

    // Configure web-push with VAPID keys
    const vapidPublicKey = 'BKyagl1H5LT1x55xY8YfIbKZFRKN9DT7g8eV-lrDHJxQ3pGwGz5wXFpPe8x-AY3w7XCzkVsG7r-LQxvY_Nv8R0w';
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    
    if (!vapidPrivateKey) {
      throw new Error('VAPID_PRIVATE_KEY not configured');
    }

    webpush.setVapidDetails(
      'mailto:noreply@duelverse.app',
      vapidPublicKey,
      vapidPrivateKey
    );

    // Prepare payload
    const payload = JSON.stringify({
      title,
      body: message,
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: data || {},
    });

    // Send push notification to all user's devices
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          console.log('📤 Sending to endpoint:', sub.endpoint.substring(0, 50) + '...');

          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth,
            },
          };

          await webpush.sendNotification(pushSubscription, payload);

          console.log('✅ Push sent successfully');
          return true;
        } catch (error: any) {
          console.error('❌ Error sending push:', error);
          
          // Delete invalid subscription
          if (error.statusCode === 404 || error.statusCode === 410 || error.statusCode === 401) {
            console.log('🗑️ Deleting invalid subscription:', sub.id);
            await supabaseClient
              .from('push_subscriptions')
              .delete()
              .eq('id', sub.id);
          }
          
          return false;
        }
      })
    );

    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value).length;

    console.log(`📊 Results: ${successCount}/${subscriptions.length} sent successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        total: subscriptions.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error in send-push-notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
