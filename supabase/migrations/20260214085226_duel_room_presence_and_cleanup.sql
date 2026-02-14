-- Migration: Add duel room presence and cleanup fields
-- Created: 2026-02-14

-- Add last_activity_at column to track when room was last active
ALTER TABLE public.live_duels 
ADD COLUMN IF NOT EXISTS last_activity_at timestamp with time zone DEFAULT now();

-- Add creator_connected column to track creator online status
ALTER TABLE public.live_duels 
ADD COLUMN IF NOT EXISTS creator_connected boolean DEFAULT true;

-- Add opponent_connected column to track opponent online status  
ALTER TABLE public.live_duels 
ADD COLUMN IF NOT EXISTS opponent_connected boolean DEFAULT false;

-- Add empty_since column to track when room became empty
ALTER TABLE public.live_duels 
ADD COLUMN IF NOT EXISTS empty_since timestamp with time zone;

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_live_duels_last_activity 
ON public.live_duels(last_activity_at);

CREATE INDEX IF NOT EXISTS idx_live_duels_empty_since 
ON public.live_duels(empty_since) 
WHERE opponent_id IS NULL;

-- Function to automatically cleanup empty rooms after 3 minutes
CREATE OR REPLACE FUNCTION cleanup_empty_duel_rooms()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  room RECORD;
BEGIN
  -- Find rooms that have been empty for more than 3 minutes
  FOR room IN 
    SELECT id 
    FROM public.live_duels 
    WHERE opponent_id IS NULL 
      AND empty_since IS NOT NULL
      AND empty_since < now() - interval '3 minutes'
  LOOP
    -- Delete the empty room
    DELETE FROM public.live_duels WHERE id = room.id;
  END LOOP;
END;
$$;

-- Function to reset empty timer when player joins
CREATE OR REPLACE FUNCTION reset_empty_timer_on_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Reset empty_since when opponent joins
  IF NEW.opponent_id IS NOT NULL AND OLD.opponent_id IS NULL THEN
    NEW.empty_since := NULL;
    NEW.opponent_connected := true;
  END IF;
  
  -- Set empty_since when opponent leaves
  IF NEW.opponent_id IS NULL AND OLD.opponent_id IS NOT NULL THEN
    NEW.empty_since := now();
    NEW.opponent_connected := false;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for empty timer management
DROP TRIGGER IF EXISTS manage_empty_timer ON public.live_duels;
CREATE TRIGGER manage_empty_timer
  BEFORE UPDATE ON public.live_duels
  FOR EACH ROW
  EXECUTE FUNCTION reset_empty_timer_on_join();

-- Add comment explaining the columns
COMMENT ON COLUMN public.live_duels.last_activity_at IS 'Timestamp of last activity in the room';
COMMENT ON COLUMN public.live_duels.creator_connected IS 'Whether the creator is currently connected';
COMMENT ON COLUMN public.live_duels.opponent_connected IS 'Whether the opponent is currently connected';
COMMENT ON COLUMN public.live_duels.empty_since IS 'When the room became empty (no opponent)';
