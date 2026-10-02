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
      // Sem token não dá para confirmar o pagamento na API do MP; 500 faz o MP reenviar depois
      console.error('[MercadoPago Webhook] MERCADOPAGO_ACCESS_TOKEN not configured');
      return new Response(JSON.stringify({ error: 'MercadoPago access token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
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

    // Try to find order by external_order_id (PIX direct) or by external_reference (Checkout Pro)
    let order = null;
    let orderError = null;

    // First try: PIX flow (external_order_id = payment ID)
    const res1 = await supabase
      .from('duelcoins_orders')
      .select('*')
      .eq('external_order_id', String(paymentId))
      .eq('status', 'pending')
      .maybeSingle();

    order = res1.data;
    orderError = res1.error;

    // Second try: UUID in external_reference (pedidos novos criados pelo servidor)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!order && payment.external_reference && uuidRegex.test(payment.external_reference)) {
      const res2 = await supabase
        .from('duelcoins_orders')
        .select('*')
        .eq('id', payment.external_reference)
        .eq('status', 'pending')
        .maybeSingle();
      
      order = res2.data;
      orderError = res2.error;
    }

    // Third try: Checkout Pro flow (external_reference = "user_id|package_id", order has preference_id as external_order_id)
    if (!order && payment.external_reference) {
      const [userId, packageId] = payment.external_reference.split('|');
      if (userId && packageId) {
        const res3 = await supabase
          .from('duelcoins_orders')
          .select('*')
          .eq('user_id', userId)
          .eq('package_id', packageId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        order = res3.data;
        orderError = res3.error;
      }
    }

    if (!isPaid) {
      // Update order status if found
      if (order) {
        await supabase
          .from('duelcoins_orders')
          .update({ status: payment.status || 'unknown', external_payment_id: String(paymentId) })
          .eq('id', order.id);
      }
      return new Response(JSON.stringify({ message: 'Status updated', status: payment.status }), {
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

    // Validar amount e currency
    const paidAmount = payment.transaction_details?.total_paid_amount || payment.transaction_amount || 0;
    const currency = payment.currency_id || '';
    const orderAmount = order.amount_brl || 0;

    // Permitir pequena diferença de arredondamento (0.01)
    if (currency !== 'BRL' || Math.abs(paidAmount - orderAmount) > 0.01) {
      // Responde 200 (não 400) para o MP não reenviar indefinidamente
      // Flag the order for manual review
      console.error('[MercadoPago Webhook] AMOUNT MISMATCH - MANUAL REVIEW REQUIRED:', {
        order_id: order.id,
        expected_amount: orderAmount,
        paid_amount: paidAmount,
        expected_currency: 'BRL',
        paid_currency: currency,
        payment_id: paymentId,
      });
      
      // Marca o pedido para revisão manual (status é texto livre, sem CHECK)
      const { error: flagError } = await supabase
        .from('duelcoins_orders')
        .update({
          status: 'amount_mismatch',
          external_payment_id: String(paymentId),
        })
        .eq('id', order.id);
      if (flagError) {
        console.error('[MercadoPago Webhook] Could not update order status to amount_mismatch:', flagError);
      }
      
      return new Response(JSON.stringify({ 
        message: 'Amount mismatch - flagged for manual review',
        order_id: order.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SECURITY: Use service_role restricted RPC to credit (idempotent, concurrency-safe)
    const paymentMethodLabel = payment.payment_method_id || 'mercadopago';
    const { data: creditResult, error: creditError } = await supabase.rpc('service_credit_duelcoins', {
      p_order_id: order.id,
      p_external_payment_id: String(paymentId),
      p_payment_method: paymentMethodLabel,
    });

    if (creditError) {
      console.error('[MercadoPago Webhook] RPC error:', creditError);
      return new Response(JSON.stringify({ error: 'Failed to credit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = creditResult as { success?: boolean; already_paid?: boolean; message?: string } | null;
    if (!result?.success) {
      console.error('[MercadoPago Webhook] Credit failed:', result?.message);
      return new Response(JSON.stringify({ error: result?.message || 'Failed to credit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[MercadoPago Webhook] Successfully credited', order.duelcoins_amount, 'DuelCoins to user', order.user_id,
                result.already_paid ? '(already paid)' : '');

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
