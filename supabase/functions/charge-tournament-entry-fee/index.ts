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

    const { tournament_id } = await req.json();

    // Buscar torneio
    const { data: tournament, error: tournamentError } = await supabaseClient
      .from('tournaments')
      .select('*')
      .eq('id', tournament_id)
      .single();

    if (tournamentError || !tournament) {
      throw new Error('Torneio não encontrado');
    }

    // Verificar se o torneio está aberto para inscrições
    if (tournament.status !== 'upcoming') {
      throw new Error('Este torneio não está aberto para inscrições');
    }

    // Verificar se não é o criador tentando se inscrever
    if (tournament.created_by === user.id) {
      throw new Error('O criador do torneio não pode se inscrever');
    }

    // Verificar se já está inscrito
    const { data: existingParticipant } = await supabaseClient
      .from('tournament_participants')
      .select('id')
      .eq('tournament_id', tournament_id)
      .eq('user_id', user.id)
      .single();

    if (existingParticipant) {
      throw new Error('Você já está inscrito neste torneio');
    }

    // Contar participantes
    const { count } = await supabaseClient
      .from('tournament_participants')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournament_id);

    if (count && count >= tournament.max_participants) {
      throw new Error('Torneio está cheio');
    }

    // Verificar saldo se houver taxa
    if (tournament.entry_fee > 0) {
      const { data: userProfile } = await supabaseClient
        .from('profiles')
        .select('duelcoins_balance')
        .eq('user_id', user.id)
        .single();

      if (!userProfile || userProfile.duelcoins_balance < tournament.entry_fee) {
        throw new Error('Saldo insuficiente de DuelCoins');
      }

      // Debitar taxa do usuário
      const { error: debitError } = await supabaseClient
        .from('profiles')
        .update({ 
          duelcoins_balance: userProfile.duelcoins_balance - tournament.entry_fee 
        })
        .eq('user_id', user.id);

      if (debitError) throw debitError;

      // Adicionar taxa ao prize pool
      const { error: prizeError } = await supabaseClient
        .from('tournaments')
        .update({ 
          prize_pool: tournament.prize_pool + tournament.entry_fee 
        })
        .eq('id', tournament_id);

      if (prizeError) throw prizeError;

      // Registrar transação
      const { error: txError } = await supabaseClient
        .from('duelcoins_transactions')
        .insert({
          sender_id: user.id,
          receiver_id: null,
          amount: tournament.entry_fee,
          transaction_type: 'tournament_entry',
          description: `Taxa de inscrição do torneio: ${tournament.name}`
        });

      if (txError) throw txError;
    }

    // Inscrever participante
    const { error: participantError } = await supabaseClient
      .from('tournament_participants')
      .insert({
        tournament_id: tournament_id,
        user_id: user.id,
        status: 'registered'
      });

    if (participantError) throw participantError;

    return new Response(
      JSON.stringify({
        success: true,
        message: tournament.entry_fee > 0 
          ? `Inscrição realizada! ${tournament.entry_fee} DuelCoins debitados.`
          : 'Inscrição realizada com sucesso!'
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