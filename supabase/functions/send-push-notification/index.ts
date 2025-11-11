import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

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

    // Prepare payload for FCM
    const fcmPayload = {
      notification: {
        title,
        body: message,
        icon: '/favicon.png',
        badge: '/favicon.png',
      },
      data: data || {},
    };

    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY');
    if (!fcmServerKey) {
      throw new Error('FCM_SERVER_KEY not configured');
    }

    console.log('📤 Sending via FCM to', subscriptions.length, 'devices');

    // Send push notification to all user's devices
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          // Extract FCM token from endpoint
          // Format: https://fcm.googleapis.com/fcm/send/{token}
          const match = sub.endpoint.match(/\/fcm\/send\/(.+)$/);
          
          if (!match) {
            console.error('❌ Not an FCM endpoint:', sub.endpoint.substring(0, 50));
            return false;
          }

          const fcmToken = match[1];
          console.log('📤 Sending to FCM token:', fcmToken.substring(0, 30) + '...');

          // Send to FCM using legacy API (works with FCM_SERVER_KEY)
          const fcmResponse = await fetch(
            'https://fcm.googleapis.com/fcm/send',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `key=${fcmServerKey}`,
              },
              body: JSON.stringify({
                to: fcmToken,
                ...fcmPayload,
              }),
            }
          );

          const responseText = await fcmResponse.text();
          
          if (!fcmResponse.ok) {
            console.error('❌ FCM error:', fcmResponse.status, responseText);
            
            // Delete invalid subscription
            if (fcmResponse.status === 404 || fcmResponse.status === 410 || responseText.includes('NotRegistered')) {
              console.log('🗑️ Deleting invalid subscription:', sub.id);
              await supabaseClient
                .from('push_subscriptions')
                .delete()
                .eq('id', sub.id);
            }
            
            return false;
          }

          const responseData = JSON.parse(responseText);
          if (responseData.failure === 1) {
            console.error('❌ FCM delivery failed:', responseData);
            return false;
          }

          console.log('✅ Push sent successfully via FCM');
          return true;
        } catch (error: any) {
          console.error('❌ Error sending push:', error);
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
