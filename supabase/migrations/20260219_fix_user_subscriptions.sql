-- Add unique constraint for user_subscriptions
ALTER TABLE user_subscriptions ADD CONSTRAINT user_subscriptions_user_id_unique UNIQUE (user_id);
