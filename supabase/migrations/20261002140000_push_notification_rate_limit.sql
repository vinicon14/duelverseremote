-- Push notification rate limit table
-- Tracks notification sends per user to prevent abuse
-- Retention: automatically cleaned up on queries (no TTL trigger needed)

CREATE TABLE IF NOT EXISTS public.push_notification_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for efficient rate limit checks (user_id + recent timestamps)
CREATE INDEX IF NOT EXISTS idx_push_notification_rate_limit_user_created 
  ON public.push_notification_rate_limit(user_id, created_at DESC);

-- RLS: users can only view their own rate limit entries
ALTER TABLE public.push_notification_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rate limit entries"
  ON public.push_notification_rate_limit
  FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies - only edge function with service role can write
