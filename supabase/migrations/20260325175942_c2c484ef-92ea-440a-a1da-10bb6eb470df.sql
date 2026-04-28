
-- Fix: just ensure realtime is already enabled (it was)
-- Verify columns exist
SELECT column_name FROM information_schema.columns WHERE table_name = 'live_duels' AND column_name IN ('player3_id', 'player4_id', 'max_players', 'custom_counters');
