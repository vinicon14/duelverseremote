
-- Update get_leaderboard to support tcg_type filtering from tcg_profiles
CREATE OR REPLACE FUNCTION public.get_leaderboard(limit_count integer DEFAULT 50, p_tcg_type text DEFAULT 'yugioh')
RETURNS TABLE(user_id uuid, username text, avatar_url text, wins integer, losses integer, points integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    tp.user_id,
    tp.username,
    tp.avatar_url,
    tp.wins,
    tp.losses,
    tp.points
  FROM public.tcg_profiles tp
  WHERE tp.tcg_type = p_tcg_type
  ORDER BY tp.points DESC, tp.wins DESC
  LIMIT limit_count;
$$;
