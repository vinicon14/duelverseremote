/**
 * DuelVerse - Edge Function: Limpar Usuários Órfãos
 * Desenvolvido por Vinícius
 * 
 * Remove usuários órfãos que não têm perfil associado.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🧹 Starting orphaned users cleanup...')
    
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Find orphaned users (auth.users without profiles)
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (authError) {
      console.error('Error fetching auth users:', authError)
      throw authError
    }

    console.log(`📋 Total auth users: ${authUsers.users.length}`)

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('profiles')
      .select('user_id')

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
      throw profilesError
    }

    const profileUserIds = new Set(profiles.map(p => p.user_id))
    const orphanedUsers = authUsers.users.filter(u => !profileUserIds.has(u.id))

    console.log(`🗑️ Found ${orphanedUsers.length} orphaned users`)

    const deletedUsers = []
    const errors = []

    for (const orphan of orphanedUsers) {
      try {
        console.log(`Deleting orphaned user: ${orphan.email} (${orphan.id})`)
        
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(orphan.id)
        
        if (deleteError) {
          console.error(`Failed to delete ${orphan.email}:`, deleteError)
          errors.push({ email: orphan.email, error: deleteError.message })
        } else {
          console.log(`✅ Deleted: ${orphan.email}`)
          deletedUsers.push({ email: orphan.email, id: orphan.id })
        }
      } catch (err) {
        console.error(`Exception deleting ${orphan.email}:`, err)
        errors.push({ email: orphan.email, error: String(err) })
      }
    }

    console.log(`✅ Cleanup complete. Deleted: ${deletedUsers.length}, Errors: ${errors.length}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Limpeza concluída. ${deletedUsers.length} usuários órfãos removidos.`,
        deletedCount: deletedUsers.length,
        deletedUsers,
        errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Unexpected error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
