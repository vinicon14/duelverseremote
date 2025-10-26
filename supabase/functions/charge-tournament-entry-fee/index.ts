import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { tournament_id, participant_id } = await req.json()

  try {
    // 1. Get tournament details
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('entry_fee, created_by')
      .eq('id', tournament_id)
      .single()

    if (tournamentError) throw tournamentError
    if (!tournament) throw new Error('Tournament not found')

    const { entry_fee, created_by: creator_id } = tournament

    // 2. Get participant's profile (and balance)
    const { data: participantProfile, error: participantError } = await supabase
      .from('profiles')
      .select('duelcoins_balance')
      .eq('user_id', participant_id)
      .single()

    if (participantError) throw participantError
    if (!participantProfile) throw new Error('Participant profile not found')

    // 3. Check balance
    if (participantProfile.duelcoins_balance < entry_fee) {
      throw new Error('Insufficient DuelCoins balance')
    }

    // 4. Perform the transaction
    // Use an RPC call to ensure atomicity
    const { error: rpcError } = await supabase.rpc('charge_entry_fee', {
        p_amount: entry_fee,
        p_sender_id: participant_id,
        p_receiver_id: creator_id,
        p_tournament_id: tournament_id,
    })

    if (rpcError) throw rpcError

    return new Response(JSON.stringify({ success: true, message: 'Entry fee paid successfully' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
