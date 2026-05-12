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

    const { package_id, coupon_code } = await req.json();

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

    // Get user email for MercadoPago
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('user_id', user.id)
      .single();

    // Apply coupon if provided
    let discountPercent = 0;
    let appliedCoupon: string | null = null;
    let finalPrice = Number(pkg.price_brl);
    if (coupon_code && typeof coupon_code === 'string' && coupon_code.trim().length > 0) {
      const { data: cpn, error: cpnErr } = await supabase.rpc('apply_coupon', { p_code: coupon_code.trim() });
      if (cpnErr || !cpn || !cpn[0]?.success) {
        return new Response(JSON.stringify({ error: 'Cupom inválido', detail: cpn?.[0]?.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      discountPercent = Number(cpn[0].discount_percent) || 0;
      appliedCoupon = coupon_code.trim().toUpperCase();
      finalPrice = Math.max(0.01, Number((finalPrice * (1 - discountPercent / 100)).toFixed(2)));
    }

    // Create MercadoPago payment
    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${user.id}-${package_id}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: finalPrice,
        description: `DuelCoins - ${pkg.name}${appliedCoupon ? ` (${appliedCoupon})` : ''}`,
        payment_method_id: 'pix',
        payer: {
          email: user.email || `${profile?.username || 'user'}@duelverse.app`,
        },
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
      }),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error('[MercadoPago] Error creating payment:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to create PIX payment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const mpData = await mpResponse.json();
    console.log('[MercadoPago] Payment created:', mpData.id, mpData.status);

    const pixInfo = mpData.point_of_interaction?.transaction_data;
    const qrCode = pixInfo?.qr_code;
    const qrCodeBase64 = pixInfo?.qr_code_base64;
    const ticketUrl = pixInfo?.ticket_url;

    // Create pending order
    const { error: orderError } = await supabase
      .from('duelcoins_orders')
      .insert({
        user_id: user.id,
        package_id: pkg.id,
        amount_brl: finalPrice,
        duelcoins_amount: pkg.duelcoins_amount,
        status: 'pending',
        external_order_id: String(mpData.id),
        payment_method: 'pix',
        coupon_code: appliedCoupon,
        discount_percent: discountPercent,
      });

    if (orderError) {
      console.error('[MercadoPago] Error creating order:', orderError);
      return new Response(JSON.stringify({ error: 'Failed to create order' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      payment_id: mpData.id,
      qr_code: qrCode,
      qr_code_base64: qrCodeBase64,
      ticket_url: ticketUrl,
      amount_brl: finalPrice,
      original_price_brl: pkg.price_brl,
      discount_percent: discountPercent,
      coupon_code: appliedCoupon,
      duelcoins_amount: pkg.duelcoins_amount,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[MercadoPago] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
