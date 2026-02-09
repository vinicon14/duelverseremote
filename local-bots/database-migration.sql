-- SQL Migration for Bot System
-- Run this in Supabase SQL Editor

-- Create function to update tournament participant stats
CREATE OR REPLACE FUNCTION update_tournament_stats(
  p_user_id UUID,
  p_tournament_id UUID,
  p_is_win BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tournament_participants
  SET 
    wins = CASE WHEN p_is_win THEN wins + 1 ELSE wins END,
    losses = CASE WHEN NOT p_is_win THEN losses + 1 ELSE losses END,
    score = CASE 
      WHEN p_is_win THEN score + 3 
      ELSE score 
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND tournament_id = p_tournament_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION update_tournament_stats TO authenticated;

-- Create function to update user overall stats
CREATE OR REPLACE FUNCTION update_user_match_stats(
  p_user_id UUID,
  p_is_win BOOLEAN,
  p_duel_type TEXT DEFAULT 'friendly'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET 
    wins = CASE WHEN p_is_win THEN wins + 1 ELSE wins END,
    losses = CASE WHEN NOT p_is_win THEN losses + 1 ELSE losses END,
    win_rate = CASE 
      WHEN wins + losses + draws > 0 
      THEN ROUND((wins::numeric / (wins + losses + draws)) * 100, 2)
      ELSE 0 
    END,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_user_match_stats TO authenticated;

-- Insert test RPC functions for bot system
-- Function to get bot's tournament status
CREATE OR REPLACE FUNCTION get_bot_tournament_status(
  p_user_id UUID,
  p_tournament_id UUID
)
RETURNS TABLE (
  is_registered BOOLEAN,
  status TEXT,
  wins INTEGER,
  losses INTEGER,
  score INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tp.status IS NOT NULL,
    tp.status,
    COALESCE(tp.wins, 0),
    COALESCE(tp.losses, 0),
    COALESCE(tp.score, 0)
  FROM tournament_participants tp
  WHERE tp.user_id = p_user_id AND tp.tournament_id = p_tournament_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_bot_tournament_status TO authenticated;

-- Verify the functions were created
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines 
WHERE routine_name LIKE '%tournament%' 
   OR routine_name LIKE '%match%'
ORDER BY routine_name;
