
-- Create subscription_plans table
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  price_duelcoins INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  duration_type TEXT NOT NULL DEFAULT 'monthly' CHECK (duration_type IN ('weekly', 'monthly', 'yearly')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Everyone can view active plans
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans
  FOR SELECT USING (is_active = true);

-- Admins can manage all plans
CREATE POLICY "Admins manage plans" ON public.subscription_plans
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Create user_subscriptions table
CREATE TABLE public.user_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscriptions
CREATE POLICY "Users view own subscriptions" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can manage all subscriptions
CREATE POLICY "Admins manage subscriptions" ON public.user_subscriptions
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- Create storage bucket for plan images
INSERT INTO storage.buckets (id, name, public) VALUES ('plan-images', 'plan-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for plan images
CREATE POLICY "Anyone can view plan images" ON storage.objects
  FOR SELECT USING (bucket_id = 'plan-images');

CREATE POLICY "Admins can upload plan images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'plan-images' AND is_admin(auth.uid()));

-- Create activate_subscription function
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

-- Create check_expired_subscriptions function
CREATE OR REPLACE FUNCTION public.check_expired_subscriptions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Deactivate expired subscriptions
  UPDATE user_subscriptions SET is_active = false
  WHERE is_active = true AND expires_at < now();

  -- Set account_type back to free for users with no active subscription
  UPDATE profiles SET account_type = 'free'
  WHERE account_type = 'pro'
    AND user_id NOT IN (
      SELECT user_id FROM user_subscriptions WHERE is_active = true AND expires_at >= now()
    )
    AND user_id NOT IN (
      SELECT user_id FROM user_roles WHERE role = 'admin'
    );
END;
$$;
