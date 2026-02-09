import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isValidUUID, handleError, securityHeaders } from '../_utils/security.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, ...securityHeaders } })
  }

  try {
    const { videoId } = await req.json()

    if (!videoId || typeof videoId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Video ID is required' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!isValidUUID(videoId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid video ID format' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: recording, error: recordingError } = await supabaseAdmin
      .from('match_recordings')
      .select('*')
      .eq('id', videoId)
      .single()

    if (recordingError || !recording) {
      return new Response(
        JSON.stringify({ error: 'Video not found' }),
        { status: 404, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('username, avatar_url')
      .eq('user_id', recording.user_id)
      .single()

    await supabaseAdmin.rpc('increment_video_views', { video_id: videoId })

    return new Response(
      JSON.stringify({ 
        data: {
          ...recording,
          profiles: profile || { username: 'Usuário', avatar_url: null }
        }
      }),
      { headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return handleError(error, 'get-video-by-link')
  }
})
