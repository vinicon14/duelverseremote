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

    const { match_id, winner_id } = await req.json();

    // 1. Get match details
    const { data: match, error: matchError } = await supabase
      .from('tournament_matches')
      .select('player1_id, player2_id, tournament_id')
      .eq('id', match_id)
      .single();

    if (matchError) throw matchError;

    // 2. Validate user is a player in the match or a judge/admin
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) throw rolesError;
    const isJudgeOrAdmin = userRoles?.some(role => role.role === 'admin' || role.role === 'judge');

    if (user.id !== match.player1_id && user.id !== match.player2_id && !isJudgeOrAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    // 3. Update match result
    const { error: updateError } = await supabase
      .from('tournament_matches')
      .update({ status: 'completed', winner_id })
      .eq('id', match_id);

    if (updateError) throw updateError;

    // 4. Update loser's status in single elimination
    const loser_id = winner_id === match.player1_id ? match.player2_id : match.player1_id;
    const { data: tournament } = await supabase
        .from('tournaments')
        .select('type')
        .eq('id', match.tournament_id)
        .single();

    if (tournament && tournament.type === 'single_elimination') {
        await supabase
            .from('tournament_players')
            .update({ status: 'eliminated' })
            .eq('tournament_id', match.tournament_id)
            .eq('user_id', loser_id);
    }


    return new Response(JSON.stringify({ message: 'Match result reported.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
