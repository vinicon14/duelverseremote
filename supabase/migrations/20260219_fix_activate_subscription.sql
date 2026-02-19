-- Create updated activate_subscription function without transaction insert
CREATE OR REPLACE FUNCTION public.activate_subscription(p_user_id UUID, p_plan_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_plan RECORD;
  v_subscription_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Get plan details
  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Plano não encontrado ou inativo');
  END IF;

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
$$;
