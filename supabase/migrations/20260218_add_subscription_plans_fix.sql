-- Add plan_duration_type enum if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_duration_type') THEN
    CREATE TYPE plan_duration_type AS ENUM ('weekly', 'monthly', 'yearly');
  END IF;
END $$;

-- Create check_expired_subscriptions function if it doesn't exist
CREATE OR REPLACE FUNCTION check_expired_subscriptions()
RETURNS void AS $$
DECLARE
  v_expired_user RECORD;
  v_has_other_active BOOLEAN;
  v_expired_subscription_id UUID;
BEGIN
  FOR v_expired_user IN
    SELECT user_id, id
    FROM user_subscriptions
    WHERE is_active = true AND expires_at <= NOW()
  LOOP
    v_expired_subscription_id := v_expired_user.id;
    
    SELECT EXISTS (
      SELECT 1 FROM user_subscriptions
      WHERE user_id = v_expired_user.user_id
        AND is_active = true
        AND expires_at > NOW()
    ) INTO v_has_other_active;

    IF NOT v_has_other_active THEN
      UPDATE profiles
      SET account_type = 'free', updated_at = NOW()
      WHERE user_id = v_expired_user.user_id;
    END IF;

    UPDATE user_subscriptions
    SET is_active = false, updated_at = NOW()
    WHERE id = v_expired_subscription_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Insert default plans if they don't exist
INSERT INTO subscription_plans (name, description, image_url, price_duelcoins, duration_days, duration_type, is_active, is_featured)
VALUES 
  ('Plano Pro Semanal', 'Acesso completo aos recursos PRO por uma semana', NULL, 500, 7, 'weekly', true, false),
  ('Plano Pro Mensal', 'Acesso completo aos recursos PRO por um mês', NULL, 1500, 30, 'monthly', true, true),
  ('Plano Pro Anual', 'Acesso completo aos recursos PRO por um ano', NULL, 12000, 365, 'yearly', true, false)
ON CONFLICT DO NOTHING;
