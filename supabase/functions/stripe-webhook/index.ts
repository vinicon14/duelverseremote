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

      // Update order status
      await supabase
        .from("duelcoins_orders")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          external_payment_id: session.payment_intent as string,
        })
        .eq("external_order_id", session.id);

      // Credit DuelCoins to user
      await supabase.rpc("admin_manage_duelcoins", {
        p_user_id: userId,
        p_amount: duelcoinsAmount,
        p_operation: "add",
        p_reason: `Compra via Stripe - ${duelcoinsAmount} DuelCoins`,
      });

      console.log(`✅ Credited ${duelcoinsAmount} DuelCoins to user ${userId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});
