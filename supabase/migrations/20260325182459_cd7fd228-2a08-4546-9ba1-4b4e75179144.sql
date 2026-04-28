
-- Auto-update duel status when players join
CREATE OR REPLACE FUNCTION public.auto_update_duel_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- When a new player joins (opponent_id, player3_id, or player4_id changes from NULL to a value)
  IF NEW.max_players = 2 AND NEW.opponent_id IS NOT NULL AND OLD.opponent_id IS NULL AND NEW.status = 'waiting' THEN
    NEW.status := 'in_progress';
  ELSIF NEW.max_players = 4 AND NEW.player4_id IS NOT NULL AND OLD.player4_id IS NULL AND NEW.status = 'waiting' THEN
    NEW.status := 'in_progress';
  ELSIF NEW.max_players = 3 AND NEW.player3_id IS NOT NULL AND OLD.player3_id IS NULL AND NEW.status = 'waiting' THEN
    NEW.status := 'in_progress';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_update_duel_status ON public.live_duels;
CREATE TRIGGER trigger_auto_update_duel_status
  BEFORE UPDATE ON public.live_duels
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_duel_status();
