-- supabase/migrations/20251022055458_create_live_streaming_tables.sql

-- Tabela para armazenar informações sobre as transmissões ao vivo
CREATE TABLE public.lives (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id uuid NOT NULL REFERENCES public.live_duels(id) ON DELETE CASCADE,
    daily_room_url text NOT NULL,
    status text DEFAULT 'active' NOT NULL, -- 'active', 'finished'
    viewer_count integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    finished_at timestamptz
);

CREATE INDEX idx_lives_status ON public.lives(status);
CREATE INDEX idx_lives_match_id ON public.lives(match_id);

-- Tabela para registrar o acesso dos usuários às transmissões
CREATE TABLE public.live_access_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    live_id uuid NOT NULL REFERENCES public.lives(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    role text NOT NULL, -- 'player', 'commentator', 'viewer'
    join_time timestamptz DEFAULT now() NOT NULL,
    leave_time timestamptz
);

CREATE INDEX idx_live_access_logs_live_id ON public.live_access_logs(live_id);
CREATE INDEX idx_live_access_logs_user_id ON public.live_access_logs(user_id);

-- Habilitar RLS
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_access_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para a tabela 'lives'
CREATE POLICY "Public can view active lives"
ON public.lives FOR SELECT
TO authenticated
USING (status = 'active');

CREATE POLICY "Admins can manage lives"
ON public.lives FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Políticas de acesso para a tabela 'live_access_logs'
CREATE POLICY "Users can view their own access logs"
ON public.live_access_logs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all access logs"
ON public.live_access_logs FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Users can insert their own access logs"
ON public.live_access_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
