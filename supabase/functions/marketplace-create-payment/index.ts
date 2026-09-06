// DuelVerse - Checkout em dinheiro (Mercado Pago) para produtos físicos do marketplace
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const mpAccessToken = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!mpAccessToken) return json({ error: 'MercadoPago não configurado' }, 500);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return json({ error: 'Invalid token' }, 401);

    const body = await req.json().catch(() => ({}));
    const productId = str(body.product_id, 64);
    const quantity = Math.min(10, Math.max(1, Number(body.quantity) || 1));
    const originUrl = str(body.origin_url, 200) || 'https://duelverse.site';
    const s = body.shipping || {};

    const shipping = {
      name: str(s.name, 120),
      phone: str(s.phone, 20),
      zip: str(s.zip, 12),
      address: str(s.address, 200),
      number: str(s.number, 20),
      complement: str(s.complement, 100),
      district: str(s.district, 100),
      city: str(s.city, 100),
      state: str(s.state, 40),
    };

    if (!productId) return json({ error: 'Produto inválido' }, 400);
    const missing = (['name', 'phone', 'zip', 'address', 'number', 'city', 'state'] as const).filter((k) => !shipping[k]);
    if (missing.length) return json({ error: 'Dados de entrega incompletos', fields: missing }, 400);

    const { data: product, error: prodErr } = await supabase
      .from('marketplace_products')
      .select('*')
      .eq('id', productId)
      .eq('is_active', true)
      .eq('payment_type', 'money')
      .maybeSingle();

    if (prodErr || !product) return json({ error: 'Produto não encontrado' }, 404);
    if (!product.price_brl || Number(product.price_brl) <= 0) return json({ error: 'Produto sem preço' }, 400);
    if (product.stock !== null && product.stock < quantity) return json({ error: 'Estoque insuficiente' }, 400);

    const unitPrice = Number(Number(product.price_brl).toFixed(2));
    const total = Number((unitPrice * quantity).toFixed(2));

    const { data: purchase, error: purchaseErr } = await supabase
      .from('marketplace_purchases')
      .insert({
        user_id: user.id,
        product_id: product.id,
        quantity,
        total_price: 0,
        amount_brl: total,
        payment_provider: 'mercadopago',
        status: 'awaiting_payment',
        buyer_email: user.email,
        shipping_name: shipping.name,
        shipping_phone: shipping.phone,
        shipping_zip: shipping.zip,
        shipping_address: shipping.address,
        shipping_number: shipping.number,
        shipping_complement: shipping.complement,
        shipping_district: shipping.district,
        shipping_city: shipping.city,
        shipping_state: shipping.state,
      })
      .select('id')
      .single();

    if (purchaseErr || !purchase) {
      console.error('[Marketplace Payment] insert error:', purchaseErr);
      return json({ error: 'Falha ao criar pedido' }, 500);
    }

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mpAccessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          title: product.name,
          description: (product.description || '').slice(0, 200) || product.name,
          quantity,
          unit_price: unitPrice,
          currency_id: 'BRL',
        }],
        payer: {
          name: shipping.name,
          email: user.email || 'user@duelverse.app',
          phone: { number: shipping.phone },
          address: {
            zip_code: shipping.zip.replace(/\D/g, ''),
            street_name: shipping.address,
            street_number: shipping.number,
          },
        },
        back_urls: {
          success: `${originUrl}/my-orders?success=true`,
          failure: `${originUrl}/marketplace?canceled=true`,
          pending: `${originUrl}/my-orders?pending=true`,
        },
        auto_return: 'approved',
        notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
        external_reference: `mkt|${purchase.id}`,
        payment_methods: { installments: 12 },
      }),
    });

    if (!mpResponse.ok) {
      console.error('[Marketplace Payment] MP error:', await mpResponse.text());
      await supabase.from('marketplace_purchases').update({ status: 'cancelled' }).eq('id', purchase.id);
      return json({ error: 'Falha ao criar checkout' }, 500);
    }

    const mpData = await mpResponse.json();
    await supabase.from('marketplace_purchases').update({ external_order_id: mpData.id }).eq('id', purchase.id);

    return json({ success: true, checkout_url: mpData.init_point, purchase_id: purchase.id });
  } catch (error) {
    console.error('[Marketplace Payment] Error:', error);
    return json({ error: 'Internal server error' }, 500);
  }
});
