-- Create ENUM types for tournament properties
CREATE TYPE public.tournament_type AS ENUM ('single_elimination', 'double_elimination', 'swiss', 'duelcoins_entry', 'free_entry');
CREATE TYPE public.tournament_status AS ENUM ('open', 'ongoing', 'finished');
CREATE TYPE public.match_status AS ENUM ('pending', 'in_progress', 'completed', 'needs_judge');

-- Update existing tournaments table
ALTER TABLE public.tournaments
  ADD COLUMN type tournament_type NOT NULL DEFAULT 'free_entry',
  ADD COLUMN entry_fee INT NOT NULL DEFAULT 0,
  ADD COLUMN rounds INT NOT NULL DEFAULT 0,
  ADD COLUMN created_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  DROP COLUMN status,
  ADD COLUMN status tournament_status NOT NULL DEFAULT 'open';

-- Update RLS policy for tournaments to allow PRO users to create them
DROP POLICY IF EXISTS "Admins manage tournaments" ON public.tournaments;

CREATE POLICY "Pro users or Admins can create tournaments"
  ON public.tournaments FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT account_type FROM public.profiles WHERE user_id = auth.uid()) = 'pro' OR
    public.is_admin(auth.uid())
  );

CREATE POLICY "Admins can update and delete tournaments"
  ON public.tournaments FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- Create tournament_players table
CREATE TABLE public.tournament_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'registered', -- registered, active, eliminated
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

-- Add RLS for tournament_players
ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All view tournament players"
  ON public.tournament_players FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Users can join tournaments"
  ON public.tournament_players FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave tournaments"
  ON public.tournament_players FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage tournament players"
  ON public.tournament_players FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Create tournament_matches table
CREATE TABLE public.tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  round INT NOT NULL,
  match_number INT NOT NULL,
  player1_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  player2_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  winner_id UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  status match_status NOT NULL DEFAULT 'pending',
  daily_room_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, round, match_number)
);

-- Add RLS for tournament_matches
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All view tournament matches"
  ON public.tournament_matches FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Players in the match can update it"
  ON public.tournament_matches FOR UPDATE
  TO authenticated USING (auth.uid() = player1_id OR auth.uid() = player2_id);
CREATE POLICY "Admins manage tournament matches"
  ON public.tournament_matches FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));


-- Create judges table
CREATE TABLE public.judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL
);

-- Add RLS for judges
ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All view active judges"
  ON public.judges FOR SELECT
  TO authenticated USING (is_active = true);
CREATE POLICY "Admins manage judges"
  ON public.judges FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Add 'judge' to the app_role ENUM
-- Note: This is a bit of a hack. In a real scenario, you'd want a more robust way to manage ENUMs.
ALTER TYPE public.app_role RENAME TO app_role_old;
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'judge');
ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role USING role::text::public.app_role;
DROP TYPE public.app_role_old;
