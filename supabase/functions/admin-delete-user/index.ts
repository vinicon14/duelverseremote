import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Cliente com permissões de service_role (full access, bypassa RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Cliente normal para verificar autenticação
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    // Verificar autenticação do solicitante
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Não autorizado' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401 
        }
      );
    }

    // Verificar se o usuário é admin
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!userRoles) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Apenas administradores podem deletar usuários' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403 
        }
      );
    }

    const { userId } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'userId é obrigatório' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Não permitir deletar a si mesmo
    if (user.id === userId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Você não pode deletar sua própria conta' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`Admin ${user.id} iniciando exclusão do usuário ${userId}`);

    // Deletar dados relacionados usando service_role (sem RLS)
    // A ordem é importante para evitar violações de chave estrangeira

    // 1. Chat messages
    console.log('Deletando chat_messages...');
    await supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('sender_id', userId);

    // 2. Friendships
    console.log('Deletando friendships...');
    await supabaseAdmin
      .from('friendships')
      .delete()
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    // 3. Friend requests
    console.log('Deletando friend_requests...');
    await supabaseAdmin
      .from('friend_requests')
      .delete()
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    // 4. Live duels
    console.log('Deletando live_duels...');
    await supabaseAdmin
      .from('live_duels')
      .delete()
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);

    // 5. Match history
    console.log('Deletando match_history...');
    await supabaseAdmin
      .from('match_history')
      .delete()
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);

    // 6. User roles
    console.log('Deletando user_roles...');
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);

    // 7. Deletar perfil
    console.log('Deletando profile...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Erro ao deletar perfil: ${profileError.message}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    // 8. Deletar usuário do auth
    console.log('Deletando usuário do auth...');
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      // Não retornar erro aqui pois o perfil já foi deletado
    }

    console.log(`Usuário ${userId} deletado com sucesso por admin ${user.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Usuário deletado com sucesso' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error na função de exclusão:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
