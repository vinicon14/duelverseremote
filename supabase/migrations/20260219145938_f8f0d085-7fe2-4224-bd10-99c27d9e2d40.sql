
CREATE OR REPLACE FUNCTION public.activate_subscription(p_user_id uuid, p_plan_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan RECORD;
  v_balance INTEGER;
  v_subscription_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Get plan details
  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Plano não encontrado ou inativo');
  END IF;

  -- Check user balance
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = p_user_id;
  IF v_balance IS NULL OR v_balance < v_plan.price_duelcoins THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente de DuelCoins');
  END IF;

  -- Deduct DuelCoins
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_plan.price_duelcoins WHERE user_id = p_user_id;

  -- Record transaction
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (p_user_id, v_plan.price_duelcoins, 'subscription', 'Compra de plano: ' || v_plan.name);

  -- Calculate expiration
  v_expires_at := now() + (v_plan.duration_days || ' days')::interval;

  -- Deactivate existing subscriptions
  UPDATE user_subscriptions SET is_active = false WHERE user_id = p_user_id AND is_active = true;

  -- Create new subscription
  INSERT INTO user_subscriptions (user_id, plan_id, is_active, starts_at, expires_at)
  VALUES (p_user_id, p_plan_id, true, now(), v_expires_at)
  RETURNING id INTO v_subscription_id;

  -- Set account type to pro
  UPDATE profiles SET account_type = 'pro' WHERE user_id = p_user_id;

  RETURN json_build_object('success', true, 'message', 'Assinatura ativada', 'subscription_id', v_subscription_id, 'expires_at', v_expires_at);
END;
$function$;
