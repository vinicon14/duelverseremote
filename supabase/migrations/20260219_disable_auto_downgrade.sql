-- Disable the check_expired_subscriptions function from automatically downgrading users
-- This function will now only update the subscription status, not the account_type

CREATE OR REPLACE FUNCTION public.check_expired_subscriptions()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only deactivate expired subscriptions, don't change account_type
  UPDATE user_subscriptions 
  SET is_active = false 
  WHERE is_active = true AND expires_at < now();
  
  -- Note: account_type should be changed manually by admin or remain as pro
  -- This prevents automatic downgrade for purchased subscriptions
END;
$$;
