-- Create function to handle subscription purchase with proper permissions
CREATE OR REPLACE FUNCTION public.purchase_subscription(p_user_id UUID, p_plan_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan RECORD;
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_subscription_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Get plan details
  SELECT * INTO v_plan 
  FROM subscription_plans 
  WHERE id = p_plan_id AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Plano não encontrado ou inativo');
  END IF;

  -- Get current balance
  SELECT duelcoins_balance INTO v_current_balance 
  FROM profiles 
  WHERE user_id = p_user_id;

  IF v_current_balance IS NULL OR v_current_balance < v_plan.price_duelcoins THEN
    RETURN json_build_object('success', false, 'message', 'Saldo insuficiente');
  END IF;

  -- Calculate new balance
  v_new_balance := v_current_balance - v_plan.price_duelcoins;
  
  -- Calculate expiration
  v_expires_at := now() + (v_plan.duration_days || ' days')::interval;

  -- Deactivate existing subscriptions
  UPDATE user_subscriptions 
  SET is_active = false 
  WHERE user_id = p_user_id AND is_active = true;

  -- Create new subscription
  INSERT INTO user_subscriptions (user_id, plan_id, is_active, starts_at, expires_at)
  VALUES (p_user_id, p_plan_id, true, now(), v_expires_at)
  RETURNING id INTO v_subscription_id;

  -- Update profile: set pro and deduct balance
  UPDATE profiles 
  SET account_type = 'pro', duelcoins_balance = v_new_balance, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'success', true, 
    'message', 'Assinatura ativada com sucesso!',
    'subscription_id', v_subscription_id, 
    'expires_at', v_expires_at,
    'new_balance', v_new_balance
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.purchase_subscription(UUID, UUID) TO authenticated;
