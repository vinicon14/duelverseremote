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
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
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
      .select('*, created_by, entry_fee, prize_pool, max_participants')
      .eq('id', tournament_id)
      .single();

    if (tournamentError || !tournament) {
      throw new Error('Torneio não encontrado');
    }

    // Verificar se o usuário é o criador
    if (tournament.created_by === user.id) {
      throw new Error('O criador do torneio não pode participar');
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
      throw new Error('Torneio lotado');
    }

    // Buscar perfil do usuário
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('duelcoins_balance')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Perfil não encontrado');
    }

    // Verificar saldo
    if (profile.duelcoins_balance < tournament.entry_fee) {
      throw new Error('Saldo insuficiente de DuelCoins');
    }

    // Transferir DuelCoins do participante para o prize pool
    if (tournament.entry_fee > 0) {
      // Remover do participante
      const { error: deductError } = await supabaseClient
        .from('profiles')
        .update({ duelcoins_balance: profile.duelcoins_balance - tournament.entry_fee })
        .eq('user_id', user.id);

      if (deductError) throw deductError;

      // Adicionar ao prize pool
      const { error: prizeError } = await supabaseClient
        .from('tournaments')
        .update({ prize_pool: tournament.prize_pool + tournament.entry_fee })
        .eq('id', tournament_id);

      if (prizeError) throw prizeError;

      // Registrar transação
      const { error: txError } = await supabaseClient
        .from('duelcoins_transactions')
        .insert({
          sender_id: user.id,
          receiver_id: tournament.created_by,
          amount: tournament.entry_fee,
          transaction_type: 'tournament_entry',
          description: `Taxa de inscrição no torneio ${tournament.name}`
        });

      if (txError) throw txError;
    }

    // Inscrever no torneio
    const { error: participantError } = await supabaseClient
      .from('tournament_participants')
      .insert({
        tournament_id,
        user_id: user.id,
        status: 'registered'
      });

    if (participantError) throw participantError;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Inscrição realizada com sucesso!'
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