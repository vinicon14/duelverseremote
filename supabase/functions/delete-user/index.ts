import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

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
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verificar autenticação do solicitante
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Não autorizado');
    }

    // Verificar se o usuário é admin
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!userRoles || userRoles.role !== 'admin') {
      throw new Error('Apenas administradores podem deletar usuários');
    }

    const { userId } = await req.json();

    if (!userId) {
      throw new Error('userId é obrigatório');
    }

    // Deletar usuário do auth (isso acionará cascades automáticos)
    const { error: deleteAuthError } = await supabaseClient.auth.admin.deleteUser(
      userId
    );

    if (deleteAuthError) {
      throw deleteAuthError;
    }

    // Deletar dados relacionados manualmente se necessário
    await supabaseClient.from('profiles').delete().eq('user_id', userId);
    await supabaseClient.from('user_roles').delete().eq('user_id', userId);
    await supabaseClient.from('friendships').delete().or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    await supabaseClient.from('live_duels').delete().or(`player1_id.eq.${userId},player2_id.eq.${userId}`);
    await supabaseClient.from('match_history').delete().or(`player1_id.eq.${userId},player2_id.eq.${userId}`);
    await supabaseClient.from('chat_messages').delete().eq('sender_id', userId);

    return new Response(
      JSON.stringify({ success: true, message: 'Usuário deletado com sucesso' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Erro desconhecido' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
