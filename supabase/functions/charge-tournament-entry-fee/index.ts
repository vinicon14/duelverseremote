import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
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

    const { tournament_id } = await req.json();

    if (!isValidUUID(tournament_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid tournament ID format' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('duelcoins_balance, username')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Perfil não encontrado' }),
        { status: 404, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
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

    if (tournament.created_by === user.id) {
      return new Response(
        JSON.stringify({ success: false, error: 'Você não pode se inscrever no seu próprio torneio' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tournament.status !== 'upcoming') {
      return new Response(
        JSON.stringify({ success: false, error: 'Este torneio não está aceitando inscrições' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { count: participantCount } = await supabaseClient
      .from('tournament_participants')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tournament_id);

    if (participantCount && participantCount >= tournament.max_participants) {
      return new Response(
        JSON.stringify({ success: false, error: 'Torneio lotado' }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tournament.entry_fee > 0 && profile.duelcoins_balance < tournament.entry_fee) {
      return new Response(
        JSON.stringify({ success: false, error: `Saldo insuficiente. Você precisa de ${tournament.entry_fee} DuelCoins` }),
        { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (tournament.entry_fee > 0) {
      await supabaseClient
        .from('profiles')
        .update({ duelcoins_balance: profile.duelcoins_balance - tournament.entry_fee })
        .eq('user_id', user.id);

      await supabaseClient
        .from('tournaments')
        .update({ prize_pool: tournament.prize_pool + tournament.entry_fee })
        .eq('id', tournament_id);

      await supabaseClient
        .from('duelcoins_transactions')
        .insert({
          sender_id: user.id,
          receiver_id: null,
          amount: tournament.entry_fee,
          transaction_type: 'tournament_entry',
          description: `Inscrição no torneio: ${tournament.name}`
        });
    }

    const { error: participantError } = await supabaseClient
      .from('tournament_participants')
      .insert({ tournament_id, user_id: user.id, status: 'registered' });

    if (participantError) {
      if (participantError.code === '23505') {
        return new Response(
          JSON.stringify({ success: false, error: 'Você já está inscrito neste torneio' }),
          { status: 400, headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw participantError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: tournament.entry_fee > 0 
          ? `Inscrição realizada! ${tournament.entry_fee} DuelCoins pagos.`
          : 'Inscrição realizada com sucesso!'
      }),
      { headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return handleError(error, 'charge-tournament-entry-fee');
  }
});
