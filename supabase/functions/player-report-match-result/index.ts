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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { match_id, result } = await req.json();

    if (!match_id || !result || !['win', 'loss'].includes(result)) {
      return new Response(JSON.stringify({ success: false, message: 'Dados inválidos. Envie match_id e result (win/loss).' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: match, error: matchError } = await supabase
      .from('tournament_matches')
      .select('*, tournament:tournaments!inner(id, created_by, status, current_round, total_rounds, prize_pool, name)')
      .eq('id', match_id)
      .single();

    if (matchError || !match) {
      return new Response(JSON.stringify({ success: false, message: 'Partida não encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (match.status === 'completed') {
      return new Response(JSON.stringify({ success: false, message: 'Esta partida já foi concluída' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (match.conflict_count >= 3) {
      return new Response(JSON.stringify({ success: false, message: 'Esta partida está em revisão manual pelo administrador.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isPlayer1 = user.id === match.player1_id;
    const isPlayer2 = user.id === match.player2_id;

    if (!isPlayer1 && !isPlayer2) {
      return new Response(JSON.stringify({ success: false, message: 'Você não é participante desta partida' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (isPlayer1) {
      updateData.player1_result = result;
      updateData.player1_reported = true;
    } else {
      updateData.player2_result = result;
      updateData.player2_reported = true;
    }

    const { error: updateError } = await supabase
      .from('tournament_matches')
      .update(updateData)
      .eq('id', match_id);

    if (updateError) throw updateError;

    await supabase.from('tournament_match_reports').upsert({
      match_id,
      reporter_id: user.id,
      result: result,
    }, { onConflict: 'match_id,reporter_id', ignoreDuplicates: false });

    // Reporter username for creator notification
    const { data: reporterProfile } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', user.id)
      .maybeSingle();
    const reporterName = reporterProfile?.username ?? 'Um jogador';

    // Notify creator about every report
    if (match.tournament?.created_by && match.tournament.created_by !== user.id) {
      await supabase.from('notifications').insert({
        user_id: match.tournament.created_by,
        type: 'tournament_report',
        title: `Reporte recebido — ${match.tournament.name}`,
        message: `${reporterName} reportou ${result === 'win' ? 'VITÓRIA' : 'DERROTA'} em uma partida da rodada ${match.round}.`,
        data: { match_id, tournament_id: match.tournament_id, reporter_id: user.id, result, round: match.round },
      });
    }

    const { data: updatedMatch } = await supabase
      .from('tournament_matches')
      .select('*, tournament:tournaments!inner(id, created_by, status, current_round, total_rounds, prize_pool, name)')
      .eq('id', match_id)
      .single();

    if (!updatedMatch) throw new Error('Erro ao recarregar partida');

    const p1Result = isPlayer1 ? result : updatedMatch.player1_result;
    const p2Result = isPlayer2 ? result : updatedMatch.player2_result;

    if (!p1Result || !p2Result) {
      const opponentId = isPlayer1 ? match.player2_id : match.player1_id;
      if (opponentId) {
        await supabase.from('notifications').insert({
          user_id: opponentId,
          type: 'tournament_report',
          title: 'Reporte de Resultado',
          message: 'Seu oponente já reportou o resultado. Relate o seu!',
          data: { match_id, tournament_id: match.tournament_id },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        status: 'waiting',
        message: 'Resposta registrada! Aguardando o outro jogador reportar.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const isValid = (p1Result === 'win' && p2Result === 'loss') ||
                    (p1Result === 'loss' && p2Result === 'win');

    if (isValid) {
      const winnerId = p1Result === 'win' ? match.player1_id : match.player2_id;
      const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;

      await supabase.from('tournament_matches').update({
        winner_id: winnerId,
        status: 'completed',
      }).eq('id', match_id);

      // Defensive against null score/wins/losses
      const { data: winnerData } = await supabase
        .from('tournament_participants')
        .select('wins, score')
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', winnerId)
        .single();

      if (winnerData) {
        await supabase.from('tournament_participants').update({
          wins: (winnerData.wins ?? 0) + 1,
          score: (winnerData.score ?? 0) + 3,
        }).eq('tournament_id', match.tournament_id).eq('user_id', winnerId);
      }

      const { data: loserData } = await supabase
        .from('tournament_participants')
        .select('losses, score')
        .eq('tournament_id', match.tournament_id)
        .eq('user_id', loserId)
        .single();

      if (loserData) {
        await supabase.from('tournament_participants').update({
          losses: (loserData.losses ?? 0) + 1,
        }).eq('tournament_id', match.tournament_id).eq('user_id', loserId);
      }

      for (const playerId of [match.player1_id, match.player2_id]) {
        if (!playerId) continue;
        await supabase.from('notifications').insert({
          user_id: playerId,
          type: 'tournament_result',
          title: 'Resultado Confirmado',
          message: 'Resultado confirmado automaticamente! O torneio avança.',
          data: { match_id, tournament_id: match.tournament_id },
        });
      }

      // Notify creator about confirmation
      if (
        match.tournament?.created_by &&
        match.tournament.created_by !== match.player1_id &&
        match.tournament.created_by !== match.player2_id
      ) {
        await supabase.from('notifications').insert({
          user_id: match.tournament.created_by,
          type: 'tournament_result',
          title: `Partida confirmada — ${match.tournament.name}`,
          message: 'Ambos jogadores reportaram e o resultado foi confirmado.',
          data: { match_id, tournament_id: match.tournament_id, winner_id: winnerId },
        });
      }

      const { data: roundMatches } = await supabase
        .from('tournament_matches')
        .select('id, status, winner_id')
        .eq('tournament_id', match.tournament_id)
        .eq('round', match.round);

      const allCompleted = roundMatches?.every(m => m.status === 'completed');

      if (allCompleted && roundMatches && match.round < match.tournament.total_rounds) {
        // Don't auto-generate if next round already exists (creator may use Swiss generator)
        const { data: nextRoundExisting } = await supabase
          .from('tournament_matches')
          .select('id')
          .eq('tournament_id', match.tournament_id)
          .eq('round', match.round + 1)
          .limit(1);

        if (!nextRoundExisting || nextRoundExisting.length === 0) {
          const winners = roundMatches.map(m => m.winner_id).filter(Boolean) as string[];
          const nextRoundMatches: Record<string, unknown>[] = [];

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
        }
      }

      return new Response(JSON.stringify({
        success: true,
        status: 'confirmed',
        message: 'Resultado confirmado automaticamente!',
        winner_id: winnerId,
        next_round_generated: allCompleted && match.round < match.tournament.total_rounds,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } else {
      const newConflictCount = (updatedMatch.conflict_count || 0) + 1;

      const conflictUpdate: Record<string, unknown> = {
        player1_result: null,
        player2_result: null,
        player1_reported: false,
        player2_reported: false,
        conflict_count: newConflictCount,
      };

      if (newConflictCount >= 3) {
        conflictUpdate.status = 'manual_review';
      }

      await supabase.from('tournament_matches').update(conflictUpdate).eq('id', match_id);

      const conflictMessage = newConflictCount >= 3
        ? 'As respostas foram inconsistentes múltiplas vezes. A partida foi enviada para revisão do administrador.'
        : 'As respostas foram inconsistentes. Um dos jogadores pode ter reportado incorretamente. Por favor, relatem novamente.';

      for (const playerId of [match.player1_id, match.player2_id]) {
        if (!playerId) continue;
        await supabase.from('notifications').insert({
          user_id: playerId,
          type: 'tournament_conflict',
          title: 'Conflito no Resultado',
          message: conflictMessage,
          data: { match_id, tournament_id: match.tournament_id, conflict_count: newConflictCount },
        });
      }

      // Notify creator about every conflict
      if (
        match.tournament?.created_by &&
        match.tournament.created_by !== match.player1_id &&
        match.tournament.created_by !== match.player2_id
      ) {
        await supabase.from('notifications').insert({
          user_id: match.tournament.created_by,
          type: newConflictCount >= 3 ? 'tournament_manual_review' : 'tournament_conflict',
          title: newConflictCount >= 3
            ? `Revisão manual — ${match.tournament.name}`
            : `Conflito de reporte — ${match.tournament.name}`,
          message: newConflictCount >= 3
            ? `Uma partida do torneio precisa de revisão manual após ${newConflictCount} conflitos.`
            : `Os jogadores reportaram resultados inconsistentes (${newConflictCount}/3 antes da revisão manual).`,
          data: { match_id, tournament_id: match.tournament_id, conflict_count: newConflictCount },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        status: 'conflict',
        message: conflictMessage,
        conflict_count: newConflictCount,
        manual_review: newConflictCount >= 3,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : 'Erro interno',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
