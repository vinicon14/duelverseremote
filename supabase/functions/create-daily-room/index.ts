/**
 * DuelVerse - Edge Function: Criar Sala Daily.co
 * Desenvolvido por Vinícius
 * 
 * Cria uma sala de videochamada usando a API do Daily.co.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomName } = await req.json();

    // Input validation
    if (!roomName || typeof roomName !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Room name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const roomNameRegex = /^[a-zA-Z0-9_-]{3,64}$/;
    if (!roomNameRegex.test(roomName)) {
      return new Response(
        JSON.stringify({ error: 'Invalid room name. Use 3-64 alphanumeric characters, hyphens, or underscores only.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');

    if (!DAILY_API_KEY) {
      throw new Error('DAILY_API_KEY not configured');
    }

    const encodedRoomName = encodeURIComponent(roomName);

    // Tentar obter sala existente primeiro
    const getResponse = await fetch(`https://api.daily.co/v1/rooms/${encodedRoomName}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    // Se a sala existir, retornar ela
    if (getResponse.ok) {
      const existingRoom = await getResponse.json();
      return new Response(
        JSON.stringify({ url: existingRoom.url, name: existingRoom.name }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se não existir, criar nova sala
    const createResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: {
          enable_screenshare: true,
          enable_chat: false,
          start_video_off: false,
          start_audio_off: false,
          max_participants: 20,
        },
      }),
    });

    if (!createResponse.ok) {
      console.error('Daily.co API error:', {
        status: createResponse.status,
        statusText: createResponse.statusText,
      });
      throw new Error(`Failed to create room: ${createResponse.status}`);
    }

    const data = await createResponse.json();

    return new Response(
      JSON.stringify({ url: data.url, name: data.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in create-daily-room:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({ error: 'Failed to create video room' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
