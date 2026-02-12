
-- Create get_my_tournaments function
CREATE OR REPLACE FUNCTION public.get_my_tournaments()
RETURNS TABLE(
  id uuid,
  name text,
  status text,
  is_weekly boolean,
  created_by uuid,
  current_round integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.status, COALESCE(t.is_weekly, false), t.created_by, t.current_round, t.created_at
  FROM tournaments t
  INNER JOIN tournament_participants tp ON tp.tournament_id = t.id
  WHERE tp.user_id = auth.uid()
  ORDER BY t.created_at DESC;
END;
$$;

-- Create get_my_created_tournaments function
CREATE OR REPLACE FUNCTION public.get_my_created_tournaments()
RETURNS TABLE(
  id uuid,
  name text,
  status text,
  is_weekly boolean,
  total_collected integer,
  prize_paid boolean,
  prize_pool integer,
  participant_count bigint,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id, t.name, t.status, 
    COALESCE(t.is_weekly, false),
    COALESCE(t.total_collected, 0),
    COALESCE(t.prize_paid, false),
    t.prize_pool,
    (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id),
    t.created_at
  FROM tournaments t
  WHERE t.created_by = auth.uid()
  ORDER BY t.created_at DESC;
END;
$$;

-- Create get_tournament_participants function
CREATE OR REPLACE FUNCTION public.get_tournament_participants(p_tournament_id uuid)
RETURNS TABLE(
  user_id uuid,
  username text,
  avatar_url text,
  is_online boolean,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tp.user_id,
    p.username,
    p.avatar_url,
    p.is_online,
    tp.registered_at
  FROM tournament_participants tp
  INNER JOIN profiles p ON p.user_id = tp.user_id
  WHERE tp.tournament_id = p_tournament_id
  ORDER BY tp.registered_at ASC;
END;
$$;

-- Create get_tournament_opponents function
CREATE OR REPLACE FUNCTION public.get_tournament_opponents(p_tournament_id uuid)
RETURNS TABLE(
  opponent_id uuid,
  opponent_username text,
  match_id uuid,
  round integer,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN tm.player1_id = v_user_id THEN tm.player2_id
      ELSE tm.player1_id
    END as opponent_id,
    p.username as opponent_username,
    tm.id as match_id,
    tm.round,
    tm.status
  FROM tournament_matches tm
  LEFT JOIN profiles p ON p.user_id = CASE 
    WHEN tm.player1_id = v_user_id THEN tm.player2_id
    ELSE tm.player1_id
  END
  WHERE tm.tournament_id = p_tournament_id
    AND (tm.player1_id = v_user_id OR tm.player2_id = v_user_id)
    AND tm.status IN ('pending', 'in_progress')
  ORDER BY tm.round ASC;
END;
$$;
