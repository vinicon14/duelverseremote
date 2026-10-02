/**
 * DuelVerse - Send Push Notification (Secure)
 * Desenvolvido por Vinícius
 *
 * Two kinds of callers:
 *
 * 1. INTERNAL (database triggers via pg_net, Authorization: Bearer <service_role key>)
 *    Legacy payload kept as-is: { user_ids?, title, body, data?, exclude_user_id? }.
 *    Used by send_push_via_edge_function, notify_duel_invite, notify_global_chat_message,
 *    notify_new_duel_room and notify_new_news.
 *
 * 2. USERS (browser, Authorization: Bearer <user access_token>)
 *    - JWT is validated with auth.getUser(token) (anon key alone is rejected)
 *    - server-controlled payload: { notification_type, context }
 *    - duel_invite: caller must be the creator of the duel AND have a pending
 *      duel_invites row (sender = caller, receiver = target) for that duel
 *    - atomic DB-backed rate limit (50/hour) that is refunded on server-side failure
 */
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

export const RATE_LIMIT_MAX = 50;
export const RATE_LIMIT_WINDOW = '1 hour';

type NotificationContext = {
  duelId?: string;
  targetUserId?: string;
  locale?: string;
};

type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string; user_id?: string };

export interface Dependencies {
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: SupabaseClient<any, any, any>;
  getUser: (token: string) => Promise<{ user: { id: string } | null; error: unknown }>;
  getEnv: (key: string) => string | undefined;
  /**
   * Fallback for service keys that are not byte-identical to SUPABASE_SERVICE_ROLE_KEY
   * (e.g. a rotated key stored in Vault). Must prove the token is a valid service key.
   */
  isServiceRoleToken?: (token: string) => Promise<boolean>;
  /** Delivers one encrypted web push. Returns the push service HTTP status. */
  sendPush: (sub: PushSubscriptionRow, payload: string) => Promise<number>;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Reads the (unverified) role claim of a JWT. Never trusted on its own. */
function jwtRole(token: string): string | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(b64))?.role ?? null;
  } catch {
    return null;
  }
}

function buildNotificationPayload(
  type: string,
  context: NotificationContext,
  senderUsername: string
): { title: string; body: string; data: Record<string, unknown> } {
  const locale = context.locale === 'en' ? 'en' : 'pt';
  switch (type) {
    case 'duel_invite':
      return {
        title: locale === 'en' ? 'Duel Invitation' : 'Convite de Duelo',
        body: locale === 'en'
          ? `${senderUsername} challenged you to a duel!`
          : `${senderUsername} te desafiou para um duelo!`,
        data: { type: 'duel_invite', duelId: context.duelId, url: '/friends' },
      };
    default:
      throw new HttpError(400, `Unknown notification type: ${type}`);
  }
}

/**
 * duel_invite: the caller must have created the duel and invited targetUserId to it.
 * (The duel's opponent_id is still NULL while the invite is pending, so we cannot
 * compare against live_duels.opponent_id.)
 */
async function validateDuelInvite(
  supabase: Dependencies['supabaseAdmin'],
  senderId: string,
  context: NotificationContext
): Promise<{ targetUserId: string; senderUsername: string }> {
  if (!context.duelId || typeof context.duelId !== 'string') throw new HttpError(400, 'duelId is required for duel_invite');
  if (!context.targetUserId || typeof context.targetUserId !== 'string') throw new HttpError(400, 'targetUserId is required for duel_invite');
  if (context.targetUserId === senderId) throw new HttpError(403, 'Cannot notify yourself');

  const { data: duel, error: duelError } = await supabase
    .from('live_duels')
    .select('creator_id, opponent_id, status')
    .eq('id', context.duelId)
    .maybeSingle();
  if (duelError) throw new HttpError(500, 'Failed to load duel');
  if (!duel) throw new HttpError(404, 'Duel not found');
  if (duel.creator_id !== senderId) throw new HttpError(403, 'Only the duel creator can send this invite');
  if (duel.opponent_id && duel.opponent_id !== context.targetUserId) {
    throw new HttpError(403, 'targetUserId is not the opponent of this duel');
  }

  const { data: invite, error: inviteError } = await supabase
    .from('duel_invites')
    .select('id')
    .eq('duel_id', context.duelId)
    .eq('sender_id', senderId)
    .eq('receiver_id', context.targetUserId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();
  if (inviteError) throw new HttpError(500, 'Failed to load invite');
  if (!invite) throw new HttpError(403, 'No pending invite from you to this user for this duel');

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('user_id', senderId)
    .maybeSingle();

  return { targetUserId: context.targetUserId, senderUsername: profile?.username || 'Someone' };
}

/**
 * Atomically consumes one unit of quota (advisory lock + count + insert inside a
 * SECURITY DEFINER function). Returns the quota row id, null if the limit was hit,
 * or 'unavailable' if the RPC failed (soft failure: allow, nothing to refund).
 */
async function consumeQuota(supabase: Dependencies['supabaseAdmin'], userId: string): Promise<string | null | 'unavailable'> {
  const { data, error } = await supabase.rpc('consume_push_notification_quota', {
    p_user_id: userId,
    p_max: RATE_LIMIT_MAX,
    p_window: RATE_LIMIT_WINDOW,
  });
  if (error) {
    console.error('Rate limit RPC failed (allowing):', error.message ?? error);
    return 'unavailable';
  }
  return (data as string | null) ?? null;
}

async function refundQuota(supabase: Dependencies['supabaseAdmin'], quotaId: string | null | 'unavailable') {
  if (!quotaId || quotaId === 'unavailable') return;
  const { error } = await supabase.from('push_notification_rate_limit').delete().eq('id', quotaId);
  if (error) console.error('Failed to refund rate limit entry:', error.message ?? error);
}

async function deliver(
  deps: Dependencies,
  subscriptions: PushSubscriptionRow[],
  message: { title: string; body: string; data: Record<string, unknown> }
) {
  const payload = JSON.stringify({ ...message, icon: '/favicon.png', badge: '/favicon.png' });
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];
  for (const sub of subscriptions) {
    try {
      const status = await deps.sendPush(sub, payload);
      if (status >= 200 && status < 300) sent++;
      else {
        failed++;
        if (status === 404 || status === 410) expired.push(sub.endpoint);
        else console.error(`Push failed with status ${status} for ${sub.endpoint.substring(0, 50)}...`);
      }
    } catch (err) {
      failed++;
      console.error(`Error sending push to ${sub.endpoint.substring(0, 50)}...:`, err instanceof Error ? err.message : err);
    }
  }
  if (expired.length > 0) {
    await deps.supabaseAdmin.from('push_subscriptions').delete().in('endpoint', expired);
    console.log(`Cleaned up ${expired.length} expired subscriptions`);
  }
  return { sent, failed, total: subscriptions.length };
}

/** Internal (service_role) path: legacy payload used by the DB triggers. */
async function handleInternal(req: Request, deps: Dependencies): Promise<Response> {
  const { user_ids, title, body, data, exclude_user_id } = await req.json();
  let query = deps.supabaseAdmin.from('push_subscriptions').select('*');
  if (Array.isArray(user_ids) && user_ids.length > 0) query = query.in('user_id', user_ids);
  const { data: subs, error } = await query;
  if (error) throw new HttpError(500, 'Error fetching subscriptions');
  const filtered = ((subs ?? []) as PushSubscriptionRow[]).filter((s) => !exclude_user_id || s.user_id !== exclude_user_id);
  if (filtered.length === 0) return json({ success: true, sent: 0, message: 'No subscriptions found' });
  const result = await deliver(deps, filtered, {
    title: title || 'Duelverse',
    body: body || 'Nova notificação',
    data: data || {},
  });
  return json({ success: true, ...result });
}

export async function handler(req: Request, deps: Dependencies): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let quotaId: string | null | 'unavailable' = null;
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!m) return json({ error: 'Authentication required' }, 401);
    const token = m[1].trim();

    const serviceKey = deps.getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (serviceKey && timingSafeEqualStr(token, serviceKey)) {
      return await handleInternal(req, deps);
    }

    const { user, error: authError } = await deps.getUser(token);
    if (authError || !user) {
      if (deps.isServiceRoleToken && jwtRole(token) === 'service_role' && await deps.isServiceRoleToken(token)) {
        return await handleInternal(req, deps);
      }
      return json({ error: 'Invalid or expired token' }, 401);
    }
    const senderId = user.id;

    let body: { notification_type?: unknown; context?: NotificationContext };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const { notification_type, context } = body ?? {};
    if (typeof notification_type !== 'string' || !context || typeof context !== 'object') {
      return json({ error: 'notification_type and context are required' }, 400);
    }

    let targetUserId: string;
    let senderUsername: string;
    switch (notification_type) {
      case 'duel_invite': {
        ({ targetUserId, senderUsername } = await validateDuelInvite(deps.supabaseAdmin, senderId, context));
        break;
      }
      default:
        return json({ error: `Unknown notification type: ${notification_type}` }, 400);
    }

    // Only authorized requests reach the rate limiter (invalid ones never burn quota).
    quotaId = await consumeQuota(deps.supabaseAdmin, senderId);
    if (quotaId === null) return json({ error: 'Rate limit exceeded. Please try again later.' }, 429);

    const VAPID_PUBLIC_KEY = deps.getEnv('VAPID_PUBLIC_KEY');
    const VAPID_PRIVATE_KEY = deps.getEnv('VAPID_PRIVATE_KEY');
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new HttpError(500, 'VAPID keys not configured');

    const { data: subscriptions, error: subsError } = await deps.supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', targetUserId);
    if (subsError) throw new HttpError(500, 'Error fetching subscriptions');

    if (!subscriptions || subscriptions.length === 0) {
      await refundQuota(deps.supabaseAdmin, quotaId);
      return json({ success: true, sent: 0, message: 'No subscriptions found for target user' });
    }

    const result = await deliver(
      deps,
      subscriptions as PushSubscriptionRow[],
      buildNotificationPayload(notification_type, context, senderUsername),
    );
    if (result.sent === 0) await refundQuota(deps.supabaseAdmin, quotaId);
    return json({ success: true, ...result });
  } catch (error) {
    await refundQuota(deps.supabaseAdmin, quotaId);
    if (error instanceof HttpError) {
      if (error.status >= 500) console.error('send-push-notification error:', error.message);
      return json({ error: error.message }, error.status);
    }
    console.error('Error in send-push-notification:', error instanceof Error ? error.message : error);
    return json({ error: 'Internal server error' }, 500);
  }
}

// ---------------------------------------------------------------------------
// Real web push delivery (@negrel/webpush 0.5.0)
// ---------------------------------------------------------------------------
function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function bytesToB64url(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts VAPID keys from the usual web-push format (base64url raw P-256 public key,
 * 65 bytes, and base64url raw private scalar, 32 bytes) into JWKs. JWK JSON strings
 * are accepted as-is.
 */
export function vapidKeysToJwk(publicKey: string, privateKey: string): webpush.ExportedVapidKeys {
  if (publicKey.trim().startsWith('{') && privateKey.trim().startsWith('{')) {
    return { publicKey: JSON.parse(publicKey), privateKey: JSON.parse(privateKey) };
  }
  const pub = b64urlToBytes(publicKey.trim());
  const d = b64urlToBytes(privateKey.trim());
  if (pub.length !== 65 || pub[0] !== 0x04 || d.length !== 32) throw new Error('Invalid VAPID key format');
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  return {
    publicKey: { kty: 'EC', crv: 'P-256', x, y, ext: true },
    privateKey: { kty: 'EC', crv: 'P-256', x, y, d: bytesToB64url(d), ext: true },
  };
}

export function createWebPushSender(getEnv: (k: string) => string | undefined) {
  let appServerPromise: Promise<webpush.ApplicationServer> | null = null;
  const getAppServer = () => {
    if (!appServerPromise) {
      const pub = getEnv('VAPID_PUBLIC_KEY');
      const priv = getEnv('VAPID_PRIVATE_KEY');
      if (!pub || !priv) throw new Error('VAPID keys not configured');
      appServerPromise = webpush.importVapidKeys(vapidKeysToJwk(pub, priv)).then((vapidKeys) =>
        webpush.ApplicationServer.new({ contactInformation: 'mailto:duelverse@duelverse.app', vapidKeys })
      );
      appServerPromise.catch(() => { appServerPromise = null; });
    }
    return appServerPromise;
  };
  return async (sub: PushSubscriptionRow, payload: string): Promise<number> => {
    const appServer = await getAppServer();
    const subscriber = appServer.subscribe({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } });
    try {
      await subscriber.pushTextMessage(payload, {});
      return 201;
    } catch (err) {
      if (err instanceof webpush.PushMessageError) return err.response.status;
      throw err;
    }
  };
}

if (import.meta.main) {
  const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const getEnv = (key: string) => Deno.env.get(key);
  const sendPush = createWebPushSender(getEnv);
  Deno.serve((req: Request) =>
    handler(req, {
      supabaseAdmin,
      getUser: async (token: string) => {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        return { user: data?.user ?? null, error };
      },
      getEnv,
      sendPush,
      // Proves a service_role JWT is genuine by using it against the Auth admin API.
      isServiceRoleToken: async (token: string) => {
        const probe = createClient(Deno.env.get('SUPABASE_URL')!, token, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error } = await probe.auth.admin.listUsers({ page: 1, perPage: 1 });
        return !error;
      },
    })
  );
}
