ALTER TABLE public.discord_voice_rooms
  ADD COLUMN IF NOT EXISTS invite_url text;