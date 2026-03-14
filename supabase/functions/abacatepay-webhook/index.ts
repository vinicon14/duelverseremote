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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('[AbacatePay Webhook] Received:', JSON.stringify(body));

    // AbacatePay webhook format
    const event = body.event || body.type;
    const pixData = body.data || body;
    const paymentId = pixData.id || pixData.payment_id || pixData.pixQrCode?.id;
    const status = pixData.status || event;

    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'Missing payment ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if payment was approved/completed
    const approvedStatuses = ['paid', 'approved', 'completed', 'confirmed', 'PAID', 'APPROVED'];
    const approvedEvents = ['pixQrCode.paid', 'billing.paid', 'payment.confirmed'];
    const isPaid = approvedStatuses.includes(status?.toString()) || approvedEvents.includes(event);

    if (!isPaid) {
      // Update order status if exists
      await supabase
        .from('duelcoins_orders')
        .update({ status: status?.toLowerCase() || 'unknown', external_payment_id: String(paymentId) })
        .eq('external_order_id', String(paymentId));

      return new Response(JSON.stringify({ message: 'Status updated', status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find pending order by external_order_id
    const { data: order, error: orderError } = await supabase
      .from('duelcoins_orders')
      .select('*')
      .eq('external_order_id', String(paymentId))
      .eq('status', 'pending')
      .maybeSingle();

    if (orderError) {
      console.error('[AbacatePay Webhook] Error finding order:', orderError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!order) {
      console.log('[AbacatePay Webhook] No pending order found for:', paymentId);
      return new Response(JSON.stringify({ message: 'No pending order found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Credit DuelCoins via RPC
    const { error: rpcError } = await supabase.rpc('admin_manage_duelcoins', {
      p_user_id: order.user_id,
      p_amount: order.duelcoins_amount,
      p_operation: 'add',
      p_reason: `Compra via AbacatePay - Pedido #${paymentId}`,
    });

    if (rpcError) {
      console.error('[AbacatePay Webhook] Error crediting DuelCoins:', rpcError);
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

    console.log('[AbacatePay Webhook] Successfully credited', order.duelcoins_amount, 'DuelCoins to user', order.user_id);

    return new Response(JSON.stringify({ success: true, message: 'DuelCoins credited' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[AbacatePay Webhook] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
