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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('[MercadoPago Webhook] Received:', JSON.stringify(body));

    const { type, data, action } = body;

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
      headers: { 'Authorization': `Bearer ${mpAccessToken}` },
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
    console.log('[MercadoPago Webhook] Payment status:', payment.status, 'ID:', payment.id, 'external_reference:', payment.external_reference);

    const isPaid = payment.status === 'approved';

    // Pedido do marketplace (produto físico pago em dinheiro)
    if (typeof payment.external_reference === 'string' && payment.external_reference.startsWith('mkt|')) {
      const purchaseId = payment.external_reference.split('|')[1];
      const { data: mktOrder } = await supabase
        .from('marketplace_purchases')
        .select('*, marketplace_products(name, stock)')
        .eq('id', purchaseId)
        .maybeSingle();

      if (!mktOrder) {
        return new Response(JSON.stringify({ message: 'Marketplace order not found' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!isPaid) {
        await supabase
          .from('marketplace_purchases')
          .update({ status: payment.status === 'pending' ? 'awaiting_payment' : 'cancelled', external_payment_id: String(paymentId) })
          .eq('id', mktOrder.id);
        return new Response(JSON.stringify({ message: 'Marketplace status updated' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (mktOrder.status !== 'pending' && mktOrder.status !== 'awaiting_payment') {
        return new Response(JSON.stringify({ message: 'Already processed' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase
        .from('marketplace_purchases')
        .update({
          status: 'pending',
          paid_at: new Date().toISOString(),
          external_payment_id: String(paymentId),
          payment_provider: 'mercadopago',
        })
        .eq('id', mktOrder.id);

      const currentStock = (mktOrder as any).marketplace_products?.stock;
      if (typeof currentStock === 'number') {
        await supabase
          .from('marketplace_products')
          .update({ stock: Math.max(0, currentStock - (mktOrder.quantity || 1)) })
          .eq('id', mktOrder.product_id);
      }

      await supabase.rpc('create_notification', {
        p_user_id: mktOrder.user_id,
        p_type: 'purchase',
        p_title: '📦 Pagamento confirmado!',
        p_message: `Seu pedido de ${(mktOrder as any).marketplace_products?.name || 'produto'} foi confirmado e será preparado para envio.`,
        p_data: { purchase_id: mktOrder.id },
      });

      return new Response(JSON.stringify({ success: true, marketplace: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SECURITY: Match order strictly by our order ID in external_reference
    // Format: For duelcoins, external_reference should be the order.id (UUID)
    // PIX flow: external_order_id = payment ID
    // Checkout Pro flow: external_order_id = preference ID
    let order = null;
    let orderError = null;

    // UUID regex for validation before querying (prevents 22P02 errors)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Try to find by external_order_id (PIX direct payment ID or Checkout Pro preference ID)
    const res1 = await supabase
      .from('duelcoins_orders')
      .select('*')
      .eq('external_order_id', String(paymentId))
      .maybeSingle();

    // Only use the order if it's not yet paid (allows crediting)
    if (res1.data && res1.data.status !== 'paid') {
      order = res1.data;
    }
    orderError = res1.error;

    // If not found and external_reference exists, try matching by it
    if (!order && payment.external_reference) {
      const externalRef = payment.external_reference;
      
      // First, try if external_reference is an order UUID
      if (uuidRegex.test(externalRef)) {
        const res2 = await supabase
          .from('duelcoins_orders')
          .select('*')
          .eq('id', externalRef)
          .maybeSingle();
        
        // Only use if not yet paid
        if (res2.data && res2.data.status !== 'paid') {
          order = res2.data;
        }
      } else {
        // Legacy format: "user_id|package_id"
        const parts = externalRef.split('|');
        if (parts.length === 2) {
          const [userId, packageId] = parts;
          // Validate both are UUIDs
          if (uuidRegex.test(userId) && uuidRegex.test(packageId)) {
            const res3 = await supabase
              .from('duelcoins_orders')
              .select('*')
              .eq('user_id', userId)
              .eq('package_id', packageId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            // Only use if not yet paid
            if (res3.data && res3.data.status !== 'paid') {
              order = res3.data;
            }
          }
        }
      }
    }

    if (!isPaid) {
      // Log the payment status but keep order findable (don't overwrite to rejected/in_process)
      // A later approval can still credit the order by its ID
      console.log('[MercadoPago Webhook] Payment not approved yet:', {
        payment_id: paymentId,
        status: payment.status,
        order_id: order?.id,
      });
      return new Response(JSON.stringify({ message: 'Payment not approved', status: payment.status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // SECURITY: Validar que o valor pago corresponde ao valor do pedido
    const orderAmount = Number(order.amount_brl);
    const paidAmount = Number(payment.transaction_amount);
    const currency = payment.currency_id;

    // Permitir pequena diferença de arredondamento (0.01)
    if (currency !== 'BRL' || Math.abs(paidAmount - orderAmount) > 0.01) {
      // Nित: Return 200 (not 400) to prevent MP from retrying forever
      // Flag the order for manual review
      console.error('[MercadoPago Webhook] AMOUNT MISMATCH - MANUAL REVIEW REQUIRED:', {
        order_id: order.id,
        user_id: order.user_id,
        expected_brl: orderAmount,
        received: paidAmount,
        currency: currency,
        payment_id: paymentId,
      });
      
      // Try to flag the order (may fail if constraint doesn't allow the status)
      try {
        await supabase
          .from('duelcoins_orders')
          .update({ 
            status: 'amount_mismatch',
            external_payment_id: String(paymentId),
          })
          .eq('id', order.id);
      } catch (e) {
        console.error('[MercadoPago Webhook] Could not update order status to amount_mismatch:', e);
      }
      
      return new Response(JSON.stringify({ 
        received: true,
        flagged: 'amount_mismatch',
        message: 'Order flagged for manual review'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SECURITY: Usar RPC restrito ao service_role para creditar (idempotente)
    const paymentMethodLabel = payment.payment_method_id || 'mercadopago';
    const { data: creditResult, error: rpcError } = await supabase.rpc('service_credit_duelcoins', {
      p_order_id: order.id,
      p_external_payment_id: String(paymentId),
      p_payment_method: paymentMethodLabel,
    });

    if (rpcError) {
      console.error('[MercadoPago Webhook] Error crediting DuelCoins:', rpcError);
      return new Response(JSON.stringify({ error: 'Failed to credit DuelCoins' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = creditResult as any;
    if (!result?.success) {
      console.error('[MercadoPago Webhook] Credit failed:', result?.message);
      return new Response(JSON.stringify({ error: result?.message || 'Failed to credit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Consume coupon now that payment is confirmed (no-op if none)
    if (order.coupon_code && !result.already_paid) {
      const { error: cErr } = await supabase.rpc('consume_coupon', { p_code: order.coupon_code });
      if (cErr) console.error('[MercadoPago Webhook] consume_coupon error:', cErr);
    }

    // Create notification (skip if already paid to avoid duplicate notifications)
    if (!result.already_paid) {
      await supabase.rpc('create_notification', {
        p_user_id: order.user_id,
        p_type: 'purchase',
        p_title: '💰 DuelCoins Creditados!',
        p_message: `Sua compra de ${order.duelcoins_amount} DuelCoins foi confirmada!`,
        p_data: { order_id: order.id, amount: order.duelcoins_amount },
      });
    }

    console.log('[MercadoPago Webhook] Successfully credited', order.duelcoins_amount, 'DuelCoins to user', order.user_id, 
                result.already_paid ? '(already paid)' : '');

    return new Response(JSON.stringify({ 
      success: true,
      already_paid: result.already_paid || false
    }), {
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
