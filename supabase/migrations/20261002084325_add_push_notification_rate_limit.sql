-- Migration: Add rate limiting for push notifications
-- Created: 2026-10-02
-- Purpose: Track push notification requests per user for rate limiting

CREATE TABLE IF NOT EXISTS public.push_notification_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT push_notification_rate_limit_user_type_idx UNIQUE (user_id, created_at)
);

-- Index for efficient rate limit queries
CREATE INDEX IF NOT EXISTS push_notification_rate_limit_user_time_idx 
  ON public.push_notification_rate_limit (user_id, created_at DESC);

-- Auto-cleanup old entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_push_rate_limit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.push_notification_rate_limit
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$;

-- Enable RLS
ALTER TABLE public.push_notification_rate_limit ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limit entries
CREATE POLICY "Service role can manage rate limits"
  ON public.push_notification_rate_limit
  FOR ALL
  USING (false);
