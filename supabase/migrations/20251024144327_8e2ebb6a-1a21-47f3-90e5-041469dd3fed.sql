-- Tabela de transmissões ao vivo
CREATE TABLE IF NOT EXISTS public.live_streams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.live_duels(id) ON DELETE CASCADE,
  daily_room_name TEXT NOT NULL,
  daily_room_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  viewers_count INTEGER DEFAULT 0,
  recording_enabled BOOLEAN DEFAULT false,
  recording_url TEXT,
  featured BOOLEAN DEFAULT false,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de participantes da transmissão
CREATE TABLE IF NOT EXISTS public.stream_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stream_id UUID NOT NULL REFERENCES public.live_streams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('player', 'commentator', 'viewer')),
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  left_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de participantes dos torneios
CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  score INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'active', 'eliminated', 'winner')),
  seed INTEGER,
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tournament_id, user_id)
);

-- Tabela de partidas dos torneios
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  match_number INTEGER NOT NULL,
  player1_id UUID,
  player2_id UUID,
  winner_id UUID,
  player1_score INTEGER DEFAULT 0,
  player2_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'bye')),
  daily_room_url TEXT,
  stream_id UUID REFERENCES public.live_streams(id),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de juízes
CREATE TABLE IF NOT EXISTS public.judges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  active BOOLEAN DEFAULT true,
  assigned_match_id UUID REFERENCES public.tournament_matches(id),
  total_matches_judged INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de logs de ações dos juízes
CREATE TABLE IF NOT EXISTS public.judge_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  judge_id UUID NOT NULL REFERENCES public.judges(id),
  match_id UUID REFERENCES public.tournament_matches(id),
  stream_id UUID REFERENCES public.live_streams(id),
  action_type TEXT NOT NULL CHECK (action_type IN ('pause', 'resume', 'warning', 'validate_result', 'enter_room', 'leave_room')),
  target_user_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Atualizar tabela de torneios
ALTER TABLE public.tournaments 
  DROP COLUMN IF EXISTS participants,
  ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'single_elimination' CHECK (tournament_type IN ('single_elimination', 'double_elimination', 'swiss', 'round_robin')),
  ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'free' CHECK (entry_type IN ('free', 'duelcoins')),
  ADD COLUMN IF NOT EXISTS current_round INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_rounds INTEGER,
  ADD COLUMN IF NOT EXISTS min_participants INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS rules TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_live_streams_status ON public.live_streams(status);
CREATE INDEX IF NOT EXISTS idx_live_streams_featured ON public.live_streams(featured);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON public.tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament ON public.tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON public.tournament_matches(status);
CREATE INDEX IF NOT EXISTS idx_judges_active ON public.judges(active);

-- RLS Policies para live_streams
ALTER TABLE public.live_streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Live streams são visíveis para todos"
  ON public.live_streams FOR SELECT
  USING (true);

CREATE POLICY "Apenas admins podem criar streams"
  ON public.live_streams FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Apenas admins podem atualizar streams"
  ON public.live_streams FOR UPDATE
  USING (is_admin(auth.uid()));

CREATE POLICY "Apenas admins podem deletar streams"
  ON public.live_streams FOR DELETE
  USING (is_admin(auth.uid()));

-- RLS Policies para stream_participants
ALTER TABLE public.stream_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participantes são visíveis para todos"
  ON public.stream_participants FOR SELECT
  USING (true);

CREATE POLICY "Usuários podem se registrar como viewers"
  ON public.stream_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role = 'viewer');

CREATE POLICY "Usuários podem atualizar sua participação"
  ON public.stream_participants FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies para tournament_participants
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participantes são visíveis para todos"
  ON public.tournament_participants FOR SELECT
  USING (true);

CREATE POLICY "Usuários podem se inscrever em torneios"
  ON public.tournament_participants FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins podem gerenciar participantes"
  ON public.tournament_participants FOR ALL
  USING (is_admin(auth.uid()));

-- RLS Policies para tournament_matches
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partidas são visíveis para todos"
  ON public.tournament_matches FOR SELECT
  USING (true);

CREATE POLICY "Apenas admins podem criar partidas"
  ON public.tournament_matches FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Apenas admins e juízes podem atualizar partidas"
  ON public.tournament_matches FOR UPDATE
  USING (is_admin(auth.uid()) OR is_judge(auth.uid()));

-- RLS Policies para judges
ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Juízes são visíveis para todos"
  ON public.judges FOR SELECT
  USING (true);

CREATE POLICY "Apenas admins podem gerenciar juízes"
  ON public.judges FOR ALL
  USING (is_admin(auth.uid()));

-- RLS Policies para judge_actions
ALTER TABLE public.judge_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ações dos juízes são visíveis para todos"
  ON public.judge_actions FOR SELECT
  USING (true);

CREATE POLICY "Juízes podem registrar suas ações"
  ON public.judge_actions FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.judges WHERE user_id = auth.uid() AND active = true
  ));