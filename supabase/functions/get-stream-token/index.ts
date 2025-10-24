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

    const { stream_id, role } = await req.json();

    // Buscar stream
    const { data: stream, error: streamError } = await supabase
      .from('live_streams')
      .select('*')
      .eq('id', stream_id)
      .single();

    if (streamError || !stream) {
      throw new Error('Transmissão não encontrada');
    }

    // Determinar permissões baseado no role
    let permissions = {
      canSend: role === 'player' || role === 'commentator',
      canAdmin: false,
    };

    // Verificar se é judge ou admin
    const { data: judgeData } = await supabase
      .from('judges')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .maybeSingle();

    const { data: adminData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (judgeData || adminData) {
      permissions.canAdmin = true;
      permissions.canSend = true;
    }

    // Criar token Daily
    const tokenResponse = await fetch(`https://api.daily.co/v1/meeting-tokens`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${dailyApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: stream.daily_room_name,
          user_name: user.email?.split('@')[0] || 'User',
          is_owner: permissions.canAdmin,
          enable_screenshare: permissions.canSend,
          start_video_off: role === 'viewer',
          start_audio_off: role === 'viewer',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1h
        },
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokenData.error || 'Erro ao criar token');
    }

    // Registrar participante
    await supabase
      .from('stream_participants')
      .insert({
        stream_id,
        user_id: user.id,
        role,
      });

    console.log('Token criado para:', user.id, 'role:', role);

    return new Response(
      JSON.stringify({ 
        success: true, 
        token: tokenData.token,
        room_url: stream.daily_room_url,
        permissions
      }),
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