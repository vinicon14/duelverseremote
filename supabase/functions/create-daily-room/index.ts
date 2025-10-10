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
    const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');

    if (!DAILY_API_KEY) {
      throw new Error('DAILY_API_KEY not configured');
    }

    console.log('Creating Daily.co room:', roomName);

    const response = await fetch('https://api.daily.co/v1/rooms', {
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
          max_participants: 2,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Daily.co API error:', error);
      throw new Error(`Failed to create room: ${error}`);
    }

    const data = await response.json();
    console.log('Room created successfully:', data.url);

    return new Response(
      JSON.stringify({ url: data.url, name: data.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in create-daily-room:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
