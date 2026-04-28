-- Create matchmaking queue table
CREATE TABLE IF NOT EXISTS public.matchmaking_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL CHECK (match_type IN ('ranked', 'casual')),
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'expired'))
);

-- Enable RLS
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;

-- Users can view all queue entries (to see how many people are waiting)
CREATE POLICY "Users can view queue entries"
ON public.matchmaking_queue
FOR SELECT
USING (true);

-- Users can insert their own queue entry
CREATE POLICY "Users can join queue"
ON public.matchmaking_queue
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own queue entry
CREATE POLICY "Users can update own queue entry"
ON public.matchmaking_queue
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own queue entry
CREATE POLICY "Users can leave queue"
ON public.matchmaking_queue
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_match_type ON public.matchmaking_queue(match_type);
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_status ON public.matchmaking_queue(status);
CREATE INDEX IF NOT EXISTS idx_matchmaking_queue_expires_at ON public.matchmaking_queue(expires_at);

-- Enable realtime for matchmaking queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;

-- Function to clean up expired queue entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_queue_entries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  DELETE FROM matchmaking_queue
  WHERE expires_at < NOW()
    OR (status = 'matched' AND joined_at < NOW() - INTERVAL '5 minutes');
END;
$$;