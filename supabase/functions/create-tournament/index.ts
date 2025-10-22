import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.31.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  console.log('create-tournament function invoked');
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('Creating Supabase client');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    console.log('Getting user');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('User not found');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }
    console.log('User found:', user.id);

    // Check if the user is an admin
    console.log('Checking user role');
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error('Error getting user roles:', rolesError);
      throw rolesError;
    }
    console.log('User roles:', userRoles);

    const isAdmin = userRoles?.some(role => role.role === 'admin');
    if (!isAdmin) {
      console.log('User is not an admin');
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }
    console.log('User is an admin');

    console.log('Parsing request body');
    const { tournamentData } = await req.json();
    console.log('Tournament data:', tournamentData);

    console.log('Inserting tournament');
    const { data, error } = await supabase
      .from('tournaments')
      .insert({ ...tournamentData, created_by: user.id })
      .select()
      .single();

    if (error) {
      console.error('Error inserting tournament:', error);
      return new Response(JSON.stringify({ error: error.message, details: error }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    console.log('Tournament inserted:', data);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201,
    });
  } catch (error) {
    console.error('Caught error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
