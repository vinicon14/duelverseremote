ALTER TABLE public.live_duels
  ADD COLUMN IF NOT EXISTS finalize_votes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS finalize_conflict_count integer NOT NULL DEFAULT 0;