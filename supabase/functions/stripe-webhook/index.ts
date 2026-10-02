import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

serve(async (req) => {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    if (!signature) {
      console.error("Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // SECURITY: Verify signature using async method (sync fails on Deno)
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined,
        Stripe.createSubtleCryptoProvider()
      );
    } catch (err) {
      console.error("Invalid Stripe signature:", err instanceof Error ? err.message : err);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // SECURITY: Only credit if payment is actually paid
      if (session.payment_status !== "paid") {
        console.log("Payment not completed yet, status:", session.payment_status);
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      const userId = session.metadata?.supabase_user_id;
      if (!userId) {
        console.error("Missing metadata in session:", session.id);
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Localiza o pedido: primeiro pelo order_id gravado no metadata (UUID criado no servidor),
      // depois pelo session.id salvo em external_order_id (pedidos antigos).
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const metadataOrderId = session.metadata?.order_id;
      let order: { id: string; user_id: string; duelcoins_amount: number } | null = null;

      if (metadataOrderId && uuidRegex.test(metadataOrderId)) {
        const { data, error } = await supabase
          .from("duelcoins_orders")
          .select("id, user_id, duelcoins_amount")
          .eq("id", metadataOrderId)
          .maybeSingle();
        if (error) throw error;
        order = data;
      }

      if (!order) {
        const { data, error } = await supabase
          .from("duelcoins_orders")
          .select("id, user_id, duelcoins_amount")
          .eq("external_order_id", session.id)
          .maybeSingle();
        if (error) throw error;
        order = data;
      }

      if (!order) {
        console.error("Order not found for session:", session.id);
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      if (order.user_id !== userId) {
        console.error("Order user mismatch for session:", session.id, { order_user: order.user_id, metadata_user: userId });
        return new Response(JSON.stringify({ received: true, flagged: "user_mismatch" }), { status: 200 });
      }

      // SECURITY: Use service_role restricted RPC to credit (idempotent)
      const { data: creditResult, error: creditError } = await supabase.rpc("service_credit_duelcoins", {
        p_order_id: order.id,
        p_external_payment_id: session.payment_intent as string,
        p_payment_method: "stripe",
      });

      if (creditError) {
        console.error("Error crediting DuelCoins:", creditError);
        throw creditError;
      }

      const result = creditResult as { success?: boolean; already_paid?: boolean; message?: string } | null;
      if (!result?.success) {
        // 500 faz o Stripe reenviar o evento mais tarde
        console.error("Credit failed:", result?.message);
        return new Response(JSON.stringify({ error: result?.message || "Failed to credit" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      console.log(`✅ Credited ${order.duelcoins_amount} DuelCoins to user ${userId}`,
                  result.already_paid ? "(already paid)" : "");
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
