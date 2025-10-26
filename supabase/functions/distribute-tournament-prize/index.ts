import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { tournament_id, winner_id } = await req.json()

  try {
    // 1. Get tournament details
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('prize_pool, created_by, status')
      .eq('id', tournament_id)
      .single()

    if (tournamentError) throw tournamentError
    if (!tournament) throw new Error('Tournament not found')
    if (tournament.status === 'completed') throw new Error('Tournament is already completed')

    const { prize_pool, created_by: creator_id } = tournament

    // 2. Use an RPC call to ensure atomicity
    const { error: rpcError } = await supabase.rpc('distribute_prize', {
        p_tournament_id: tournament_id,
        p_winner_id: winner_id,
        p_creator_id: creator_id,
        p_prize_pool: prize_pool
    })

    if (rpcError) throw rpcError

    return new Response(JSON.stringify({ success: true, message: 'Prize distributed successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
