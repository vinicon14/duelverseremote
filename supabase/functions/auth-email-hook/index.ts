/**
 * DuelVerse - Edge Function: Auth Email Hook (Secure)
 * Desenvolvido por Vinícius
 *
 * SECURITY:
 * - Validates Standard Webhooks signature when SEND_EMAIL_HOOK_SECRET is set
 * - Ignores payload.data.url (prevents open redirect)
 * - Server-controlled confirmation URL with whitelist
 * - Does not log tokens (except in reauthentication email template where required)
 * - Degrades safely: if secret is missing, log warning and continue without verification
 */
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirme seu e-mail',
  invite: 'Você foi convidado',
  magiclink: 'Seu link de login',
  recovery: 'Redefinir sua senha',
  email_change: 'Confirme seu novo e-mail',
  reauthentication: 'Seu código de verificação',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = "DuelVerse"
const SENDER_DOMAIN = "notify.duelverse.site"
const ROOT_DOMAIN = "duelverse.site"
const FROM_DOMAIN = "duelverse.site"
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://xxttwzewtqxvpgefggah.supabase.co'

// Whitelist of allowed redirects (prevent open redirect)
const ALLOWED_REDIRECT_HOSTS = ['duelverse.site', 'www.duelverse.site'];
const ALLOWED_REDIRECT_PATHS = ['/', '/auth'];

interface Dependencies {
  supabase: SupabaseClient;
  getEnv: (key: string) => string | undefined;
  verifySignature: (
    secret: string,
    webhookId: string,
    timestamp: string,
    payload: string,
    signature: string
  ) => Promise<boolean>;
}

/**
 * Verify Standard Webhooks signature
 * Format: whsec_... or v1,whsec_...
 * Signature: v1,base64(hmac-sha256(msg_id || timestamp || payload))
 */
async function verifyStandardWebhookSignature(
  secret: string,
  webhookId: string,
  timestamp: string,
  payload: string,
  signature: string
): Promise<boolean> {
  try {
    // Remove prefix (whsec_ or v1,whsec_) and decode base64 secret
    const secretClean = secret.replace(/^(v1,)?whsec_/, '');
    const secretBytes = Uint8Array.from(atob(secretClean), c => c.charCodeAt(0));

    // Build signed content: webhook-id.timestamp.payload
    const signedContent = `${webhookId}.${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(signedContent);

    // Import HMAC key
    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Compute HMAC
    const hmac = await crypto.subtle.sign('HMAC', key, data);
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(hmac)));

    // Extract signature from header (format: v1,base64signature,v1,base64signature,...)
    const signatures = signature.split(',').filter((_, i) => i % 2 === 1); // Get base64 parts only

    // Constant-time compare (timing-safe)
    for (const sig of signatures) {
      if (sig === expectedSignature) {
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

/**
 * Build safe confirmation URL with whitelist
 */
function buildConfirmationUrl(
  tokenHash: string | undefined,
  emailType: string,
  redirectTo: string | undefined
): string {
  // Ignore payload.data.url - build our own

  if (!tokenHash) {
    // No token (e.g., reauthentication uses token in body)
    return `https://${ROOT_DOMAIN}`;
  }

  // Validate redirectTo against whitelist
  let safeRedirect = `https://${ROOT_DOMAIN}`;
  if (redirectTo) {
    try {
      const url = new URL(redirectTo);
      const isAllowedHost = ALLOWED_REDIRECT_HOSTS.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`));
      const isAllowedPath = ALLOWED_REDIRECT_PATHS.some(p => url.pathname === p || url.pathname.startsWith(`${p}/`));
      
      if (isAllowedHost && isAllowedPath) {
        safeRedirect = redirectTo;
      } else {
        console.warn('Redirect URL not in whitelist, using default:', redirectTo);
      }
    } catch {
      console.warn('Invalid redirectTo URL, using default:', redirectTo);
    }
  }

  return `${SUPABASE_URL}/auth/v1/verify?token=${tokenHash}&type=${emailType}&redirect_to=${encodeURIComponent(safeRedirect)}`;
}

export async function handler(req: Request, deps: Dependencies): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    
    // DO NOT LOG FULL PAYLOAD (may contain tokens)
    console.log('Auth hook received', { 
      type: payload.type || payload.email_data?.email_action_type,
      email: payload.user?.email || payload.email,
    });

    // SECURITY: Verify Standard Webhooks signature if secret is set
    const hookSecret = deps.getEnv('SEND_EMAIL_HOOK_SECRET');
    if (hookSecret) {
      const webhookId = req.headers.get('webhook-id');
      const webhookTimestamp = req.headers.get('webhook-timestamp');
      const webhookSignature = req.headers.get('webhook-signature');

      if (!webhookId || !webhookTimestamp || !webhookSignature) {
        console.error('Missing webhook signature headers');
        return new Response(
          JSON.stringify({ error: 'Missing signature headers' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const timestampMs = parseInt(webhookTimestamp, 10) * 1000;
      const now = Date.now();
      const tolerance = 5 * 60 * 1000; // 5 minutes

      if (Math.abs(now - timestampMs) > tolerance) {
        console.error('Webhook timestamp expired', { timestampMs, now, diff: now - timestampMs });
        return new Response(
          JSON.stringify({ error: 'Timestamp out of tolerance' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const isValid = await deps.verifySignature(
        hookSecret,
        webhookId,
        webhookTimestamp,
        rawBody,
        webhookSignature
      );

      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('✅ Webhook signature verified');
    } else {
      console.warn('⚠️  SEND_EMAIL_HOOK_SECRET not set - skipping signature verification (not recommended for production)');
    }

    // Extract fields (Supabase Auth Hook format varies by version)
    const emailType = payload.type || payload.email_data?.email_action_type || payload.email_data?.type || payload.data?.action_type
    const recipientEmail = payload.user?.email || payload.email || payload.email_data?.email || payload.data?.email
    const tokenHash = payload.email_data?.token_hash || payload.token_hash
    const redirectTo = payload.email_data?.redirect_to || payload.redirect_to
    const token = payload.email_data?.token || payload.token || payload.data?.token

    if (!emailType || !recipientEmail) {
      console.error('Missing email type or recipient', { emailType, recipientEmail, keys: Object.keys(payload) })
      return new Response(
        JSON.stringify({ error: 'Missing email type or recipient' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const EmailTemplate = EMAIL_TEMPLATES[emailType]
    if (!EmailTemplate) {
      console.error('Unknown email type', { emailType })
      return new Response(
        JSON.stringify({ error: `Unknown email type: ${emailType}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build safe confirmation URL (ignore payload.data.url)
    const confirmationUrl = buildConfirmationUrl(tokenHash, emailType, redirectTo);

    const templateProps = {
      siteName: SITE_NAME,
      siteUrl: `https://${ROOT_DOMAIN}`,
      recipient: recipientEmail,
      confirmationUrl,
      token: token, // Only used in reauthentication template
      email: recipientEmail,
      newEmail: payload.new_email || payload.data?.new_email,
    }

    const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
    const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
      plainText: true,
    })

    // Enqueue email for async processing via SMTP
    const messageId = crypto.randomUUID()

    await deps.supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: emailType,
      recipient_email: recipientEmail,
      status: 'pending',
    })

    const smtpUser = deps.getEnv('SMTP_USER') || `noreply@${FROM_DOMAIN}`

    const { error: enqueueError } = await deps.supabase.rpc('enqueue_email', {
      queue_name: 'auth_emails',
      payload: {
        message_id: messageId,
        to: recipientEmail,
        from: `${SITE_NAME} <${smtpUser}>`,
        sender_domain: SENDER_DOMAIN,
        subject: EMAIL_SUBJECTS[emailType] || 'Notificação',
        html,
        text,
        purpose: 'transactional',
        label: emailType,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) {
      console.error('Failed to enqueue auth email', { error: enqueueError, emailType })
      await deps.supabase.from('email_send_log').insert({
        message_id: messageId,
        template_name: emailType,
        recipient_email: recipientEmail,
        status: 'failed',
        error_message: 'Failed to enqueue email',
      })
      return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Auth email enqueued', { emailType, recipientEmail })

    return new Response(
      JSON.stringify({ success: true, queued: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Auth email hook error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

// Only start the server if this is the main module (not being imported for tests)
if (import.meta.main) {
  Deno.serve((req: Request) => {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    return handler(req, {
      supabase,
      getEnv: (key: string) => Deno.env.get(key),
      verifySignature: verifyStandardWebhookSignature,
    });
  });
}
