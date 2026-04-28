-- Auto-cleanup expired matchmaking queue entries to prevent ghost players in the counter

CREATE OR REPLACE FUNCTION public.cleanup_expired_matchmaking_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.matchmaking_queue
    WHERE expires_at < NOW()
       OR (status = 'matched' AND joined_at < NOW() - INTERVAL '5 minutes')
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_matchmaking_queue() TO anon, authenticated;

-- Trigger that opportunistically clears expired entries on every insert/update
CREATE OR REPLACE FUNCTION public.trigger_cleanup_matchmaking_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.matchmaking_queue
  WHERE expires_at < NOW()
     OR (status = 'matched' AND joined_at < NOW() - INTERVAL '5 minutes');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_cleanup_matchmaking_queue ON public.matchmaking_queue;
CREATE TRIGGER auto_cleanup_matchmaking_queue
AFTER INSERT ON public.matchmaking_queue
FOR EACH STATEMENT
EXECUTE FUNCTION public.trigger_cleanup_matchmaking_queue();

-- Initial cleanup right now
SELECT public.cleanup_expired_matchmaking_queue();