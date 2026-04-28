-- Create subscription_plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price_duelcoins INTEGER NOT NULL,
  duration_days INTEGER NOT NULL DEFAULT 30,
  duration_type TEXT NOT NULL DEFAULT 'monthly' CHECK (duration_type IN ('weekly', 'monthly', 'yearly')),
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, is_active)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at ON user_subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_is_active ON subscription_plans(is_active);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_plans
CREATE POLICY "subscription_plans_select" ON subscription_plans
  FOR SELECT USING (is_active = true);

CREATE POLICY "subscription_plans_all" ON subscription_plans
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  ));

-- RLS Policies for user_subscriptions
CREATE POLICY "user_subscriptions_select_own" ON user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_subscriptions_insert_own" ON user_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_subscriptions_all" ON user_subscriptions
  FOR ALL USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  ));

-- Create function to check if user is pro (considering active subscriptions)
CREATE OR REPLACE FUNCTION is_user_pro(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  is_pro BOOLEAN;
  has_active_subscription BOOLEAN;
BEGIN
  -- Check if user has pro account_type
  SELECT account_type = 'pro' INTO is_pro
  FROM profiles
  WHERE user_id = p_user_id;

  IF is_pro = true THEN
    RETURN true;
  END IF;

  -- Check if user has active subscription that hasn't expired
  SELECT EXISTS (
    SELECT 1 FROM user_subscriptions
    WHERE user_id = p_user_id
    AND is_active = true
    AND expires_at > NOW()
  ) INTO has_active_subscription;

  RETURN has_active_subscription;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to activate subscription
CREATE OR REPLACE FUNCTION activate_subscription(p_user_id UUID, p_plan_id UUID)
RETURNS JSON AS $$
DECLARE
  v_plan RECORD;
  v_expires_at TIMESTAMPTZ;
  v_subscription_id UUID;
BEGIN
  -- Get plan details
  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = p_plan_id AND is_active = true;

  IF v_plan IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Plan not found or inactive');
  END IF;

  -- Calculate expiration date
  CASE v_plan.duration_type
    WHEN 'weekly' THEN
      v_expires_at := NOW() + (v_plan.duration_days || ' days')::INTERVAL;
    WHEN 'monthly' THEN
      v_expires_at := NOW() + (v_plan.duration_days || ' days')::INTERVAL;
    WHEN 'yearly' THEN
      v_expires_at := NOW() + (v_plan.duration_days || ' days')::INTERVAL;
    ELSE
      v_expires_at := NOW() + (v_plan.duration_days || ' days')::INTERVAL;
  END CASE;

  -- Deactivate any existing active subscription
  UPDATE user_subscriptions
  SET is_active = false, updated_at = NOW()
  WHERE user_id = p_user_id AND is_active = true;

  -- Insert new subscription
  INSERT INTO user_subscriptions (user_id, plan_id, expires_at)
  VALUES (p_user_id, p_plan_id, v_expires_at)
  RETURNING id INTO v_subscription_id;

  -- Update user account_type to pro
  UPDATE profiles
  SET account_type = 'pro', updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'subscription_id', v_subscription_id,
    'expires_at', v_expires_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check and expire subscriptions
CREATE OR REPLACE FUNCTION check_expired_subscriptions()
RETURNS void AS $$
DECLARE
  v_expired_user RECORD;
  v_has_other_active BOOLEAN;
BEGIN
  FOR v_expired_user IN
    SELECT user_id
    FROM user_subscriptions
    WHERE is_active = true AND expires_at <= NOW()
  LOOP
    -- Check if user has other active subscriptions
    SELECT EXISTS (
      SELECT 1 FROM user_subscriptions
      WHERE user_id = v_expired_user.user_id
        AND is_active = true
        AND expires_at > NOW()
        AND id != (
          SELECT id FROM user_subscriptions
          WHERE user_id = v_expired_user.user_id
            AND is_active = true
            AND expires_at <= NOW()
          ORDER BY expires_at DESC
          LIMIT 1
        )
    ) INTO v_has_other_active;

    -- If no other active subscription, change account_type to free
    IF NOT v_has_other_active THEN
      UPDATE profiles
      SET account_type = 'free', updated_at = NOW()
      WHERE user_id = v_expired_user.user_id;
    END IF;

    -- Deactivate expired subscription
    UPDATE user_subscriptions
    SET is_active = false, updated_at = NOW()
    WHERE user_id = v_expired_user.user_id
      AND is_active = true
      AND expires_at <= NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Insert default plans
INSERT INTO subscription_plans (name, description, image_url, price_duelcoins, duration_days, duration_type, is_active, is_featured)
VALUES 
  ('Plano Pro Semanal', 'Acesso completo aos recursos PRO por uma semana', NULL, 500, 7, 'weekly', true, false),
  ('Plano Pro Mensal', 'Acesso completo aos recursos PRO por um mês', NULL, 1500, 30, 'monthly', true, true),
  ('Plano Pro Anual', 'Acesso completo aos recursos PRO por um ano', NULL, 12000, 365, 'yearly', true, false)
ON CONFLICT DO NOTHING;
