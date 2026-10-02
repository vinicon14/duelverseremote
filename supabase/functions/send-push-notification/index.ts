/**
 * DuelVerse - Send Push Notification (Secure)
 * Desenvolvido por Vinícius
 * 
 * SECURITY:
 * - Requires user JWT (anon key alone is rejected)
 * - Server-controlled notification types and content
 * - Validates duel participants before sending duel_invite
 * - Rate limit: ~50 notifications per user per hour
 */
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const RATE_LIMIT_WINDOW_HOURS = 1;
const RATE_LIMIT_MAX = 50;

type NotificationContext = {
  duelId?: string;
  targetUserId?: string;
  locale?: string;
};

type NotificationRequest = {
  notification_type: string;
  context: NotificationContext;
};

interface Dependencies {
  supabaseAdmin: SupabaseClient;
  getUser: (authHeader: string) => Promise<{ user: { id: string } | null; error: unknown }>;
  getEnv: (key: string) => string | undefined;
  buildAppServer: (publicKey: string, privateKey: string) => Promise<webpush.ApplicationServer>;
  fetchPush: (endpoint: string, headers: Record<string, string>, body: ArrayBuffer) => Promise<Response>;
}

/**
 * Build notification title and body from server-controlled templates
 */
function buildNotificationPayload(
  type: string,
  context: NotificationContext,
  senderUsername: string
): { title: string; body: string; data: Record<string, unknown> } {
  const locale = context.locale || 'pt';

  switch (type) {
    case 'duel_invite':
      return {
        title: locale === 'en' ? 'Duel Invitation' : 'Convite de Duelo',
        body: locale === 'en' 
          ? `${senderUsername} challenged you to a duel!`
          : `${senderUsername} te desafiou para um duelo!`,
        data: {
          type: 'duel_invite',
          duelId: context.duelId,
          url: '/friends',
        },
      };
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

/**
 * Validate duel participants and get target user
 */
async function validateDuelInvite(
  supabase: SupabaseClient,
  senderId: string,
  context: NotificationContext
): Promise<{ targetUserId: string; senderUsername: string }> {
  if (!context.duelId) {
    throw new Error('duelId is required for duel_invite');
  }
  if (!context.targetUserId) {
    throw new Error('targetUserId is required for duel_invite');
  }

  // Fetch duel and validate participants
  const { data: duel, error: duelError } = await supabase
    .from('live_duels')
    .select('creator_id, opponent_id')
    .eq('id', context.duelId)
    .single();

  if (duelError || !duel) {
    throw new Error('Duel not found');
  }

  const isCreator = duel.creator_id === senderId;
  const otherParticipant = isCreator ? duel.opponent_id : duel.creator_id;

  // Sender must be a participant
  if (!isCreator && duel.opponent_id !== senderId) {
    throw new Error('User is not a participant in this duel');
  }

  // Target must be the OTHER participant (not self, not arbitrary UUID)
  if (context.targetUserId !== otherParticipant) {
    throw new Error('targetUserId must be the other duel participant');
  }

  // Fetch sender username
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('user_id', senderId)
    .single();

  return {
    targetUserId: context.targetUserId,
    senderUsername: profile?.username || 'Someone',
  };
}

/**
 * Check rate limit (database-backed, soft failure)
 */
async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('push_notification_rate_limit')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', windowStart);

    if (error) {
      console.error('Rate limit check failed:', error);
      // Soft failure: allow the push to proceed
      return true;
    }

    return (count || 0) < RATE_LIMIT_MAX;
  } catch (err) {
    console.error('Rate limit check exception:', err);
    // Soft failure: allow the push to proceed
    return true;
  }
}

/**
 * Record rate limit entry (after successful authorization)
 */
async function recordRateLimit(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    await supabase
      .from('push_notification_rate_limit')
      .insert({ user_id: userId });
  } catch (err) {
    console.error('Failed to record rate limit entry:', err);
    // Non-fatal
  }
}

export async function handler(req: Request, deps: Dependencies): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require user JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.match(/^Bearer\s+/i)) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { user, error: authError } = await deps.getUser(authHeader);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const senderId = user.id;

    // Parse request
    const body = await req.json() as NotificationRequest;
    const { notification_type, context } = body;

    if (!notification_type || !context) {
      return new Response(
        JSON.stringify({ error: 'notification_type and context are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit check
    const withinLimit = await checkRateLimit(deps.supabaseAdmin, senderId);
    if (!withinLimit) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate based on notification type
    let targetUserId: string;
    let senderUsername: string;

    switch (notification_type) {
      case 'duel_invite': {
        const validated = await validateDuelInvite(deps.supabaseAdmin, senderId, context);
        targetUserId = validated.targetUserId;
        senderUsername = validated.senderUsername;
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown notification type: ${notification_type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Record rate limit entry AFTER successful authorization
    await recordRateLimit(deps.supabaseAdmin, senderId);

    // Fetch push subscriptions for target user
    const { data: subscriptions, error: subsError } = await deps.supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', targetUserId);

    if (subsError) {
      console.error('Error fetching subscriptions:', subsError);
      throw subsError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No subscriptions found for target user' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build notification payload (server-controlled)
    const { title, body: notificationBody, data } = buildNotificationPayload(
      notification_type,
      context,
      senderUsername
    );

    const payload = JSON.stringify({
      title,
      body: notificationBody,
      icon: '/favicon.png',
      badge: '/favicon.png',
      data,
    });

    // Get VAPID keys
    const VAPID_PUBLIC_KEY = deps.getEnv('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = deps.getEnv('VAPID_PRIVATE_KEY');

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error('VAPID keys not configured');
    }

    // Create VAPID application server
    const appServer = await deps.buildAppServer(VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    let sent = 0;
    let failed = 0;
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        const pushSub = webpush.PushSubscription.fromJSON({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        });

        const pushMsg = await appServer.buildPushMessage(pushSub, payload);

        const response = await deps.fetchPush(pushMsg.endpoint, pushMsg.headers, pushMsg.body);

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
      await deps.supabaseAdmin
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
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

// Only start the server if this is the main module (not being imported for tests)
if (import.meta.main) {
  Deno.serve((req: Request) => {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    return handler(req, {
      supabaseAdmin,
      getUser: async (authHeader: string) => {
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        return { user, error };
      },
      getEnv: (key: string) => Deno.env.get(key),
      buildAppServer: async (publicKey: string, privateKey: string) => {
        return await webpush.ApplicationServer.new({
          contactInformation: "mailto:duelverse@duelverse.app",
          vapidKeys: { publicKey, privateKey },
        });
      },
      fetchPush: (endpoint: string, headers: Record<string, string>, body: ArrayBuffer) => {
        return fetch(endpoint, {
          method: 'POST',
          headers,
          body,
        });
      },
    });
  });
}
