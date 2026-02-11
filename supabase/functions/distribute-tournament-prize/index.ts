import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { tournament_id, winner_id } = await req.json();

    if (!tournament_id || !winner_id) {
      return new Response(
        JSON.stringify({ success: false, message: 'Dados incompletos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar torneio
    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('*')
      .eq('id', tournament_id)
      .single();

    if (tournamentError || !tournament) {
      return new Response(
        JSON.stringify({ success: false, message: 'Torneio não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se é o criador ou admin
    const { data: isAdmin } = await supabaseClient
      .rpc('is_admin', { _user_id: user.id });

    if (tournament.created_by !== user.id && !isAdmin) {
      return new Response(
        JSON.stringify({ success: false, message: 'Apenas o criador ou admin pode finalizar o torneio' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se torneio está ativo
    if (tournament.status !== 'active') {
      return new Response(
        JSON.stringify({ success: false, message: 'Apenas torneios ativos podem ser finalizados' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se o vencedor é um participante
    const { data: winner, error: winnerError } = await supabaseClient
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournament_id)
      .eq('user_id', winner_id)
      .single();

    if (winnerError || !winner) {
      return new Response(
        JSON.stringify({ success: false, message: 'Vencedor não é um participante válido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Usar a função RPC para finalizar e pagar o vencedor
    const { data: result, error: finalizeError } = await supabaseClient
      .rpc('finalize_tournament_and_pay_winner', {
        p_tournament_id: tournament_id,
        p_winner_id: winner_id
      });

    if (finalizeError) {
      console.error('Error finalizing tournament:', finalizeError);
      return new Response(
        JSON.stringify({ success: false, message: 'Erro ao finalizar torneio: ' + finalizeError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar resultado da função RPC
    if (result && !result.success) {
      return new Response(
        JSON.stringify({ success: false, message: result.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: tournament.prize_pool > 0 
          ? `Prêmio de ${tournament.prize_pool} DuelCoins distribuído com sucesso!`
          : 'Torneio finalizado com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in distribute-tournament-prize:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Erro ao distribuir prêmio. Tente novamente.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});