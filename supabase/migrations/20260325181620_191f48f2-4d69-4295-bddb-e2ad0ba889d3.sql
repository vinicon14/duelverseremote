
-- Add 4-player support columns to live_duels
ALTER TABLE public.live_duels 
  ADD COLUMN IF NOT EXISTS player3_id uuid,
  ADD COLUMN IF NOT EXISTS player4_id uuid,
  ADD COLUMN IF NOT EXISTS player3_lp integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS player4_lp integer NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS custom_counters jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Add max_players to matchmaking_queue
ALTER TABLE public.matchmaking_queue
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 2;

-- Recreate update policy for all 4 players
DROP POLICY IF EXISTS "Participants update duels v2" ON public.live_duels;

CREATE POLICY "Participants update duels v3" ON public.live_duels
FOR UPDATE TO authenticated
USING (
  auth.uid() = creator_id 
  OR auth.uid() = opponent_id 
  OR auth.uid() = player3_id 
  OR auth.uid() = player4_id
  OR (opponent_id IS NULL AND auth.uid() <> creator_id)
)
WITH CHECK (
  auth.uid() = creator_id 
  OR auth.uid() = opponent_id 
  OR auth.uid() = player3_id 
  OR auth.uid() = player4_id
  OR (opponent_id IS NULL AND auth.uid() <> creator_id)
);
