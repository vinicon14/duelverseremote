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
      throw new Error('Não autorizado');
    }

    const { tournament_id, winner_id } = await req.json();

    // Buscar torneio
    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('*')
      .eq('id', tournament_id)
      .single();

    if (tournamentError || !tournament) {
      throw new Error('Torneio não encontrado');
    }

    // Verificar se é o criador ou admin
    const { data: isAdmin } = await supabaseClient
      .rpc('is_admin', { _user_id: user.id });

    if (tournament.created_by !== user.id && !isAdmin) {
      throw new Error('Apenas o criador ou admin pode finalizar o torneio');
    }

    // Verificar se torneio está ativo
    if (tournament.status !== 'active') {
      throw new Error('Apenas torneios ativos podem ser finalizados');
    }

    // Verificar se o vencedor é um participante
    const { data: winner, error: winnerError } = await supabaseClient
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournament_id)
      .eq('user_id', winner_id)
      .single();

    if (winnerError || !winner) {
      throw new Error('Vencedor não é um participante válido');
    }

    // Transferir prize pool para o vencedor
    if (tournament.prize_pool > 0) {
      const { data: winnerProfile } = await supabaseClient
        .from('profiles')
        .select('duelcoins_balance')
        .eq('user_id', winner_id)
        .single();

      if (!winnerProfile) {
        throw new Error('Perfil do vencedor não encontrado');
      }

      // Adicionar ao vencedor
      const { error: addError } = await supabaseClient
        .from('profiles')
        .update({ 
          duelcoins_balance: winnerProfile.duelcoins_balance + tournament.prize_pool 
        })
        .eq('user_id', winner_id);

      if (addError) throw addError;

      // Registrar transação
      const { error: txError } = await supabaseClient
        .from('duelcoins_transactions')
        .insert({
          sender_id: null,
          receiver_id: winner_id,
          amount: tournament.prize_pool,
          transaction_type: 'tournament_prize',
          description: `Prêmio do torneio: ${tournament.name}`
        });

      if (txError) throw txError;
    }

    // Atualizar status do torneio
    const { error: updateError } = await supabaseClient
      .from('tournaments')
      .update({ 
        status: 'completed',
        end_date: new Date().toISOString(),
        prize_pool: 0
      })
      .eq('id', tournament_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Prêmio distribuído com sucesso!'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});