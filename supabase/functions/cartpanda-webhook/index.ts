import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // DEPRECATED: Owner no longer uses CartPanda
  // Webhook disabled permanently - always return 410 Gone
  console.log('[CartPanda Webhook] DISABLED: Owner no longer uses CartPanda service');
  return new Response(JSON.stringify({ 
    error: 'CartPanda webhook is no longer supported. Owner has migrated to other payment providers.' 
  }), {
    status: 410,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  // Dead code below preserved for reference (never executed)
  /* 
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('[CartPanda Webhook] Received:', JSON.stringify(body));

    // CartPanda envia diferentes formatos de webhook
    // Extrair dados relevantes
    const orderId = body.id || body.order_id || body.external_id;
    const status = body.status || body.payment_status;
    const email = body.email || body.customer?.email;

    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Missing order ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verificar se é um pagamento aprovado
    const approvedStatuses = ['paid', 'approved', 'completed', 'confirmed'];
    const isPaid = approvedStatuses.includes(status?.toLowerCase());

    if (!isPaid) {
      // Atualizar status do pedido se existir
      await supabase
        .from('duelcoins_orders')
        .update({ status: status?.toLowerCase() || 'unknown', external_order_id: String(orderId) })
        .eq('external_order_id', String(orderId));

      return new Response(JSON.stringify({ message: 'Status updated', status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar pedido pendente pelo external_order_id
    const { data: order, error: orderError } = await supabase
      .from('duelcoins_orders')
      .select('*')
      .eq('external_order_id', String(orderId))
      .eq('status', 'pending')
      .maybeSingle();

    if (orderError) {
      console.error('[CartPanda Webhook] Error finding order:', orderError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!order) {
      console.log('[CartPanda Webhook] No pending order found for:', orderId);
      return new Response(JSON.stringify({ message: 'No pending order found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SECURITY: Usar RPC restrito ao service_role para creditar
    const { data: creditResult, error: rpcError } = await supabase.rpc('service_credit_duelcoins', {
      p_order_id: order.id,
      p_external_payment_id: body.payment_id || body.transaction_id || null,
      p_payment_method: 'cartpanda',
    });

    if (rpcError) {
      console.error('[CartPanda Webhook] Error crediting DuelCoins:', rpcError);
      return new Response(JSON.stringify({ error: 'Failed to credit DuelCoins' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = creditResult as any;
    if (!result?.success) {
      console.error('[CartPanda Webhook] Credit failed:', result?.message);
      return new Response(JSON.stringify({ error: result?.message || 'Failed to credit' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Criar notificação para o usuário
    await supabase.rpc('create_notification', {
      p_user_id: order.user_id,
      p_type: 'purchase',
      p_title: '💰 DuelCoins Creditados!',
      p_message: `Sua compra de ${order.duelcoins_amount} DuelCoins foi confirmada!`,
      p_data: { order_id: order.id, amount: order.duelcoins_amount },
    });

    console.log('[CartPanda Webhook] Successfully credited', order.duelcoins_amount, 'DuelCoins to user', order.user_id);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'DuelCoins credited',
      already_paid: result.already_paid || false
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[CartPanda Webhook] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  */
});
