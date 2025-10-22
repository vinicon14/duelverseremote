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
DROP TABLE IF EXISTS public.duelcoins_transactions CASCADE;
DROP TABLE IF EXISTS public.lives CASCADE;
DROP TABLE IF EXISTS public.live_access_logs CASCADE;
DROP TABLE IF EXISTS public.tournament_players CASCADE;
DROP TABLE IF EXISTS public.tournament_matches CASCADE;
DROP TABLE IF EXISTS public.judges CASCADE;


-- Remover enums
DROP TYPE IF EXISTS public.app_role CASCADE;
DROP TYPE IF EXISTS public.account_type CASCADE;
DROP TYPE IF EXISTS public.game_status CASCADE;
DROP TYPE IF EXISTS public.friend_request_status CASCADE;
DROP TYPE IF EXISTS public.tournament_type CASCADE;
DROP TYPE IF EXISTS public.tournament_status CASCADE;
DROP TYPE IF EXISTS public.match_status CASCADE;

-- Remover funções existentes
DROP FUNCTION IF EXISTS public.has_role CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
DROP FUNCTION IF EXISTS public.calculate_elo_change CASCADE;
DROP FUNCTION IF EXISTS public.is_admin CASCADE;
DROP FUNCTION IF EXISTS public.transfer_duelcoins CASCADE;

-- ============================================================================
-- PASSO 2: Criar ENUMs
-- ============================================================================

CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'judge');
CREATE TYPE public.account_type AS ENUM ('free', 'pro');
CREATE TYPE public.game_status AS ENUM ('waiting', 'in_progress', 'finished');
CREATE TYPE public.friend_request_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE public.tournament_type AS ENUM ('single_elimination', 'double_elimination', 'swiss', 'duelcoins_entry', 'free_entry');
CREATE TYPE public.tournament_status AS ENUM ('open', 'ongoing', 'finished');
CREATE TYPE public.match_status AS ENUM ('pending', 'in_progress', 'completed', 'needs_judge');

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
  duelcoins integer DEFAULT 100 NOT NULL,
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
  image_url text,
  type tournament_type NOT NULL DEFAULT 'free_entry',
  entry_fee INT NOT NULL DEFAULT 0,
  rounds INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  status tournament_status NOT NULL DEFAULT 'open',
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
-- PASSO 14: Criar tabela de transações de DuelCoins
-- ============================================================================
CREATE TABLE public.duelcoins_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id uuid REFERENCES public.profiles(user_id),
    receiver_id uuid REFERENCES public.profiles(user_id),
    amount integer NOT NULL,
    description text,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT duelcoins_transactions_amount_check CHECK ((amount > 0))
);

CREATE INDEX idx_duelcoins_transactions_sender_id ON public.duelcoins_transactions(sender_id);
CREATE INDEX idx_duelcoins_transactions_receiver_id ON public.duelcoins_transactions(receiver_id);

ALTER TABLE public.duelcoins_transactions ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- PASSO 15: Criar tabelas de streaming
-- ============================================================================
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

ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_access_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PASSO 16: Criar tabelas do sistema de torneios
-- ============================================================================
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
  created_at TIMESTAMptz NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, round, match_number)
);

ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;


CREATE TABLE public.judges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  assigned_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL
);

ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- POLÍTICAS RLS - PROFILES
-- ============================================================================

CREATE POLICY "Admins view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public profiles viewable" ON public.profiles FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- POLÍTICAS RLS - USER_ROLES
-- ============================================================================

CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage user_roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - FRIEND_REQUESTS
-- ============================================================================

CREATE POLICY "Admins delete friend_requests" ON public.friend_requests FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users view friend_requests" ON public.friend_requests FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Users create friend_requests" ON public.friend_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users update friend_requests" ON public.friend_requests FOR UPDATE TO authenticated USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "Users delete friend_requests" ON public.friend_requests FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ============================================================================
-- POLÍTICAS RLS - LIVE_DUELS
-- ============================================================================

CREATE POLICY "Admins delete duels" ON public.live_duels FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
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

CREATE POLICY "Admins delete history" ON public.match_history FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "View history" ON public.match_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert history" ON public.match_history FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================================
-- POLÍTICAS RLS - CHAT_MESSAGES
-- ============================================================================

CREATE POLICY "Admins delete messages" ON public.chat_messages FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "View messages" ON public.chat_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert messages" ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- ============================================================================
-- POLÍTICAS RLS - ADVERTISEMENTS
-- ============================================================================

CREATE POLICY "View ads" ON public.advertisements FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins manage ads" ON public.advertisements FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - TOURNAMENTS
-- ============================================================================

CREATE POLICY "View tournaments" ON public.tournaments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Pro users or Admins can create tournaments" ON public.tournaments FOR INSERT TO authenticated WITH CHECK (((SELECT account_type FROM public.profiles WHERE user_id = auth.uid()) = 'pro' OR public.is_admin(auth.uid())));
CREATE POLICY "Admins can update and delete tournaments" ON public.tournaments FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - NEWS
-- ============================================================================

CREATE POLICY "View published news" ON public.news FOR SELECT TO authenticated USING (is_published = true);
CREATE POLICY "Admins view all news" ON public.news FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage news" ON public.news FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - DUELCOINS_TRANSACTIONS
-- ============================================================================
CREATE POLICY "Users can view their own transactions" ON public.duelcoins_transactions FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Admins can view all transactions" ON public.duelcoins_transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));


-- ============================================================================
-- POLÍTICAS RLS - LIVES
-- ============================================================================
CREATE POLICY "Public can view active lives" ON public.lives FOR SELECT TO authenticated USING (status = 'active');
CREATE POLICY "Admins can manage lives" ON public.lives FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================================
-- POLÍTICAS RLS - LIVE_ACCESS_LOGS
-- ============================================================================
CREATE POLICY "Users can view their own access logs" ON public.live_access_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all access logs" ON public.live_access_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Users can insert their own access logs" ON public.live_access_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- POLÍTICAS RLS - TOURNAMENT_PLAYERS
-- ============================================================================
CREATE POLICY "All view tournament players" ON public.tournament_players FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join tournaments" ON public.tournament_players FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave tournaments" ON public.tournament_players FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage tournament players" ON public.tournament_players FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================================
-- POLÍTICAS RLS - TOURNAMENT_MATCHES
-- ============================================================================
CREATE POLICY "All view tournament matches" ON public.tournament_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Players in the match can update it" ON public.tournament_matches FOR UPDATE TO authenticated USING (auth.uid() = player1_id OR auth.uid() = player2_id);
CREATE POLICY "Admins manage tournament matches" ON public.tournament_matches FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


-- ============================================================================
-- POLÍTICAS RLS - JUDGES
-- ============================================================================
CREATE POLICY "All view active judges" ON public.judges FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins manage judges" ON public.judges FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));


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
-- FUNÇÃO PARA TRANSFERÊNCIA DE DUELCOINS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transfer_duelcoins(p_receiver_id uuid, p_amount integer)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
    sender_balance integer;
    sender_id uuid := auth.uid();
    result json;
BEGIN
    -- Verificar se o usuário está tentando enviar para si mesmo
    IF sender_id = p_receiver_id THEN
        result := json_build_object('success', false, 'message', 'Você não pode enviar DuelCoins para si mesmo.');
        RETURN result;
    END IF;

    -- Obter o saldo do remetente
    SELECT duelcoins INTO sender_balance FROM public.profiles WHERE user_id = sender_id;

    -- Verificar se o saldo é suficiente
    IF sender_balance < p_amount THEN
        result := json_build_object('success', false, 'message', 'Saldo de DuelCoins insuficiente.');
        RETURN result;
    END IF;

    -- Debitar do remetente
    UPDATE public.profiles SET duelcoins = duelcoins - p_amount WHERE user_id = sender_id;

    -- Creditar ao destinatário
    UPDATE public.profiles SET duelcoins = duelcoins + p_amount WHERE user_id = p_receiver_id;

    -- Registrar a transação
    INSERT INTO public.duelcoins_transactions(sender_id, receiver_id, amount, description)
    VALUES (sender_id, p_receiver_id, p_amount, 'Transferência entre jogadores');

    result := json_build_object('success', true, 'message', 'Transferência realizada com sucesso!');
    RETURN result;
END;
$$;


-- ============================================================================
-- HABILITAR REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_duels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournaments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_matches;


ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.live_duels REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;
ALTER TABLE public.tournaments REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_players REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_matches REPLICA IDENTITY FULL;

-- ============================================================================
-- ✅ CONCLUÍDO!
-- ============================================================================
