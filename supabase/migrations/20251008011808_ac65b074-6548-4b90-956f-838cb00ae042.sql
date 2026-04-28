-- ============================================================================
-- LIMPEZA COMPLETA DO BANCO DE DADOS
-- ============================================================================

-- Dropar tabelas existentes (isso remove automaticamente as políticas)
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.live_duels CASCADE;
DROP TABLE IF EXISTS public.match_history CASCADE;
DROP TABLE IF EXISTS public.friend_requests CASCADE;
DROP TABLE IF EXISTS public.advertisements CASCADE;
DROP TABLE IF EXISTS public.news CASCADE;
DROP TABLE IF EXISTS public.tournaments CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Dropar funções
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;

-- Dropar tipos
DROP TYPE IF EXISTS public.friend_request_status CASCADE;
DROP TYPE IF EXISTS public.game_status CASCADE;
DROP TYPE IF EXISTS public.account_type CASCADE;
DROP TYPE IF EXISTS public.app_role CASCADE;

-- ============================================================================
-- CRIAÇÃO DOS TIPOS ENUMERADOS
-- ============================================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.account_type AS ENUM ('free', 'pro');
CREATE TYPE public.game_status AS ENUM ('waiting', 'in_progress', 'finished');
CREATE TYPE public.friend_request_status AS ENUM ('pending', 'accepted', 'rejected');

-- ============================================================================
-- TABELA: PROFILES (Perfis dos Usuários)
-- ============================================================================

CREATE TABLE public.profiles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username text NOT NULL UNIQUE,
    avatar_url text,
    account_type account_type DEFAULT 'free' NOT NULL,
    points integer DEFAULT 0 NOT NULL,
    wins integer DEFAULT 0 NOT NULL,
    losses integer DEFAULT 0 NOT NULL,
    is_online boolean DEFAULT false NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    last_seen timestamptz DEFAULT now() NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20)
);

CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE INDEX idx_profiles_points ON public.profiles(points DESC);
CREATE INDEX idx_profiles_is_online ON public.profiles(is_online);
CREATE INDEX idx_profiles_account_type ON public.profiles(account_type);

-- ============================================================================
-- TABELA: USER_ROLES (Sistema de Permissões)
-- ============================================================================

CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(user_id, role)
);

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

-- ============================================================================
-- TABELA: FRIEND_REQUESTS (Solicitações de Amizade)
-- ============================================================================

CREATE TABLE public.friend_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    receiver_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    status friend_request_status DEFAULT 'pending' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT different_users CHECK (sender_id != receiver_id),
    CONSTRAINT unique_friend_request UNIQUE(sender_id, receiver_id)
);

CREATE INDEX idx_friend_requests_sender ON public.friend_requests(sender_id);
CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_status ON public.friend_requests(status);

-- ============================================================================
-- TABELA: LIVE_DUELS (Duelos Ativos)
-- ============================================================================

CREATE TABLE public.live_duels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    opponent_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    status game_status DEFAULT 'waiting' NOT NULL,
    bet_amount integer DEFAULT 0 NOT NULL,
    winner_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    started_at timestamptz,
    finished_at timestamptz,
    CONSTRAINT positive_bet CHECK (bet_amount >= 0),
    CONSTRAINT different_players CHECK (creator_id != opponent_id)
);

CREATE INDEX idx_live_duels_creator ON public.live_duels(creator_id);
CREATE INDEX idx_live_duels_opponent ON public.live_duels(opponent_id);
CREATE INDEX idx_live_duels_status ON public.live_duels(status);
CREATE INDEX idx_live_duels_created_at ON public.live_duels(created_at DESC);

-- ============================================================================
-- TABELA: PLAYERS (Jogadores em um Duelo)
-- ============================================================================

CREATE TABLE public.players (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    duel_id uuid REFERENCES public.live_duels(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    is_ready boolean DEFAULT false NOT NULL,
    joined_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT unique_player_in_duel UNIQUE(duel_id, user_id)
);

CREATE INDEX idx_players_duel ON public.players(duel_id);
CREATE INDEX idx_players_user ON public.players(user_id);

-- ============================================================================
-- TABELA: MATCH_HISTORY (Histórico de Partidas)
-- ============================================================================

CREATE TABLE public.match_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player1_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    player2_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    winner_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL NOT NULL,
    player1_score integer DEFAULT 0 NOT NULL,
    player2_score integer DEFAULT 0 NOT NULL,
    bet_amount integer DEFAULT 0 NOT NULL,
    played_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT different_match_players CHECK (player1_id != player2_id)
);

CREATE INDEX idx_match_history_player1 ON public.match_history(player1_id);
CREATE INDEX idx_match_history_player2 ON public.match_history(player2_id);
CREATE INDEX idx_match_history_winner ON public.match_history(winner_id);
CREATE INDEX idx_match_history_played_at ON public.match_history(played_at DESC);

-- ============================================================================
-- TABELA: CHAT_MESSAGES (Mensagens de Chat nos Duelos)
-- ============================================================================

CREATE TABLE public.chat_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    duel_id uuid REFERENCES public.live_duels(id) ON DELETE CASCADE NOT NULL,
    user_id uuid REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL,
    message text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT message_not_empty CHECK (char_length(trim(message)) > 0)
);

CREATE INDEX idx_chat_messages_duel ON public.chat_messages(duel_id, created_at);
CREATE INDEX idx_chat_messages_user ON public.chat_messages(user_id);

-- ============================================================================
-- TABELA: TOURNAMENTS (Torneios)
-- ============================================================================

CREATE TABLE public.tournaments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text,
    prize_pool integer DEFAULT 0 NOT NULL,
    max_participants integer NOT NULL,
    start_date timestamptz NOT NULL,
    end_date timestamptz NOT NULL,
    status text DEFAULT 'upcoming' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT valid_dates CHECK (end_date > start_date),
    CONSTRAINT positive_prize CHECK (prize_pool >= 0),
    CONSTRAINT positive_participants CHECK (max_participants > 0)
);

CREATE INDEX idx_tournaments_status ON public.tournaments(status);
CREATE INDEX idx_tournaments_start_date ON public.tournaments(start_date);

-- ============================================================================
-- TABELA: NEWS (Notícias)
-- ============================================================================

CREATE TABLE public.news (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    content text NOT NULL,
    image_url text,
    author_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_news_created_at ON public.news(created_at DESC);
CREATE INDEX idx_news_author ON public.news(author_id);

-- ============================================================================
-- TABELA: ADVERTISEMENTS (Anúncios)
-- ============================================================================

CREATE TABLE public.advertisements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    image_url text NOT NULL,
    link_url text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    expires_at timestamptz
);

CREATE INDEX idx_advertisements_is_active ON public.advertisements(is_active);
CREATE INDEX idx_advertisements_expires_at ON public.advertisements(expires_at);

-- ============================================================================
-- FUNÇÕES DE SEGURANÇA (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
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
      AND role = _role
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
-- POLÍTICAS RLS - PROFILES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles viewable by all" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users update own profile" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update any profile" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete any profile" 
ON public.profiles FOR DELETE 
TO authenticated 
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - USER_ROLES
-- ============================================================================

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own roles" 
ON public.user_roles FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Admins manage all roles" 
ON public.user_roles FOR ALL 
TO authenticated 
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - FRIEND_REQUESTS
-- ============================================================================

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own requests" 
ON public.friend_requests FOR SELECT 
TO authenticated 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users create requests" 
ON public.friend_requests FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users update received requests" 
ON public.friend_requests FOR UPDATE 
TO authenticated 
USING (auth.uid() = receiver_id)
WITH CHECK (auth.uid() = receiver_id);

CREATE POLICY "Users delete own requests" 
ON public.friend_requests FOR DELETE 
TO authenticated 
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Admins delete any request" 
ON public.friend_requests FOR DELETE 
TO authenticated 
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - LIVE_DUELS
-- ============================================================================

ALTER TABLE public.live_duels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view live duels" 
ON public.live_duels FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users create duels" 
ON public.live_duels FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Participants update duels" 
ON public.live_duels FOR UPDATE 
TO authenticated 
USING (auth.uid() = creator_id OR auth.uid() = opponent_id)
WITH CHECK (auth.uid() = creator_id OR auth.uid() = opponent_id);

CREATE POLICY "Creators delete duels" 
ON public.live_duels FOR DELETE 
TO authenticated 
USING (auth.uid() = creator_id);

CREATE POLICY "Admins delete any duel" 
ON public.live_duels FOR DELETE 
TO authenticated 
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - PLAYERS
-- ============================================================================

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view players" 
ON public.players FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users join duels" 
ON public.players FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players update own status" 
ON public.players FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- POLÍTICAS RLS - MATCH_HISTORY
-- ============================================================================

ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view match history" 
ON public.match_history FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "System insert match history" 
ON public.match_history FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Admins delete match history" 
ON public.match_history FOR DELETE 
TO authenticated 
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - CHAT_MESSAGES
-- ============================================================================

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view chat messages" 
ON public.chat_messages FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Users send messages" 
ON public.chat_messages FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own messages" 
ON public.chat_messages FOR DELETE 
TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Admins delete any message" 
ON public.chat_messages FOR DELETE 
TO authenticated 
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - TOURNAMENTS
-- ============================================================================

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view tournaments" 
ON public.tournaments FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins manage tournaments" 
ON public.tournaments FOR ALL 
TO authenticated 
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - NEWS
-- ============================================================================

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view news" 
ON public.news FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Admins manage news" 
ON public.news FOR ALL 
TO authenticated 
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - ADVERTISEMENTS
-- ============================================================================

ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All view active ads" 
ON public.advertisements FOR SELECT 
TO authenticated 
USING (is_active = true);

CREATE POLICY "Admins manage ads" 
ON public.advertisements FOR ALL 
TO authenticated 
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- TRIGGER: CRIAR PERFIL AUTOMATICAMENTE AO REGISTRAR
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  username_generated text;
  username_counter integer := 0;
BEGIN
  username_generated := split_part(NEW.email, '@', 1);
  username_generated := regexp_replace(username_generated, '[^a-zA-Z0-9]', '', 'g');
  username_generated := lower(substring(username_generated from 1 for 17));
  
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = username_generated) LOOP
    username_counter := username_counter + 1;
    username_generated := lower(substring(split_part(NEW.email, '@', 1) from 1 for 15)) || username_counter;
  END LOOP;

  INSERT INTO public.profiles (user_id, username, avatar_url)
  VALUES (
    NEW.id,
    username_generated,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text)
  );

  IF (SELECT COUNT(*) FROM public.profiles) = 1 THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

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