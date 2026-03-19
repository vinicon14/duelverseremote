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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('[MercadoPago Webhook] Received:', JSON.stringify(body));

    // MercadoPago sends different notification types
    const { type, data, action } = body;

    // We only care about payment notifications
    if (type !== 'payment' && action !== 'payment.updated' && action !== 'payment.created') {
      return new Response(JSON.stringify({ message: 'Ignored event type' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const paymentId = data?.id;
    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'Missing payment ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch full payment details from MercadoPago API
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${mpAccessToken}`,
      },
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error('[MercadoPago Webhook] Error fetching payment:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch payment' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payment = await mpResponse.json();
    console.log('[MercadoPago Webhook] Payment status:', payment.status, 'ID:', payment.id);

    const isPaid = payment.status === 'approved';

    if (!isPaid) {
      // Update order status
      await supabase
        .from('duelcoins_orders')
        .update({ 
          status: payment.status || 'unknown', 
          external_payment_id: String(paymentId) 
        })
        .eq('external_order_id', String(paymentId));

      return new Response(JSON.stringify({ message: 'Status updated', status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find pending order
    const { data: order, error: orderError } = await supabase
      .from('duelcoins_orders')
      .select('*')
      .eq('external_order_id', String(paymentId))
      .eq('status', 'pending')
      .maybeSingle();

    if (orderError) {
      console.error('[MercadoPago Webhook] Error finding order:', orderError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!order) {
      console.log('[MercadoPago Webhook] No pending order found for:', paymentId);
      return new Response(JSON.stringify({ message: 'No pending order found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Credit DuelCoins
    const { error: rpcError } = await supabase.rpc('admin_manage_duelcoins', {
      p_user_id: order.user_id,
      p_amount: order.duelcoins_amount,
      p_operation: 'add',
      p_reason: `Compra via MercadoPago PIX - Pagamento #${paymentId}`,
    });

    if (rpcError) {
      console.error('[MercadoPago Webhook] Error crediting DuelCoins:', rpcError);
      return new Response(JSON.stringify({ error: 'Failed to credit DuelCoins' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark order as paid
    await supabase
      .from('duelcoins_orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        external_payment_id: String(paymentId),
      })
      .eq('id', order.id);

    // Create notification
    await supabase.rpc('create_notification', {
      p_user_id: order.user_id,
      p_type: 'purchase',
      p_title: '💰 DuelCoins Creditados!',
      p_message: `Sua compra de ${order.duelcoins_amount} DuelCoins foi confirmada!`,
      p_data: { order_id: order.id, amount: order.duelcoins_amount },
    });

    console.log('[MercadoPago Webhook] Successfully credited', order.duelcoins_amount, 'DuelCoins to user', order.user_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[MercadoPago Webhook] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
