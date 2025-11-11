import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import * as webpush from 'https://esm.sh/web-push@3.6.7?target=deno';

const VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';

console.log('🔑 Verificando chave VAPID...');
console.log('Private key length:', VAPID_PRIVATE_KEY.length);

if (!VAPID_PRIVATE_KEY || VAPID_PRIVATE_KEY.length < 20) {
  console.error('❌ VAPID_PRIVATE_KEY não configurada corretamente!');
}

// Configure VAPID details
try {
  webpush.setVapidDetails(
    'mailto:admin@duelverse.app',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('✅ VAPID configurado com sucesso');
} catch (error) {
  console.error('❌ Erro ao configurar VAPID:', error);
  throw error;
}

interface NotificationRequest {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, any>;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      } 
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

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
        { status: 200, headers: { 'Content-Type': 'application/json' } }
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

    // Prepare payload
    const payload = JSON.stringify({
      title,
      body: message,
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: data || {},
    });

    // Send push notification to all user's devices
    const promises = subscriptions.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys as { p256dh: string; auth: string },
        };

        console.log('Sending to endpoint:', sub.endpoint.substring(0, 50) + '...');

        await webpush.sendNotification(pushSubscription, payload);
        
        console.log('✅ Push sent successfully');
        return true;
      } catch (error) {
        console.error('❌ Error sending push to device:', error);
        
        // If subscription is invalid (410 Gone or 404 Not Found), delete it
        if (error instanceof Error && (error.message.includes('410') || error.message.includes('404'))) {
          console.log('Deleting invalid subscription:', sub.id);
          await supabaseClient
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }
        
        return false;
      }
    });

    const results = await Promise.all(promises);
    const successCount = results.filter(r => r).length;

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
