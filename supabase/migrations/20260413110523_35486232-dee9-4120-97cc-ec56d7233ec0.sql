
-- Add consensus-based result columns to tournament_matches
ALTER TABLE public.tournament_matches 
  ADD COLUMN IF NOT EXISTS player1_result text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS player2_result text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conflict_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player1_reported boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS player2_reported boolean DEFAULT false;
