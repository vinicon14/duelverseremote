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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const dailyApiKey = Deno.env.get('DAILY_API_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      throw new Error('Não autorizado');
    }

    // Verificar se é admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!roleData) {
      throw new Error('Apenas administradores podem encerrar transmissões');
    }

    const { stream_id } = await req.json();

    // Buscar stream
    const { data: stream, error: streamError } = await supabase
      .from('live_streams')
      .select('*')
      .eq('id', stream_id)
      .single();

    if (streamError || !stream) {
      throw new Error('Transmissão não encontrada');
    }

    // Deletar sala Daily
    await fetch(`https://api.daily.co/v1/rooms/${stream.daily_room_name}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${dailyApiKey}`,
      },
    });

    // Atualizar stream
    const { error: updateError } = await supabase
      .from('live_streams')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('id', stream_id);

    if (updateError) throw updateError;

    // Atualizar participantes (marcar saída)
    await supabase
      .from('stream_participants')
      .update({ left_at: new Date().toISOString() })
      .eq('stream_id', stream_id)
      .is('left_at', null);

    console.log('Stream encerrada:', stream_id);

    return new Response(
      JSON.stringify({ success: true, message: 'Transmissão encerrada' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});