import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleError, securityHeaders } from '../_utils/security.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders, ...securityHeaders } })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: roles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (rolesError || !roles) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Admin only' }),
        { status: 403, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (authError) {
      throw authError
    }

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id')

    if (profilesError) {
      throw profilesError
    }

    const profileUserIds = new Set(profiles.map(p => p.user_id))
    const orphanedUsers = authUsers.users.filter(u => !profileUserIds.has(u.id))

    const deletedUsers = []
    const errors = []

    for (const orphan of orphanedUsers) {
      try {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(orphan.id)
        
        if (deleteError) {
          errors.push({ email: orphan.email })
        } else {
          deletedUsers.push({ email: orphan.email, id: orphan.id })
        }
      } catch (err) {
        errors.push({ email: orphan.email })
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Limpeza concluída. ${deletedUsers.length} usuários órfãos removidos.`,
        deletedCount: deletedUsers.length,
        errorsCount: errors.length
      }),
      { headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return handleError(error, 'cleanup-orphaned-users')
  }
})
