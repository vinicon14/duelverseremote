import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.31.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const { tournament_id } = await req.json();

    // Get tournament details
    const { data: tournament, error: tournamentError } = await supabase
      .from('tournaments')
      .select('entry_fee, status, max_participants')
      .eq('id', tournament_id)
      .single();

    if (tournamentError) throw tournamentError;
    if (tournament.status !== 'open') {
      return new Response(JSON.stringify({ error: 'Tournament is not open for registration.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Check if tournament is full
    const { count: participantCount, error: countError } = await supabase
        .from('tournament_players')
        .select('*', { count: 'exact' })
        .eq('tournament_id', tournament_id);

    if(countError) throw countError;
    if(participantCount >= tournament.max_participants) {
        return new Response(JSON.stringify({ error: 'Tournament is full.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }

    // Handle entry fee
    if (tournament.entry_fee > 0) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('points')
        .eq('user_id', user.id)
        .single();

      if (profileError) throw profileError;

      if (profile.points < tournament.entry_fee) {
        return new Response(JSON.stringify({ error: 'Insufficient DuelCoins' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ points: profile.points - tournament.entry_fee })
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    }

    // Add user to tournament
    const { data, error } = await supabase
      .from('tournament_players')
      .insert({ tournament_id, user_id: user.id })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
