-- ============================================================================
-- FIX CRITICAL SECURITY ISSUES: Profiles Exposure & Match History Forgery
-- ============================================================================

-- ============================================================================
-- FIX 1: RESTRICT PROFILES TABLE ACCESS
-- ============================================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Public profiles viewable by all" ON public.profiles;

-- Create restricted policy: Users can only view their own full profile
CREATE POLICY "Users view own complete profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Create secure function for leaderboard data (only exposes necessary fields)
CREATE OR REPLACE FUNCTION public.get_leaderboard(limit_count int DEFAULT 50)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  points int,
  wins int,
  losses int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT user_id, username, avatar_url, points, wins, losses
  FROM public.profiles
  ORDER BY points DESC, wins DESC
  LIMIT limit_count;
$$;

-- Create secure function for user search (for friends feature)
CREATE OR REPLACE FUNCTION public.search_users(search_term text, limit_count int DEFAULT 20)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  points int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT user_id, username, avatar_url, points
  FROM public.profiles
  WHERE username ILIKE '%' || search_term || '%'
  ORDER BY points DESC
  LIMIT limit_count;
$$;

-- Create function to get basic profile info (for opponent display)
CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id uuid)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  points int,
  wins int,
  losses int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT user_id, username, avatar_url, points, wins, losses
  FROM public.profiles
  WHERE user_id = p_user_id
  LIMIT 1;
$$;

-- ============================================================================
-- FIX 2: PREVENT MATCH HISTORY FORGERY
-- ============================================================================

-- Remove the dangerous open INSERT policy
DROP POLICY IF EXISTS "System insert match history" ON public.match_history;

-- Create secure function to record match results with validation
CREATE OR REPLACE FUNCTION public.record_match_result(
  p_duel_id uuid,
  p_player1_id uuid,
  p_player2_id uuid,
  p_winner_id uuid,
  p_player1_score int,
  p_player2_score int,
  p_bet_amount int
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
  v_duel_status game_status;
  v_duel_creator uuid;
  v_duel_opponent uuid;
  v_winner_new_points int;
  v_loser_new_points int;
BEGIN
  -- Validate that the caller is one of the players
  IF auth.uid() NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Unauthorized: You must be a participant in this duel';
  END IF;

  -- Validate that winner is one of the players
  IF p_winner_id NOT IN (p_player1_id, p_player2_id) THEN
    RAISE EXCEPTION 'Invalid winner: Must be one of the players';
  END IF;

  -- Verify the duel exists and get its details
  SELECT status, creator_id, opponent_id
  INTO v_duel_status, v_duel_creator, v_duel_opponent
  FROM public.live_duels
  WHERE id = p_duel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duel not found';
  END IF;

  -- Verify duel is in correct state
  IF v_duel_status != 'in_progress' AND v_duel_status != 'finished' THEN
    RAISE EXCEPTION 'Duel must be in progress or finished to record results';
  END IF;

  -- Verify player IDs match duel participants
  IF NOT ((v_duel_creator = p_player1_id AND v_duel_opponent = p_player2_id) OR
          (v_duel_creator = p_player2_id AND v_duel_opponent = p_player1_id)) THEN
    RAISE EXCEPTION 'Player IDs do not match duel participants';
  END IF;

  -- Insert match history record
  INSERT INTO public.match_history (
    player1_id,
    player2_id,
    winner_id,
    player1_score,
    player2_score,
    bet_amount
  ) VALUES (
    p_player1_id,
    p_player2_id,
    p_winner_id,
    p_player1_score,
    p_player2_score,
    p_bet_amount
  )
  RETURNING id INTO v_match_id;

  -- Update winner stats
  UPDATE public.profiles
  SET 
    wins = wins + 1,
    points = points + p_bet_amount
  WHERE user_id = p_winner_id;

  -- Update loser stats
  UPDATE public.profiles
  SET 
    losses = losses + 1,
    points = GREATEST(points - p_bet_amount, 0)
  WHERE user_id = CASE 
    WHEN p_winner_id = p_player1_id THEN p_player2_id 
    ELSE p_player1_id 
  END;

  RETURN v_match_id;
END;
$$;

-- ============================================================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_leaderboard(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_match_result(uuid, uuid, uuid, uuid, int, int, int) TO authenticated;