import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error("Not authenticated");

    const { package_id, language } = await req.json();
    if (!package_id) throw new Error("package_id is required");

    // Get package details
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: pkg, error: pkgError } = await supabaseAdmin
      .from("duelcoins_packages")
      .select("*")
      .eq("id", package_id)
      .eq("is_active", true)
      .single();

    if (pkgError || !pkg) throw new Error("Package not found");

    // Moeda de cobrança conforme o idioma do usuário (espelha src/utils/currency.ts)
    const RATES: Record<string, number> = { BRL: 1, USD: 0.19, EUR: 0.17 };
    const LANGUAGE_CURRENCY: Record<string, string> = {
      "pt-BR": "BRL",
      "pt-PT": "EUR",
      fr: "EUR",
      de: "EUR",
      it: "EUR",
      nl: "EUR",
      es: "EUR",
      pl: "EUR",
      en: "USD",
      ja: "USD",
      ko: "USD",
      zh: "USD",
      ru: "USD",
      tr: "USD",
      ar: "USD",
      id: "USD",
    };
    const lang = String(language || "en");
    const currency =
      LANGUAGE_CURRENCY[lang] || LANGUAGE_CURRENCY[lang.split("-")[0]] || "USD";
    const chargeAmount =
      currency === "BRL"
        ? Number(pkg.price_brl)
        : Math.max(1, Math.ceil(Number(pkg.price_brl) * RATES[currency])) - 0.01;

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Find or create Stripe customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    // Get origin for redirect URLs
    const origin = req.headers.get("origin") || "https://duelverse.site";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: pkg.name,
              description: `${pkg.duelcoins_amount} DuelCoins`,
            },
            unit_amount: Math.round(pkg.price_brl * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/buy-duelcoins?success=true`,
      cancel_url: `${origin}/buy-duelcoins?canceled=true`,
      metadata: {
        supabase_user_id: user.id,
        package_id: pkg.id,
        duelcoins_amount: String(pkg.duelcoins_amount),
      },
    });

    // Create order record
    await supabaseAdmin.from("duelcoins_orders").insert({
      user_id: user.id,
      package_id: pkg.id,
      amount_brl: pkg.price_brl,
      duelcoins_amount: pkg.duelcoins_amount,
      status: "pending",
      external_order_id: session.id,
      payment_method: "stripe",
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
