/**
 * DuelVerse - Edge Function: Auth Email Hook
 * Desenvolvido por Vinícius
 *
 * Intercepta os e-mails de autenticação e renderiza templates próprios
 * com a identidade visual do DuelVerse. A entrega é feita pela fila SMTP
 * interna do projeto, sem provedores transacionais externos.
 * 
 * Security: Validates webhook signatures, builds safe redirect URLs server-side
 */
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, webhook-id, webhook-timestamp, webhook-signature',
}

async function verifyWebhookSignature(
  req: Request,
  body: string,
  secret: string
): Promise<boolean> {
  const webhookId = req.headers.get('webhook-id')
  const webhookTimestamp = req.headers.get('webhook-timestamp')
  const webhookSignature = req.headers.get('webhook-signature')

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    console.error('Missing webhook headers')
    return false
  }

  const timestampMs = parseInt(webhookTimestamp) * 1000
  const now = Date.now()
  const tolerance = 5 * 60 * 1000

  if (Math.abs(now - timestampMs) > tolerance) {
    console.error('Webhook timestamp too old or in future')
    return false
  }

  let signingSecret = secret
  if (secret.startsWith('whsec_')) {
    signingSecret = secret
  } else if (secret.startsWith('v1,whsec_')) {
    signingSecret = secret.substring(3)
  }

  const encoder = new TextEncoder()
  const signedContent = `${webhookId}.${webhookTimestamp}.${body}`
  
  const keyData = encoder.encode(signingSecret)
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent))
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))

  const signatures = webhookSignature.split(' ')
  for (const sig of signatures) {
    const [version, hash] = sig.split(',')
    if (version === 'v1' && hash === expectedSignature) {
      return true
    }
  }

  console.error('Signature verification failed')
  return false
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const bodyText = await req.text()
    
    const webhookSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
    if (webhookSecret) {
      const isValid = await verifyWebhookSignature(req, bodyText, webhookSecret)
      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Invalid webhook signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      console.warn('SEND_EMAIL_HOOK_SECRET not configured - webhook signature not verified')
    }

    const payload = JSON.parse(bodyText)
    
    const emailType = payload.type || payload.email_data?.email_action_type || payload.email_data?.type || payload.data?.action_type
    const recipientEmail = payload.user?.email || payload.email || payload.email_data?.email || payload.data?.email
    const tokenHash = payload.email_data?.token_hash || payload.token_hash
    const token = payload.email_data?.token || payload.token || payload.data?.token

    if (!emailType || !recipientEmail) {
      console.error('Missing email type or recipient', { emailType, recipientEmail })
      return new Response(
        JSON.stringify({ error: 'Missing email type or recipient' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Auth email hook received', { emailType, recipientEmail })

    const EmailTemplate = EMAIL_TEMPLATES[emailType]
    if (!EmailTemplate) {
      console.error('Unknown email type', { emailType })
      return new Response(
        JSON.stringify({ error: `Unknown email type: ${emailType}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const allowedRedirects = [
      `https://${ROOT_DOMAIN}`,
      `https://${ROOT_DOMAIN}/`,
      `https://${ROOT_DOMAIN}/auth`,
    ]
    
    const requestedRedirect = payload.email_data?.redirect_to || payload.redirect_to
    const safeRedirect = allowedRedirects.includes(requestedRedirect) 
      ? requestedRedirect 
      : `https://${ROOT_DOMAIN}`

    let confirmationUrl = safeRedirect
    if (tokenHash) {
      confirmationUrl = `${SUPABASE_URL}/auth/v1/verify?token=${tokenHash}&type=${emailType}&redirect_to=${encodeURIComponent(safeRedirect)}`
    }

    const templateProps = {
      siteName: SITE_NAME,
      siteUrl: `https://${ROOT_DOMAIN}`,
      recipient: recipientEmail,
      confirmationUrl,
      token: emailType === 'reauthentication' ? token : undefined,
      email: recipientEmail,
      newEmail: payload.new_email || payload.data?.new_email,
    }

    const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
    const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
      plainText: true,
    })

    // Enqueue email for async processing via SMTP
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const messageId = crypto.randomUUID()

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: emailType,
      recipient_email: recipientEmail,
      status: 'pending',
    })

    const smtpUser = Deno.env.get('SMTP_USER') || `noreply@${FROM_DOMAIN}`

    const { error: enqueueError } = await supabase.rpc('enqueue_email', {
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
      await supabase.from('email_send_log').insert({
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
})
