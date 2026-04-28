
-- Add unique constraint for upsert support
ALTER TABLE public.tournament_match_reports 
  ADD CONSTRAINT tournament_match_reports_match_reporter_unique 
  UNIQUE (match_id, reporter_id);
