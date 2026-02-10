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
    console.log('🚀 Edge Function: admin-toggle-pro started')
    
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

    // Get the target user ID and account type from request body
    const { userId, accountType } = await req.json()
    
    if (!userId || !accountType) {
      console.error('❌ Missing required fields')
      return new Response(
        JSON.stringify({ error: 'userId and accountType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (accountType !== 'pro' && accountType !== 'free') {
      console.error('❌ Invalid account type:', accountType)
      return new Response(
        JSON.stringify({ error: 'accountType must be "pro" or "free"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('🎯 Target user ID:', userId, '| New account type:', accountType)

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

    // Update account type
    console.log(`👑 Updating account_type to ${accountType}...`)
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ account_type: accountType })
      .eq('user_id', userId)
      .select('id, username, display_name, account_type')
    
    if (updateError) {
      console.error('❌ Error updating profile:', updateError)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to update account type',
          details: updateError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!updatedProfile || updatedProfile.length === 0) {
      console.error('❌ No profile was updated')
      return new Response(
        JSON.stringify({ 
          error: 'User not found or update failed',
          details: 'No records were modified'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Profile updated:', updatedProfile[0])

    // Verify the update
    const { data: verifyProfile, error: verifyError } = await supabaseAdmin
      .from('profiles')
      .select('account_type, username, display_name')
      .eq('user_id', userId)
      .single()
    
    if (verifyError) {
      console.error('⚠️ Error verifying update:', verifyError)
    } else if (verifyProfile.account_type !== accountType) {
      console.error('❌ Account type was not updated!', {
        expected: accountType,
        found: verifyProfile.account_type
      })
      return new Response(
        JSON.stringify({ 
          error: 'Update verification failed',
          details: `Account type is still ${verifyProfile.account_type}`
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✅ Account type updated and verified successfully')

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Account type updated successfully',
        profile: updatedProfile[0],
        verified: verifyProfile
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
