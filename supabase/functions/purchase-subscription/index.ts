import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user from auth header
    const authHeader = req.headers.get("Authorization")!
    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const { plan_id } = await req.json()

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("id", plan_id)
      .eq("is_active", true)
      .single()

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ success: false, message: "Plano não encontrado ou inativo" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("duelcoins_balance")
      .eq("user_id", user.id)
      .single()

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, message: "Perfil não encontrado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Check balance
    if (profile.duelcoins_balance < plan.price_duelcoins) {
      return new Response(
        JSON.stringify({ success: false, message: "Saldo insuficiente" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Calculate expiration
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + plan.duration_days)

    // Deactivate existing subscriptions
    await supabase
      .from("user_subscriptions")
      .update({ is_active: false })
      .eq("user_id", user.id)
      .eq("is_active", true)

    // Create new subscription
    const { error: subError } = await supabase
      .from("user_subscriptions")
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        is_active: true,
        starts_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString()
      })

    if (subError) {
      console.error("Subscription error:", subError)
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao criar assinatura" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Update profile: set pro and deduct balance
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ 
        account_type: "pro", 
        duelcoins_balance: profile.duelcoins_balance - plan.price_duelcoins 
      })
      .eq("user_id", user.id)

    if (updateError) {
      console.error("Update error:", updateError)
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao atualizar perfil" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Assinatura ativada com sucesso!",
        expires_at: expiresAt.toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error("Error:", error)
    return new Response(
      JSON.stringify({ success: false, message: "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
