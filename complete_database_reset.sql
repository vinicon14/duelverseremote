-- ============================================================================
-- RESET COMPLETO DO BANCO DE DADOS
-- ============================================================================
-- ATENÇÃO: Este script apaga TODOS os dados existentes!
-- Execute apenas se tiver certeza!
-- ============================================================================

-- PASSO 1: Remover todas as tabelas existentes
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.live_duels CASCADE;
DROP TABLE IF EXISTS public.match_history CASCADE;
DROP TABLE IF EXISTS public.advertisements CASCADE;
DROP TABLE IF EXISTS public.tournaments CASCADE;
DROP TABLE IF EXISTS public.news CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Remover enums
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.account_type CASCADE;
DROP TYPE IF EXISTS public.game_status CASCADE;
DROP TYPE IF EXISTS public.friend_request_status CASCADE;

-- Remover funções existentes
DROP FUNCTION IF EXISTS public.has_role CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.calculate_elo_change CASCADE;
DROP FUNCTION IF EXISTS public.is_admin CASCADE;

-- ============================================================================
-- PASSO 2: Criar ENUMs
-- ============================================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.account_type AS ENUM ('free', 'pro');
CREATE TYPE public.game_status AS ENUM ('waiting', 'in_progress', 'finished');
CREATE TYPE public.friend_request_status AS ENUM ('pending', 'accepted', 'rejected');

-- ============================================================================
-- PASSO 3: Criar tabela de perfis (profiles)
-- ============================================================================

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  username text UNIQUE NOT NULL,
  avatar_url text,
  account_type account_type DEFAULT 'free' NOT NULL,
  elo_rating integer DEFAULT 1000 NOT NULL,
  wins integer DEFAULT 0 NOT NULL,
  losses integer DEFAULT 0 NOT NULL,
  draws integer DEFAULT 0 NOT NULL,
  is_online boolean DEFAULT false NOT NULL,
  is_banned boolean DEFAULT false NOT NULL,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_elo_rating ON public.profiles(elo_rating DESC);
CREATE INDEX idx_profiles_is_online ON public.profiles(is_online);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 4: Criar tabela de roles (user_roles)
-- ============================================================================

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 5: Criar função SECURITY DEFINER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role::app_role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- ============================================================================
-- PASSO 6: Criar tabela de amizades
-- ============================================================================

CREATE TABLE public.friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  receiver_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  status friend_request_status DEFAULT 'pending' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(sender_id, receiver_id)
);

CREATE INDEX idx_friend_requests_sender ON public.friend_requests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status ON public.friend_requests(status);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 7: Criar tabela de duelos
-- ============================================================================

CREATE TABLE public.live_duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  opponent_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  status game_status DEFAULT 'waiting' NOT NULL,
  winner_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  stake_amount integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX idx_live_duels_creator ON public.live_duels(creator_id);
CREATE INDEX idx_live_duels_opponent ON public.live_duels(opponent_id);
CREATE INDEX idx_live_duels_status ON public.live_duels(status);

ALTER TABLE public.live_duels ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 8: Criar tabela de jogadores
-- ============================================================================

CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid REFERENCES public.live_duels(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  score integer DEFAULT 0 NOT NULL,
  is_ready boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(duel_id, user_id)
);

CREATE INDEX idx_players_duel ON public.players(duel_id);
CREATE INDEX idx_players_user ON public.players(user_id);

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 9: Criar tabela de histórico
-- ============================================================================

CREATE TABLE public.match_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  player2_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  winner_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  player1_score integer DEFAULT 0 NOT NULL,
  player2_score integer DEFAULT 0 NOT NULL,
  player1_elo_change integer DEFAULT 0 NOT NULL,
  player2_elo_change integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_match_history_player1 ON public.match_history(player1_id);
CREATE INDEX idx_match_history_player2 ON public.match_history(player2_id);
CREATE INDEX idx_match_history_created_at ON public.match_history(created_at DESC);

ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 10: Criar tabela de chat
-- ============================================================================

CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duel_id uuid REFERENCES public.live_duels(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
  message text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_chat_messages_duel ON public.chat_messages(duel_id);
CREATE INDEX idx_chat_messages_created_at ON public.chat_messages(created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 11: Criar tabela de anúncios
-- ============================================================================

CREATE TABLE public.advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  link_url text,
  is_active boolean DEFAULT true NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_advertisements_is_active ON public.advertisements(is_active);
CREATE INDEX idx_advertisements_display_order ON public.advertisements(display_order);

ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 12: Criar tabela de torneios
-- ============================================================================

CREATE TABLE public.tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  prize_pool integer DEFAULT 0 NOT NULL,
  max_participants integer DEFAULT 32 NOT NULL,
  status text DEFAULT 'upcoming' NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_tournaments_status ON public.tournaments(status);
CREATE INDEX idx_tournaments_start_date ON public.tournaments(start_date);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 13: Criar tabela de notícias
-- ============================================================================

CREATE TABLE public.news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  image_url text,
  author_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  is_published boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_news_is_published ON public.news(is_published);
CREATE INDEX idx_news_created_at ON public.news(created_at DESC);

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLÍTICAS RLS - PROFILES
-- ============================================================================

CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public profiles viewable" ON public.profiles FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- POLÍTICAS RLS - USER_ROLES
-- ============================================================================

CREATE POLICY "Admins manage user_roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- POLÍTICAS RLS - FRIEND_REQUESTS
-- ============================================================================

CREATE POLICY "Admins delete friend_requests" ON public.friend_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view friend_requests" ON public.friend_requests FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users create friend_requests" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users update friend_requests" ON public.friend_requests FOR UPDATE TO authenticated USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "Users delete friend_requests" ON public.friend_requests FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ============================================================================
-- POLÍTICAS RLS - LIVE_DUELS
-- ============================================================================

CREATE POLICY "Admins delete duels" ON public.live_duels FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view duels" ON public.live_duels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users create duels" ON public.live_duels FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Participants update duels" ON public.live_duels FOR UPDATE TO authenticated USING (auth.uid() = creator_id OR auth.uid() = opponent_id) WITH CHECK (auth.uid() = creator_id OR auth.uid() = opponent_id);

-- ============================================================================
-- POLÍTICAS RLS - PLAYERS
-- ============================================================================

CREATE POLICY "View players" ON public.players FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert own player" ON public.players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Update own player" ON public.players FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- POLÍTICAS RLS - MATCH_HISTORY
-- ============================================================================

CREATE POLICY "Admins delete history" ON public.match_history FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "View history" ON public.match_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert history" ON public.match_history FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- POLÍTICAS RLS - CHAT_MESSAGES
-- ============================================================================

CREATE POLICY "Admins delete messages" ON public.chat_messages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "View messages" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- ============================================================================
-- POLÍTICAS RLS - ADVERTISEMENTS
-- ============================================================================

CREATE POLICY "View ads" ON public.advertisements FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins manage ads" ON public.advertisements FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- POLÍTICAS RLS - TOURNAMENTS
-- ============================================================================

CREATE POLICY "View tournaments" ON public.tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage tournaments" ON public.tournaments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- POLÍTICAS RLS - NEWS
-- ============================================================================

CREATE POLICY "View published news" ON public.news FOR SELECT TO authenticated USING (is_published = true);
CREATE POLICY "Admins view all news" ON public.news FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage news" ON public.news FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================================
-- TRIGGER PARA CRIAR PERFIL AUTOMATICAMENTE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
BEGIN
  -- Criar perfil do usuário
  INSERT INTO public.profiles (user_id, username, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', '')
  );
  
  -- Verificar se é o primeiro usuário
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  
  -- Se for o primeiro usuário, torná-lo administrador
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin');
  END IF;
  
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- HABILITAR REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_duels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.live_duels REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;

-- ============================================================================
-- ✅ CONCLUÍDO!
-- ============================================================================
