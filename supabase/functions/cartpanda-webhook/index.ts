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

    // Creditar DuelCoins ao usuário
    const { error: balanceError } = await supabase
      .from('profiles')
      .update({ duelcoins_balance: supabase.rpc ? undefined : undefined })
      .eq('user_id', order.user_id);

    // Usar RPC para adicionar DuelCoins de forma segura
    const { data: result, error: rpcError } = await supabase.rpc('admin_manage_duelcoins', {
      p_user_id: order.user_id,
      p_amount: order.duelcoins_amount,
      p_operation: 'add',
      p_reason: `Compra via CartPanda - Pedido #${orderId}`,
    });

    if (rpcError) {
      console.error('[CartPanda Webhook] Error crediting DuelCoins:', rpcError);
      return new Response(JSON.stringify({ error: 'Failed to credit DuelCoins' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Marcar pedido como pago
    await supabase
      .from('duelcoins_orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        external_payment_id: body.payment_id || body.transaction_id || null,
      })
      .eq('id', order.id);

    // Criar notificação para o usuário
    await supabase.rpc('create_notification', {
      p_user_id: order.user_id,
      p_type: 'purchase',
      p_title: '💰 DuelCoins Creditados!',
      p_message: `Sua compra de ${order.duelcoins_amount} DuelCoins foi confirmada!`,
      p_data: { order_id: order.id, amount: order.duelcoins_amount },
    });

    console.log('[CartPanda Webhook] Successfully credited', order.duelcoins_amount, 'DuelCoins to user', order.user_id);

    return new Response(JSON.stringify({ success: true, message: 'DuelCoins credited' }), {
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
});
