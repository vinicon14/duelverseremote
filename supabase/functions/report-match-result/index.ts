import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, message: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { match_id, winner_id } = await req.json();

    if (!match_id || !winner_id) {
      return new Response(JSON.stringify({ success: false, message: 'Dados inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get match details
    const { data: match, error: matchError } = await supabase
      .from('tournament_matches')
      .select('*, tournaments!inner(created_by, status, current_round, total_rounds)')
      .eq('id', match_id)
      .single();

    if (matchError || !match) {
      return new Response(JSON.stringify({ success: false, message: 'Partida não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is the tournament creator
    if (match.tournaments.created_by !== user.id) {
      return new Response(JSON.stringify({ success: false, message: 'Apenas o criador do torneio pode reportar resultados' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate winner is one of the players
    if (winner_id !== match.player1_id && winner_id !== match.player2_id) {
      return new Response(JSON.stringify({ success: false, message: 'Vencedor inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update match with winner
    const { error: updateError } = await supabase
      .from('tournament_matches')
      .update({ 
        winner_id,
        status: 'completed'
      })
      .eq('id', match_id);

    if (updateError) {
      throw updateError;
    }

    // Update participant stats
    const loser_id = winner_id === match.player1_id ? match.player2_id : match.player1_id;

    await supabase
      .from('tournament_participants')
      .update({ wins: supabase.rpc('increment', { x: 1 }) })
      .eq('tournament_id', match.tournament_id)
      .eq('user_id', winner_id);

    await supabase
      .from('tournament_participants')
      .update({ losses: supabase.rpc('increment', { x: 1 }) })
      .eq('tournament_id', match.tournament_id)
      .eq('user_id', loser_id);

    // Check if all matches in current round are completed
    const { data: roundMatches } = await supabase
      .from('tournament_matches')
      .select('id, status, winner_id')
      .eq('tournament_id', match.tournament_id)
      .eq('round', match.round);

    const allCompleted = roundMatches?.every(m => m.status === 'completed');

    if (allCompleted && roundMatches && match.round < match.tournaments.total_rounds) {
      // Generate next round matches
      const winners = roundMatches.map(m => m.winner_id).filter(Boolean);
      const nextRoundMatches = [];

      for (let i = 0; i < winners.length; i += 2) {
        if (i + 1 < winners.length) {
          nextRoundMatches.push({
            tournament_id: match.tournament_id,
            round: match.round + 1,
            player1_id: winners[i],
            player2_id: winners[i + 1],
            status: 'pending',
          });
        } else {
          // Bye - player advances automatically
          nextRoundMatches.push({
            tournament_id: match.tournament_id,
            round: match.round + 1,
            player1_id: winners[i],
            player2_id: null,
            winner_id: winners[i],
            status: 'completed',
          });
        }
      }

      await supabase.from('tournament_matches').insert(nextRoundMatches);

      // Update tournament current round
      await supabase
        .from('tournaments')
        .update({ current_round: match.round + 1 })
        .eq('id', match.tournament_id);
    } else if (allCompleted && match.round === match.tournaments.total_rounds) {
      // Tournament finished - final match completed
      await supabase
        .from('tournaments')
        .update({ status: 'completed' })
        .eq('id', match.tournament_id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Resultado reportado com sucesso!',
      next_round_generated: allCompleted && match.round < match.tournaments.total_rounds
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error reporting match result:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao reportar resultado';
    return new Response(JSON.stringify({ 
      success: false, 
      message: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
