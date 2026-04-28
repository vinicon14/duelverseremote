-- Add duel_id column to matchmaking_queue table
ALTER TABLE public.matchmaking_queue 
ADD COLUMN IF NOT EXISTS duel_id uuid REFERENCES public.live_duels(id) ON DELETE CASCADE;