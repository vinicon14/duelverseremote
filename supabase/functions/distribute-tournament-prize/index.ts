import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { isValidUUID, handleError, securityHeaders, sanitizeString } from '../_utils/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, ...securityHeaders } });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { tournament_id, winner_id } = await req.json();

    if (!tournament_id || !winner_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Dados incompletos' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidUUID(tournament_id) || !isValidUUID(winner_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid ID format' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('*')
      .eq('id', tournament_id)
      .single();

    if (tournamentError || !tournament) {
      return new Response(
        JSON.stringify({ success: false, error: 'Torneio não encontrado' }),
        { status: 404, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: isAdmin } = await supabaseClient.rpc('is_admin', { _user_id: user.id });

    if (tournament.created_by !== user.id && !isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Apenas o criador ou admin pode finalizar o torneio' }),
        { status: 403, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tournament.status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, error: 'Apenas torneios ativos podem ser finalizados' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: winner, error: winnerError } = await supabaseClient
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournament_id)
      .eq('user_id', winner_id)
      .single();

    if (winnerError || !winner) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vencedor não é um participante válido' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tournament.prize_pool > 0) {
      const { data: winnerProfile } = await supabaseClient
        .from('profiles')
        .select('duelcoins_balance, username')
        .eq('user_id', winner_id)
        .single();

      if (winnerProfile) {
        await supabaseClient
          .from('profiles')
          .update({ duelcoins_balance: winnerProfile.duelcoins_balance + tournament.prize_pool })
          .eq('user_id', winner_id);

        await supabaseClient
          .from('duelcoins_transactions')
          .insert({
            sender_id: null,
            receiver_id: winner_id,
            amount: tournament.prize_pool,
            transaction_type: 'tournament_prize',
            description: `Prêmio do torneio: ${tournament.name}`
          });
      }
    }

    await supabaseClient
      .from('tournaments')
      .update({ status: 'completed', end_date: new Date().toISOString() })
      .eq('id', tournament_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: tournament.prize_pool > 0 
          ? `Prêmio de ${tournament.prize_pool} DuelCoins distribuído com sucesso!`
          : 'Torneio finalizado com sucesso!'
      }),
      { headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return handleError(error, 'distribute-tournament-prize');
  }
});
