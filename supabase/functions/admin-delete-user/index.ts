/**
 * DuelVerse - Edge Function: Deletar Usuário (Admin)
 * Desenvolvido por Vinícius
 * 
 * Permite ao admin excluir um usuário e todos os seus dados.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🚀 Edge Function: admin-delete-user started')
    
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('❌ No authorization header')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create a Supabase client with the user's auth token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify the user is authenticated and is an admin
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      console.error('❌ User not authenticated:', userError)
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('👤 User authenticated:', user.id)

    // Check if user is admin
    const { data: roles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (rolesError || !roles) {
      console.error('❌ User is not admin:', rolesError)
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Admin only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ User is admin')

    // Get the target user ID from request body
    const { userId } = await req.json()
    
    if (!userId) {
      console.error('❌ No userId provided')
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('🎯 Target user ID:', userId)

    // Create admin client with service role key (bypasses RLS)
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

    console.log('🔧 Admin client created with service role')

    // Delete in order (avoid foreign key constraints)
    
    // 1. Delete user_roles
    console.log('📋 Deleting user_roles...')
    const { error: rolesDelError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
    
    if (rolesDelError) {
      console.error('⚠️ Error deleting user_roles:', rolesDelError)
    }

    // 2. Delete chat_messages
    console.log('💬 Deleting chat_messages...')
    const { error: chatError } = await supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('sender_id', userId)
    
    if (chatError) {
      console.error('⚠️ Error deleting chat_messages:', chatError)
    }

    // 3. Delete friend_requests
    console.log('👥 Deleting friend_requests...')
    const { error: friendReqError } = await supabaseAdmin
      .from('friend_requests')
      .delete()
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    
    if (friendReqError) {
      console.error('⚠️ Error deleting friend_requests:', friendReqError)
    }

    // 4. Delete live_duels
    console.log('⚔️ Deleting live_duels...')
    const { error: duelsError } = await supabaseAdmin
      .from('live_duels')
      .delete()
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    
    if (duelsError) {
      console.error('⚠️ Error deleting live_duels:', duelsError)
    }

    // 5. Delete match_history
    console.log('📊 Deleting match_history...')
    const { error: matchError } = await supabaseAdmin
      .from('match_history')
      .delete()
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
    
    if (matchError) {
      console.error('⚠️ Error deleting match_history:', matchError)
    }

    // 6. Delete profile (CRITICAL)
    console.log('👤 Deleting profile...')
    const { data: deletedProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId)
      .select()
    
    if (profileError) {
      console.error('❌ CRITICAL: Error deleting profile:', profileError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete user profile',
          details: profileError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Profile deleted:', deletedProfile)

    // Verify deletion
    const { data: checkProfile, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()
    
    if (checkProfile) {
      console.error('❌ Profile still exists after deletion!')
      return new Response(
        JSON.stringify({ 
          error: 'Profile deletion failed - user still exists',
          details: 'The profile was not removed from the database'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Delete from auth.users
    console.log('🔐 Deleting from auth.users...')
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
    
    if (authDeleteError) {
      console.error('⚠️ Error deleting from auth.users:', authDeleteError)
      // Não falhar aqui, pois o perfil já foi removido
    } else {
      console.log('✅ Deleted from auth.users')
    }

    console.log('✅ User deleted successfully')

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'User and email deleted successfully',
        deletedProfile: deletedProfile?.[0] || null,
        deletedFromAuth: !authDeleteError
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
