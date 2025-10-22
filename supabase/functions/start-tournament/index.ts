import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.31.0';
import { corsHeaders } from '../_shared/cors.ts';

const dailyApiKey = Deno.env.get('DAILY_API_KEY');

async function createDailyRoom(match_id: string): Promise<string> {
  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${dailyApiKey}`,
    },
    body: JSON.stringify({
      name: `duelverse_match_${match_id}`,
      privacy: 'private',
      properties: {
        enable_chat: true,
        enable_knocking: false,
        start_audio_off: false,
        start_video_off: false,
        max_participants: 2,
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to create Daily.co room');
  }
  return data.url;
}


serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // Check if the user is an admin
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) throw rolesError;

    const isAdmin = userRoles?.some(role => role.role === 'admin');
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const { tournament_id } = await req.json();

    // 1. Get participants
    const { data: players, error: playersError } = await supabase
      .from('tournament_players')
      .select('user_id')
      .eq('tournament_id', tournament_id);

    if (playersError) throw playersError;
    if (players.length < 2) {
      return new Response(JSON.stringify({ error: 'Not enough players to start.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 2. Update tournament status
    const { error: updateError } = await supabase
      .from('tournaments')
      .update({ status: 'ongoing' })
      .eq('id', tournament_id);
    if (updateError) throw updateError;

    // 3. Shuffle players for random pairing
    const shuffledPlayers = players.sort(() => 0.5 - Math.random());

    // 4. Create matches
    const matchesToCreate = [];
    for (let i = 0; i < shuffledPlayers.length; i += 2) {
      if (i + 1 < shuffledPlayers.length) {
        matchesToCreate.push({
          tournament_id: tournament_id,
          round: 1,
          match_number: (i / 2) + 1,
          player1_id: shuffledPlayers[i].user_id,
          player2_id: shuffledPlayers[i + 1].user_id,
        });
      }
    }

    // 5. Insert matches and create Daily.co rooms
    const { data: createdMatches, error: matchesError } = await supabase
        .from('tournament_matches')
        .insert(matchesToCreate)
        .select();

    if (matchesError) throw matchesError;

    for (const match of createdMatches) {
        const roomUrl = await createDailyRoom(match.id);
        await supabase
            .from('tournament_matches')
            .update({ daily_room_url: roomUrl })
            .eq('id', match.id);
    }

    return new Response(JSON.stringify({ message: 'Tournament started and matches created.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
