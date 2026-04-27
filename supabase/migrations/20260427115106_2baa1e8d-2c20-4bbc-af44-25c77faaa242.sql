ALTER TABLE public.matchmaking_invites
  ADD COLUMN IF NOT EXISTS discord_messages jsonb NOT NULL DEFAULT '[]'::jsonb;