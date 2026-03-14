import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const abacateApiKey = Deno.env.get('ABACATEPAY_API_KEY');
    
    if (!abacateApiKey) {
      return new Response(JSON.stringify({ error: 'AbacatePay API key not configured' }), {
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

    const { package_id } = await req.json();

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

    // Amount in cents for AbacatePay
    const amountCents = Math.round(pkg.price_brl * 100);

    // Create PIX QR Code via AbacatePay API
    const abacateResponse = await fetch('https://api.abacatepay.com/v1/pixQrCode/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${abacateApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountCents,
        expiresIn: 1800, // 30 minutes
        description: `DuelCoins - ${pkg.name}`,
      }),
    });

    if (!abacateResponse.ok) {
      const errorText = await abacateResponse.text();
      console.error('[AbacatePay] Error creating PIX:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to create PIX' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const abacateData = await abacateResponse.json();
    console.log('[AbacatePay] PIX created:', JSON.stringify(abacateData));

    const pixId = abacateData.data?.id || abacateData.id;
    const qrCodeImage = abacateData.data?.qrCodeImage || abacateData.qrCodeImage;
    const brCode = abacateData.data?.brCode || abacateData.brCode;

    // Create pending order
    const { error: orderError } = await supabase
      .from('duelcoins_orders')
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        amount_brl: pkg.price_brl,
        duelcoins_amount: pkg.duelcoins_amount,
        status: 'pending',
        external_order_id: String(pixId),
        payment_method: 'pix',
      });

    if (orderError) {
      console.error('[AbacatePay] Error creating order:', orderError);
      return new Response(JSON.stringify({ error: 'Failed to create order' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      pix_id: pixId,
      qr_code_image: qrCodeImage,
      br_code: brCode,
      amount_brl: pkg.price_brl,
      duelcoins_amount: pkg.duelcoins_amount,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[AbacatePay] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
