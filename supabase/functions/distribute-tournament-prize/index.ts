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

    // Transferir prize pool para o vencedor
    if (tournament.prize_pool > 0) {
      const { data: winnerProfile } = await supabaseClient
        .from('profiles')
        .select('duelcoins_balance, username')
        .eq('user_id', winner_id)
        .single();

      if (!winnerProfile) {
        return new Response(
          JSON.stringify({ success: false, message: 'Perfil do vencedor não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Adicionar prêmio ao vencedor
      await supabaseClient
        .from('profiles')
        .update({ 
          duelcoins_balance: winnerProfile.duelcoins_balance + tournament.prize_pool 
        })
        .eq('user_id', winner_id);

      // Registrar transação
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

    // Atualizar status do torneio
    await supabaseClient
      .from('tournaments')
      .update({ 
        status: 'completed',
        end_date: new Date().toISOString()
      })
      .eq('id', tournament_id);

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