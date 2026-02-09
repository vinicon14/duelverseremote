import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleError, securityHeaders, sanitizeString } from '../_utils/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, ...securityHeaders } });
  }

  try {
    const { roomName } = await req.json();
    const sanitizedRoomName = sanitizeString(roomName, 100);
    const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');

    if (!DAILY_API_KEY) {
      return new Response(JSON.stringify({ error: 'DAILY_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!sanitizedRoomName) {
      return new Response(JSON.stringify({ error: 'roomName is required' }), {
        status: 400,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    const getResponse = await fetch(`https://api.daily.co/v1/rooms/${sanitizedRoomName}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${DAILY_API_KEY}` },
    });

    if (getResponse.ok) {
      const existingRoom = await getResponse.json();
      return new Response(JSON.stringify({ url: existingRoom.url, name: existingRoom.name }), {
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    const createResponse = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: sanitizedRoomName,
        privacy: 'private',
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
      const errorText = await createResponse.text();
      return new Response(JSON.stringify({ error: 'Failed to create room' }), {
        status: 500,
        headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await createResponse.json();
    return new Response(JSON.stringify({ url: data.url, name: data.name }), {
      headers: { ...corsHeaders, ...securityHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return handleError(error, 'create-daily-room');
  }
});
