import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

serve(async (req) => {
  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // If webhook secret is set, verify signature; otherwise parse directly
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    let event: Stripe.Event;

    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } else {
      event = JSON.parse(body) as Stripe.Event;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.supabase_user_id;
      const packageId = session.metadata?.package_id;
      const duelcoinsAmount = parseInt(session.metadata?.duelcoins_amount || "0");

      if (!userId || !duelcoinsAmount) {
        console.error("Missing metadata in session:", session.id);
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Find order by external_order_id (Stripe session ID)
      const { data: order } = await supabase
        .from("duelcoins_orders")
        .select("*")
        .eq("external_order_id", session.id)
        .maybeSingle();

      if (!order) {
        console.error("Order not found for session:", session.id);
        return new Response(JSON.stringify({ received: true }), { status: 200 });
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

      const result = creditResult as any;
      console.log(`✅ Credited ${duelcoinsAmount} DuelCoins to user ${userId}`, 
                  result?.already_paid ? "(already paid)" : "");
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
