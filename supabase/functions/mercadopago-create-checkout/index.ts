import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');

    if (!mpAccessToken) {
      return new Response(JSON.stringify({ error: 'MercadoPago access token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { package_id, origin_url } = await req.json();

    // Get package details
    const { data: pkg, error: pkgError } = await supabase
      .from('duelcoins_packages')
      .select('*')
      .eq('id', package_id)
      .eq('is_active', true)
      .single();

    if (pkgError || !pkg) {
      return new Response(JSON.stringify({ error: 'Package not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create MercadoPago Preference (Checkout Pro) - supports card + PIX + boleto
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            title: `DuelCoins - ${pkg.name}`,
            description: `${pkg.duelcoins_amount} DuelCoins`,
            quantity: 1,
            unit_price: Number(pkg.price_brl),
            currency_id: 'BRL',
          },
        ],
        payer: {
          email: user.email || 'user@duelverse.app',
        },
        back_urls: {
          success: `${origin_url || 'https://duelverseremote.lovable.app'}/buy-duelcoins?success=true`,
          failure: `${origin_url || 'https://duelverseremote.lovable.app'}/buy-duelcoins?canceled=true`,
          pending: `${origin_url || 'https://duelverseremote.lovable.app'}/buy-duelcoins?success=true`,
        },
        auto_return: 'approved',
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
        external_reference: `${user.id}|${pkg.id}`,
        payment_methods: {
          excluded_payment_types: [],
          installments: 12,
        },
      }),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error('[MercadoPago Checkout] Error:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to create checkout' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mpData = await mpResponse.json();
    console.log('[MercadoPago Checkout] Preference created:', mpData.id);

    // Create pending order
    await supabase
      .from('duelcoins_orders')
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        amount_brl: pkg.price_brl,
        duelcoins_amount: pkg.duelcoins_amount,
        status: 'pending',
        external_order_id: mpData.id,
        payment_method: 'card',
      });

    return new Response(JSON.stringify({
      success: true,
      checkout_url: mpData.init_point,
      sandbox_url: mpData.sandbox_init_point,
      preference_id: mpData.id,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[MercadoPago Checkout] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
