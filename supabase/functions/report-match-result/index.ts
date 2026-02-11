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
      .select('*, tournament:tournaments!inner(id, created_by, status, current_round, total_rounds, prize_pool, name)')
      .eq('id', match_id)
      .single();

    if (matchError || !match) {
      return new Response(JSON.stringify({ success: false, message: 'Partida não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is the tournament creator
    if (match.tournament.created_by !== user.id) {
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

    // Update participant stats - winner gets +1 win and +3 points
    const loser_id = winner_id === match.player1_id ? match.player2_id : match.player1_id;

    // Get current stats for winner
    const { data: winnerData } = await supabase
      .from('tournament_participants')
      .select('wins, score')
      .eq('tournament_id', match.tournament_id)
      .eq('user_id', winner_id)
      .single();

    if (winnerData) {
      await supabase
        .from('tournament_participants')
        .update({ 
          wins: winnerData.wins + 1,
          score: (winnerData.score || 0) + 3  // 3 points per win
        })
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', winner_id);
    }

    // Get current stats for loser
    const { data: loserData } = await supabase
      .from('tournament_participants')
      .select('losses, score')
      .eq('tournament_id', match.tournament_id)
      .eq('user_id', loser_id)
      .single();

    if (loserData) {
      await supabase
        .from('tournament_participants')
        .update({ 
          losses: loserData.losses + 1,
          score: loserData.score || 0  // Loser keeps same score
        })
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', loser_id);
    }

    // Check if all matches in current round are completed
    const { data: roundMatches } = await supabase
      .from('tournament_matches')
      .select('id, status, winner_id')
      .eq('tournament_id', match.tournament_id)
      .eq('round', match.round);

    const allCompleted = roundMatches?.every(m => m.status === 'completed');

    if (allCompleted && roundMatches && match.round < match.tournament.total_rounds) {
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
    } else if (allCompleted && match.round === match.tournament.total_rounds) {
      // Final da última rodada - distribuir prêmio automaticamente
      console.log(`Tournament ${match.tournament_id} final match completed. Winner: ${winner_id}`);
      const finalWinnerId = winner_id;
      
      // Calcular o prêmio baseado nas taxas de entrada pagas
      const { data: entryFees } = await supabase
        .from('duelcoins_transactions')
        .select('amount')
        .eq('tournament_id', match.tournament_id)
        .eq('transaction_type', 'tournament_entry');
      
      const totalPrize = entryFees?.reduce((sum, tx) => sum + (tx.amount || 0), 0) || 0;
      console.log(`Total prize calculated: ${totalPrize} DuelCoins`);
      
      // Se não houver taxas de entrada, usar o prize_pool do torneio
      const prizeAmount = totalPrize > 0 ? totalPrize : match.tournament.prize_pool;
      
      if (prizeAmount > 0) {
        console.log(`Distributing prize of ${prizeAmount} to winner ${finalWinnerId}`);
        
        // Buscar perfil do vencedor
        const { data: winnerProfile, error: winnerError } = await supabase
          .from('profiles')
          .select('duelcoins_balance, username')
          .eq('user_id', finalWinnerId)
          .single();

        if (winnerError) {
          console.error('Error fetching winner profile:', winnerError);
        } else if (winnerProfile) {
          console.log(`Winner profile found. Current balance: ${winnerProfile.duelcoins_balance}`);
          
          // Transferir prêmio para o vencedor
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ duelcoins_balance: winnerProfile.duelcoins_balance + prizeAmount })
            .eq('user_id', finalWinnerId);

          if (updateError) {
            console.error('Error updating winner balance:', updateError);
          } else {
            console.log(`Winner balance updated to ${winnerProfile.duelcoins_balance + prizeAmount}`);
          }

          // Registrar transação no histórico
          const { error: txError } = await supabase
            .from('duelcoins_transactions')
            .insert({
              sender_id: null,
              receiver_id: finalWinnerId,
              amount: prizeAmount,
              transaction_type: 'tournament_prize',
              tournament_id: match.tournament_id,
              description: `Prêmio do torneio: ${match.tournament.name}`
            });
            
          if (txError) {
            console.error('Error recording transaction:', txError);
          } else {
            console.log('Prize transaction recorded successfully');
          }
        } else {
          console.error('Winner profile not found');
        }
      } else {
        console.log('No prize to distribute (prize_amount = 0)');
      }

      // Atualizar status do vencedor
      const { error: winnerStatusError } = await supabase
        .from('tournament_participants')
        .update({ status: 'winner' })
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', finalWinnerId);
        
      if (winnerStatusError) {
        console.error('Error updating winner status:', winnerStatusError);
      }

      // Marcar torneio como completado
      const { error: tournamentError } = await supabase
        .from('tournaments')
        .update({ status: 'completed', end_date: new Date().toISOString() })
        .eq('id', match.tournament_id);
        
      if (tournamentError) {
        console.error('Error completing tournament:', tournamentError);
      } else {
        console.log('Tournament marked as completed');
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Resultado reportado com sucesso!',
      next_round_generated: allCompleted && match.round < match.tournament.total_rounds
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
