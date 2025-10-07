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
          error: 'Apenas administradores podem alterar o tipo de conta' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403 
        }
      );
    }

    const { userId, accountType } = await req.json();

    if (!userId || !accountType) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'userId e accountType são obrigatórios' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    if (accountType !== 'free' && accountType !== 'pro') {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'accountType deve ser "free" ou "pro"' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`Admin ${user.id} alterando conta de usuário ${userId} para ${accountType}`);

    // Atualizar o tipo de conta usando service_role (bypassa RLS)
    const { data: updateData, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ account_type: accountType })
      .eq('user_id', userId)
      .select();

    if (updateError) {
      console.error('Error updating account type:', updateError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Erro ao atualizar tipo de conta: ${updateError.message}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

    console.log('Update result:', updateData);

    // Verificar se a atualização foi bem-sucedida
    const { data: verifyData } = await supabaseAdmin
      .from('profiles')
      .select('account_type, username, display_name')
      .eq('user_id', userId)
      .single();

    console.log('Verification after update:', verifyData);

    if (verifyData?.account_type === accountType) {
      console.log(`Conta do usuário ${userId} (${verifyData.username}) alterada para ${accountType} com sucesso`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Conta alterada para ${accountType.toUpperCase()} com sucesso`,
          accountType: accountType
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    } else {
      console.error('Account type verification failed:', verifyData);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'A atualização foi executada mas a verificação falhou' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      );
    }

  } catch (error) {
    console.error('Error na função de alteração de conta:', error);
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
