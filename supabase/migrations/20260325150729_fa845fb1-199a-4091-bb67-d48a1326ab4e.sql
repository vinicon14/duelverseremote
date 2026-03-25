
-- Create tcg_profiles table for multi-TCG support
CREATE TABLE public.tcg_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tcg_type text NOT NULL DEFAULT 'yugioh',
  username text NOT NULL,
  avatar_url text,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  level integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, tcg_type)
);

-- Enable RLS
ALTER TABLE public.tcg_profiles ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Anyone can view tcg profiles" ON public.tcg_profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own tcg profiles" ON public.tcg_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tcg profiles" ON public.tcg_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage all tcg profiles" ON public.tcg_profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Migrate existing profiles to tcg_profiles as yugioh
INSERT INTO public.tcg_profiles (user_id, tcg_type, username, avatar_url, wins, losses, points, level)
SELECT user_id, 'yugioh', username, avatar_url, wins, losses, points, level
FROM public.profiles;

-- Add tcg_type to matchmaking_queue
ALTER TABLE public.matchmaking_queue ADD COLUMN IF NOT EXISTS tcg_type text NOT NULL DEFAULT 'yugioh';

-- Add tcg_type to global_chat_messages
ALTER TABLE public.global_chat_messages ADD COLUMN IF NOT EXISTS tcg_type text NOT NULL DEFAULT 'yugioh';

-- Add tcg_type to saved_decks
ALTER TABLE public.saved_decks ADD COLUMN IF NOT EXISTS tcg_type text NOT NULL DEFAULT 'yugioh';

-- Add tcg_type to tournaments
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS tcg_type text NOT NULL DEFAULT 'yugioh';

-- Add tcg_type to live_duels
ALTER TABLE public.live_duels ADD COLUMN IF NOT EXISTS tcg_type text NOT NULL DEFAULT 'yugioh';

-- Enable realtime for tcg_profiles
ALTER PUBLICATION supabase_realtime ADD TABLE public.tcg_profiles;
