-- Add unique constraint on user_id for matchmaking_queue
ALTER TABLE public.matchmaking_queue 
ADD CONSTRAINT matchmaking_queue_user_id_key UNIQUE (user_id);