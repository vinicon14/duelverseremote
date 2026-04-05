/**
 * DuelVerse - Auth Email Hook
 * Intercepts Supabase Auth emails and renders custom branded templates.
 * Sends via SMTP queue (independent of Lovable).
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    
    // Supabase Auth Hook format: { user, email_data }
    // The hook sends: type, email, token_hash, redirect_to, etc.
    const emailType = payload.type || payload.email_data?.email_action_type || payload.email_data?.type || payload.data?.action_type
    const recipientEmail = payload.user?.email || payload.email || payload.email_data?.email || payload.data?.email
    const tokenHash = payload.email_data?.token_hash || payload.token_hash
    const redirectTo = payload.email_data?.redirect_to || payload.redirect_to || `https://${ROOT_DOMAIN}`
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

    // Build confirmation URL
    let confirmationUrl = redirectTo
    if (tokenHash) {
      const baseUrl = `https://${ROOT_DOMAIN}`
      confirmationUrl = `${baseUrl}/auth/confirm?token_hash=${tokenHash}&type=${emailType}`
    }
    if (payload.data?.url) {
      confirmationUrl = payload.data.url
    }

    const templateProps = {
      siteName: SITE_NAME,
      siteUrl: `https://${ROOT_DOMAIN}`,
      recipient: recipientEmail,
      confirmationUrl,
      token: token,
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
