import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { isValidUUID, handleError, securityHeaders } from '../_utils/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, ...securityHeaders } });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Não autenticado' }), {
        status: 401,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { match_id, winner_id } = await req.json();

    if (!match_id || !winner_id) {
      return new Response(JSON.stringify({ success: false, error: 'Dados inválidos' }), {
        status: 400,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!isValidUUID(match_id) || !isValidUUID(winner_id)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid ID format' }), {
        status: 400,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: match, error: matchError } = await supabase
      .from('tournament_matches')
      .select('*, tournament:tournaments!inner(id, created_by, status, current_round, total_rounds, prize_pool, name)')
      .eq('id', match_id)
      .single();

    if (matchError || !match) {
      return new Response(JSON.stringify({ success: false, error: 'Partida não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (match.tournament.created_by !== user.id) {
      return new Response(JSON.stringify({ success: false, error: 'Apenas o criador do torneio pode reportar resultados' }), {
        status: 403,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (winner_id !== match.player1_id && winner_id !== match.player2_id) {
      return new Response(JSON.stringify({ success: false, error: 'Vencedor inválido' }), {
        status: 400,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    await supabase
      .from('tournament_matches')
      .update({ winner_id, status: 'completed' })
      .eq('id', match_id);

    const loser_id = winner_id === match.player1_id ? match.player2_id : match.player1_id;

    const { data: winnerData } = await supabase
      .from('tournament_participants')
      .select('wins, score')
      .eq('tournament_id', match.tournament_id)
      .eq('user_id', winner_id)
      .single();

    if (winnerData) {
      await supabase
        .from('tournament_participants')
        .update({ wins: winnerData.wins + 1, score: (winnerData.score || 0) + 3 })
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', winner_id);
    }

    const { data: loserData } = await supabase
      .from('tournament_participants')
      .select('losses, score')
      .eq('tournament_id', match.tournament_id)
      .eq('user_id', loser_id)
      .single();

    if (loserData) {
      await supabase
        .from('tournament_participants')
        .update({ losses: loserData.losses + 1, score: loserData.score || 0 })
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', loser_id);
    }

    const { data: roundMatches } = await supabase
      .from('tournament_matches')
      .select('id, status, winner_id')
      .eq('tournament_id', match.tournament_id)
      .eq('round', match.round);

    const allCompleted = roundMatches?.every(m => m.status === 'completed');

    if (allCompleted && roundMatches && match.round < match.tournament.total_rounds) {
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
      await supabase.from('tournaments').update({ current_round: match.round + 1 }).eq('id', match.tournament_id);
    } else if (allCompleted && match.round === match.tournament.total_rounds) {
      // Final da última rodada - distribuir prêmio automaticamente
      const finalWinnerId = winner_id;
      
      if (match.tournament.prize_pool > 0) {
        // Buscar perfil do vencedor
        const { data: winnerProfile } = await supabase
          .from('profiles')
          .select('duelcoins_balance, username')
          .eq('user_id', finalWinnerId)
          .single();

        if (winnerProfile) {
          // Transferir prêmio para o vencedor
          await supabase
            .from('profiles')
            .update({ duelcoins_balance: winnerProfile.duelcoins_balance + match.tournament.prize_pool })
            .eq('user_id', finalWinnerId);

          // Registrar transação no histórico
          await supabase
            .from('duelcoins_transactions')
            .insert({
              sender_id: null,
              receiver_id: finalWinnerId,
              amount: match.tournament.prize_pool,
              transaction_type: 'tournament_prize',
              tournament_id: match.tournament_id,
              description: `Prêmio do torneio: ${match.tournament.name}`
            });
        }
      }

      // Atualizar status do vencedor
      await supabase
        .from('tournament_participants')
        .update({ status: 'winner' })
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', finalWinnerId);

      // Marcar torneio como completado
      await supabase
        .from('tournaments')
        .update({ status: 'completed', end_date: new Date().toISOString() })
        .eq('id', match.tournament_id);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Resultado reportado com sucesso!',
      next_round_generated: allCompleted && match.round < match.tournament.total_rounds
    }), {
      status: 200,
      headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleError(error, 'report-match-result');
  }
});
