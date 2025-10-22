-- supabase/migrations/20251022120003_add_tournament_tables.sql

DROP TYPE IF EXISTS public.tournament_type CASCADE;
CREATE TYPE public.tournament_type AS ENUM ('single_elimination', 'double_elimination', 'swiss', 'duelcoins_entry', 'free_entry');
DROP TYPE IF EXISTS public.tournament_status CASCADE;
CREATE TYPE public.tournament_status AS ENUM ('open', 'ongoing', 'finished');
DROP TYPE IF EXISTS public.match_status CASCADE;
CREATE TYPE public.match_status AS ENUM ('pending', 'in_progress', 'completed', 'needs_judge');

CREATE TABLE IF NOT EXISTS public.tournaments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    start_date timestamptz NOT NULL,
    end_date timestamptz NOT NULL,
    prize_pool integer DEFAULT 0 NOT NULL,
    max_participants integer DEFAULT 32 NOT NULL,
    image_url text,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS type tournament_type NOT NULL DEFAULT 'free_entry',
  ADD COLUMN IF NOT EXISTS entry_fee INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rounds INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status tournament_status NOT NULL DEFAULT 'open';

DROP POLICY IF EXISTS "Admins can update and delete tournaments" ON public.tournaments;
DROP POLICY IF EXISTS "Pro users or Admins can create tournaments" ON public.tournaments;
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

DROP POLICY IF EXISTS "All view tournament players" ON public.tournament_players;
DROP POLICY IF EXISTS "Users can join tournaments" ON public.tournament_players;
DROP POLICY IF EXISTS "Users can leave tournaments" ON public.tournament_players;
DROP POLICY IF EXISTS "Admins manage tournament players" ON public.tournament_players;
DROP TABLE IF EXISTS public.tournament_players CASCADE;
CREATE TABLE public.tournament_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  score INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'registered', -- registered, active, eliminated
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

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

DROP POLICY IF EXISTS "All view tournament matches" ON public.tournament_matches;
DROP POLICY IF EXISTS "Players in the match can update it" ON public.tournament_matches;
DROP POLICY IF EXISTS "Admins manage tournament matches" ON public.tournament_matches;
DROP TABLE IF EXISTS public.tournament_matches CASCADE;
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

DROP POLICY IF EXISTS "All view active judges" ON public.judges;
DROP POLICY IF EXISTS "Admins manage judges" ON public.judges;
DROP TABLE IF EXISTS public.judges CASCADE;
CREATE TABLE public.judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL
);

ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All view active judges"
  ON public.judges FOR SELECT
  TO authenticated USING (is_active = true);
CREATE POLICY "Admins manage judges"
  ON public.judges FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
