-- ============================================
-- Fix: get_my_created_tournaments function
-- ============================================
-- Run this in Supabase SQL Editor to fix the error
-- "Could not find the function public.get_my_created_tournaments without parameters"

CREATE OR REPLACE FUNCTION get_my_created_tournaments()
RETURNS JSON AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT auth.uid() INTO v_user_id;
  
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', t.id,
        'name', t.name,
        'description', t.description,
        'status', t.status,
        'is_weekly', t.is_weekly,
        'start_date', t.start_date,
        'end_date', t.end_date,
        'prize_pool', t.prize_pool,
        'entry_fee', t.entry_fee,
        'current_round', t.current_round,
        'created_at', t.created_at,
        'participant_count', (
          SELECT COUNT(*) FROM tournament_participants tp 
          WHERE tp.tournament_id = t.id
        )
      )
    )
    FROM tournaments t
    WHERE t.created_by = v_user_id
    ORDER BY t.created_at DESC
  );
END;
$$ LANGUAGE plpgsql;
