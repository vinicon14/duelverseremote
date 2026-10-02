-- Push notification rate limit (used by the send-push-notification edge function)
-- Only the service role touches this table; quota is consumed atomically through
-- consume_push_notification_quota() and refunded by the function on failure.

CREATE TABLE IF NOT EXISTS public.push_notification_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_notification_rate_limit_user_created
  ON public.push_notification_rate_limit(user_id, created_at DESC);

-- RLS on with no policies: anon/authenticated can never read or write.
ALTER TABLE public.push_notification_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.push_notification_rate_limit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.push_notification_rate_limit TO service_role;

-- Atomically checks and consumes one unit of quota for p_user_id.
-- Returns the inserted row id, or NULL when the limit is reached.
CREATE OR REPLACE FUNCTION public.consume_push_notification_quota(
  p_user_id uuid,
  p_max integer DEFAULT 50,
  p_window interval DEFAULT interval '1 hour'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_id uuid;
BEGIN
  -- Serialize concurrent calls for the same user (released at end of transaction)
  PERFORM pg_advisory_xact_lock(hashtextextended('push_notification_rate_limit:' || p_user_id::text, 0));

  -- Housekeeping: drop this user's entries older than 1 day
  DELETE FROM public.push_notification_rate_limit
   WHERE user_id = p_user_id AND created_at < now() - interval '1 day';

  SELECT count(*) INTO v_count
    FROM public.push_notification_rate_limit
   WHERE user_id = p_user_id AND created_at >= now() - p_window;

  IF v_count >= p_max THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.push_notification_rate_limit (user_id)
  VALUES (p_user_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_push_notification_quota(uuid, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_push_notification_quota(uuid, integer, interval) TO service_role;
