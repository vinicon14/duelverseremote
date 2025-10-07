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
    // Cliente com permissões de service_role (full access)
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
      throw new Error('Não autorizado');
    }

    // Verificar se o usuário é admin
    const { data: userRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!userRoles) {
      throw new Error('Apenas administradores podem deletar usuários');
    }

    const { userId } = await req.json();

    if (!userId) {
      throw new Error('userId é obrigatório');
    }

    // Não permitir deletar a si mesmo
    if (user.id === userId) {
      throw new Error('Você não pode deletar sua própria conta');
    }

    console.log(`Admin ${user.id} deleting user ${userId}`);

    // Deletar dados relacionados usando service_role (sem RLS)
    // Chat messages
    const { error: chatError } = await supabaseAdmin
      .from('chat_messages')
      .delete()
      .eq('sender_id', userId);
    if (chatError) console.error('Error deleting chat_messages:', chatError);

    // Friendships
    const { error: friendshipsError } = await supabaseAdmin
      .from('friendships')
      .delete()
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    if (friendshipsError) console.error('Error deleting friendships:', friendshipsError);

    // Friend requests
    const { error: friendRequestsError } = await supabaseAdmin
      .from('friend_requests')
      .delete()
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (friendRequestsError) console.error('Error deleting friend_requests:', friendRequestsError);

    // Live duels
    const { error: duelsError } = await supabaseAdmin
      .from('live_duels')
      .delete()
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);
    if (duelsError) console.error('Error deleting live_duels:', duelsError);

    // Match history
    const { error: matchHistoryError } = await supabaseAdmin
      .from('match_history')
      .delete()
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);
    if (matchHistoryError) console.error('Error deleting match_history:', matchHistoryError);

    // User roles
    const { error: rolesError } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId);
    if (rolesError) console.error('Error deleting user_roles:', rolesError);

    // Admin actions (opcional - manter histórico ou deletar?)
    const { error: adminActionsError } = await supabaseAdmin
      .from('admin_actions')
      .delete()
      .eq('target_user_id', userId);
    if (adminActionsError) console.error('Error deleting admin_actions:', adminActionsError);

    // Deletar perfil
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('user_id', userId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      throw new Error(`Erro ao deletar perfil: ${profileError.message}`);
    }

    // Deletar usuário do auth
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      // Não falhar aqui pois o perfil já foi deletado
    }

    console.log(`User ${userId} deleted successfully`);

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
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: (error as Error).message || 'Erro desconhecido'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});
