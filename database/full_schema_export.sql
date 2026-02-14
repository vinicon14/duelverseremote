-- ============================================================================
-- DUELVERSE - FULL SCHEMA EXPORT
-- Para importar em um projeto Supabase próprio
-- Gerado em: 2026-02-14
-- ============================================================================

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

CREATE TYPE public.account_type AS ENUM ('free', 'pro');
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'judge');
CREATE TYPE public.friend_request_status AS ENUM ('pending', 'accepted', 'rejected');
CREATE TYPE public.game_status AS ENUM ('waiting', 'in_progress', 'finished');

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- profiles
CREATE TABLE public.profiles (
  user_id UUID NOT NULL PRIMARY KEY,
  username TEXT NOT NULL,
  avatar_url TEXT,
  account_type account_type NOT NULL DEFAULT 'free',
  points INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  is_online BOOLEAN NOT NULL DEFAULT false,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duelcoins_balance INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT profiles_username_key UNIQUE (username)
);

-- user_roles
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
);

-- live_duels
CREATE TABLE public.live_duels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL,
  opponent_id UUID,
  status game_status NOT NULL DEFAULT 'waiting',
  bet_amount INTEGER NOT NULL DEFAULT 0,
  winner_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  player1_lp INTEGER NOT NULL DEFAULT 8000,
  player2_lp INTEGER NOT NULL DEFAULT 8000,
  is_ranked BOOLEAN NOT NULL DEFAULT true,
  duration_minutes INTEGER NOT NULL DEFAULT 50,
  is_timer_paused BOOLEAN NOT NULL DEFAULT false,
  remaining_seconds INTEGER,
  room_name TEXT,
  CONSTRAINT live_duels_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(user_id),
  CONSTRAINT live_duels_opponent_id_fkey FOREIGN KEY (opponent_id) REFERENCES public.profiles(user_id),
  CONSTRAINT live_duels_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(user_id)
);

-- players
CREATE TABLE public.players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duel_id UUID NOT NULL,
  user_id UUID NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  is_ready BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_player_in_duel UNIQUE (duel_id, user_id),
  CONSTRAINT players_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.live_duels(id),
  CONSTRAINT players_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
);

-- chat_messages
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  duel_id UUID NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chat_messages_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.live_duels(id),
  CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(user_id)
);

-- friend_requests
CREATE TABLE public.friend_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  status friend_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_friend_request UNIQUE (sender_id, receiver_id),
  CONSTRAINT friend_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(user_id),
  CONSTRAINT friend_requests_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(user_id)
);

-- match_history
CREATE TABLE public.match_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player1_id UUID NOT NULL,
  player2_id UUID NOT NULL,
  winner_id UUID,
  player1_score INTEGER NOT NULL DEFAULT 0,
  player2_score INTEGER NOT NULL DEFAULT 0,
  bet_amount INTEGER NOT NULL DEFAULT 0,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT match_history_player1_id_fkey FOREIGN KEY (player1_id) REFERENCES public.profiles(user_id),
  CONSTRAINT match_history_player2_id_fkey FOREIGN KEY (player2_id) REFERENCES public.profiles(user_id),
  CONSTRAINT match_history_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.profiles(user_id)
);

-- tournaments
CREATE TABLE public.tournaments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming',
  prize_pool INTEGER NOT NULL DEFAULT 0,
  max_participants INTEGER NOT NULL,
  min_participants INTEGER DEFAULT 2,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_fee INTEGER NOT NULL DEFAULT 0,
  total_prize INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  current_round INTEGER DEFAULT 0,
  total_rounds INTEGER,
  is_weekly BOOLEAN DEFAULT false,
  total_collected INTEGER DEFAULT 0,
  prize_paid BOOLEAN DEFAULT false,
  type TEXT DEFAULT 'single_elimination',
  tournament_type TEXT DEFAULT 'single_elimination',
  entry_type TEXT DEFAULT 'free',
  rules TEXT
);

-- tournament_participants
CREATE TABLE public.tournament_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL,
  user_id UUID NOT NULL,
  score INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  seed INTEGER,
  registered_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'registered',
  CONSTRAINT tournament_participants_tournament_id_user_id_key UNIQUE (tournament_id, user_id),
  CONSTRAINT tournament_participants_tournament_user_unique UNIQUE (tournament_id, user_id),
  CONSTRAINT tournament_participants_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

-- tournament_matches
CREATE TABLE public.tournament_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL,
  player1_id UUID,
  player2_id UUID,
  winner_id UUID,
  round INTEGER NOT NULL,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  match_deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',
  CONSTRAINT tournament_matches_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

-- tournament_match_reports
CREATE TABLE public.tournament_match_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  reporter_id UUID NOT NULL,
  result TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tournament_match_reports_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.tournament_matches(id)
);

-- tournament_players
CREATE TABLE public.tournament_players (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'active',
  CONSTRAINT tournament_players_tournament_id_user_id_key UNIQUE (tournament_id, user_id),
  CONSTRAINT tournament_players_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

-- tournament_chat_messages
CREATE TABLE public.tournament_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id UUID NOT NULL,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- duelcoins_transactions
CREATE TABLE public.duelcoins_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID,
  receiver_id UUID,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tournament_id UUID,
  CONSTRAINT duelcoins_transactions_tournament_id_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id)
);

-- notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- news
CREATE TABLE public.news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  author_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT news_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(user_id)
);

-- advertisements
CREATE TABLE public.advertisements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  link_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- judges
CREATE TABLE public.judges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  active BOOLEAN DEFAULT true,
  assigned_match_id UUID,
  total_matches_judged INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT judges_user_id_key UNIQUE (user_id),
  CONSTRAINT judges_assigned_match_id_fkey FOREIGN KEY (assigned_match_id) REFERENCES public.tournament_matches(id)
);

-- judge_actions
CREATE TABLE public.judge_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  judge_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  match_id UUID,
  stream_id UUID,
  target_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT judge_actions_judge_id_fkey FOREIGN KEY (judge_id) REFERENCES public.judges(id),
  CONSTRAINT judge_actions_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.tournament_matches(id)
);

-- judge_logs
CREATE TABLE public.judge_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL,
  player_id UUID NOT NULL,
  judge_id UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT judge_logs_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.live_duels(id)
);

-- duel_invites
CREATE TABLE public.duel_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  duel_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT duel_invites_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.live_duels(id)
);

-- private_messages
CREATE TABLE public.private_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- global_chat_messages
CREATE TABLE public.global_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- system_settings
CREATE TABLE public.system_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  value TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT system_settings_key_key UNIQUE (key)
);

-- saved_decks
CREATE TABLE public.saved_decks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  main_deck JSONB NOT NULL DEFAULT '[]',
  extra_deck JSONB NOT NULL DEFAULT '[]',
  side_deck JSONB NOT NULL DEFAULT '[]',
  tokens_deck JSONB NOT NULL DEFAULT '[]',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- match_recordings
CREATE TABLE public.match_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duel_id UUID,
  tournament_id UUID,
  duration INTEGER,
  file_size BIGINT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT match_recordings_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.live_duels(id)
);

-- matchmaking_queue
CREATE TABLE public.matchmaking_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  match_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  duel_id UUID,
  CONSTRAINT matchmaking_queue_user_id_key UNIQUE (user_id),
  CONSTRAINT matchmaking_queue_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.live_duels(id)
);

-- redirects
CREATE TABLE public.redirects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  duel_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT redirects_duel_id_fkey FOREIGN KEY (duel_id) REFERENCES public.live_duels(id)
);

-- lives
CREATE TABLE public.lives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID,
  daily_room_url TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ,
  viewer_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  CONSTRAINT lives_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.live_duels(id)
);

-- ============================================================================
-- 3. VIEW
-- ============================================================================

CREATE VIEW public.public_profiles AS
SELECT user_id, username, avatar_url, points, wins, losses
FROM public.profiles;

-- ============================================================================
-- 4. INDEXES
-- ============================================================================

CREATE INDEX idx_advertisements_expires_at ON public.advertisements (expires_at);
CREATE INDEX idx_advertisements_is_active ON public.advertisements (is_active);
CREATE INDEX idx_chat_messages_duel ON public.chat_messages (duel_id, created_at);
CREATE INDEX idx_chat_messages_user ON public.chat_messages (user_id);
CREATE INDEX idx_duel_invites_receiver ON public.duel_invites (receiver_id, status);
CREATE INDEX idx_duel_invites_sender ON public.duel_invites (sender_id);
CREATE INDEX idx_duelcoins_transactions_tournament_id ON public.duelcoins_transactions (tournament_id);
CREATE INDEX idx_friend_requests_receiver ON public.friend_requests (receiver_id);
CREATE INDEX idx_friend_requests_sender ON public.friend_requests (sender_id);
CREATE INDEX idx_friend_requests_status ON public.friend_requests (status);
CREATE INDEX idx_global_chat_created_at ON public.global_chat_messages (created_at DESC);
CREATE INDEX idx_judges_active ON public.judges (active);
CREATE INDEX idx_live_duels_created_at ON public.live_duels (created_at DESC);
CREATE INDEX idx_live_duels_creator ON public.live_duels (creator_id);
CREATE INDEX idx_live_duels_is_ranked ON public.live_duels (is_ranked, status);
CREATE INDEX idx_live_duels_opponent ON public.live_duels (opponent_id);
CREATE INDEX idx_live_duels_status ON public.live_duels (status);
CREATE INDEX idx_lives_match_id ON public.lives (match_id);
CREATE INDEX idx_lives_status ON public.lives (status);
CREATE INDEX idx_match_history_played_at ON public.match_history (played_at DESC);
CREATE INDEX idx_match_history_player1 ON public.match_history (player1_id);
CREATE INDEX idx_match_history_player2 ON public.match_history (player2_id);
CREATE INDEX idx_match_history_winner ON public.match_history (winner_id);
CREATE INDEX idx_match_recordings_created_at ON public.match_recordings (created_at DESC);
CREATE INDEX idx_match_recordings_user_id ON public.match_recordings (user_id);
CREATE INDEX idx_matchmaking_queue_expires_at ON public.matchmaking_queue (expires_at);
CREATE INDEX idx_matchmaking_queue_match_type ON public.matchmaking_queue (match_type);
CREATE INDEX idx_matchmaking_queue_status ON public.matchmaking_queue (status);
CREATE INDEX idx_news_author ON public.news (author_id);
CREATE INDEX idx_news_created_at ON public.news (created_at DESC);
CREATE INDEX idx_notifications_created_at ON public.notifications (created_at);
CREATE INDEX idx_notifications_read ON public.notifications (read);
CREATE INDEX idx_notifications_user_id ON public.notifications (user_id);

-- ============================================================================
-- 5. ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_match_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duelcoins_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advertisements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.judge_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.judge_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duel_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchmaking_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lives ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. FUNCTIONS (criar ANTES das policies que as referenciam)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

CREATE OR REPLACE FUNCTION public.is_judge(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'judge'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.calculate_level_from_points(p_points integer)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
BEGIN
  RETURN GREATEST(1, (p_points / 100) + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_level_on_points_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_level INTEGER;
  v_new_level INTEGER;
BEGIN
  v_old_level := COALESCE(OLD.level, 1);
  v_new_level := calculate_level_from_points(NEW.points);
  NEW.level := v_new_level;
  IF v_new_level > v_old_level THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      NEW.user_id, 'level_up', 'Subiu de Nível!',
      format('Parabéns! Você alcançou o Nível %s!', v_new_level),
      jsonb_build_object('old_level', v_old_level, 'new_level', v_new_level, 'points', NEW.points)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_auth_user_on_profile_delete()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RAISE NOTICE 'Perfil deletado para user_id: %', OLD.user_id;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_duel_invite()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  inviter_username TEXT;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT username INTO inviter_username FROM profiles WHERE user_id = NEW.sender_id;
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.receiver_id, 'duel_invite', 'Convite para Duelo',
      COALESCE(inviter_username, 'Usuário') || ' convidou você para um duelo!',
      jsonb_build_object('duel_id', NEW.duel_id, 'url', '/duels')
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_private_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  sender_username TEXT;
BEGIN
  SELECT username INTO sender_username FROM profiles WHERE user_id = NEW.sender_id;
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    NEW.receiver_id, 'private_message', 'Nova Mensagem',
    COALESCE(sender_username, 'Usuário') || ' enviou uma mensagem',
    jsonb_build_object('sender_id', NEW.sender_id, 'url', '/chat/' || NEW.sender_id)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_tournament_chat_message()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  participant_record RECORD;
  sender_username TEXT;
  tournament_name TEXT;
BEGIN
  SELECT username INTO sender_username FROM profiles WHERE user_id = NEW.user_id;
  SELECT name INTO tournament_name FROM tournaments WHERE id = NEW.tournament_id;
  FOR participant_record IN
    SELECT DISTINCT user_id FROM tournament_participants
    WHERE tournament_id = NEW.tournament_id AND user_id != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      participant_record.user_id, 'tournament_message', 'Chat do Torneio',
      COALESCE(sender_username, 'Usuário') || ' enviou uma mensagem no torneio "' || COALESCE(tournament_name, 'Sem nome') || '"',
      jsonb_build_object('tournament_id', NEW.tournament_id, 'message_id', NEW.id, 'url', '/tournaments/' || NEW.tournament_id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_video_views(video_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE match_recordings SET views = COALESCE(views, 0) + 1 WHERE id = video_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_direct_video_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT true
$$;

CREATE OR REPLACE FUNCTION public.cleanup_empty_duels()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM live_duels WHERE status = 'waiting' AND opponent_id IS NULL AND created_at < NOW() - INTERVAL '3 minutes';
  DELETE FROM live_duels WHERE status = 'in_progress' AND opponent_id IS NULL AND started_at < NOW() - INTERVAL '3 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_queue_entries()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM matchmaking_queue WHERE expires_at < NOW() OR (status = 'matched' AND joined_at < NOW() - INTERVAL '5 minutes');
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_matchmaking_queue()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM matchmaking_queue WHERE expires_at < NOW();
  DELETE FROM matchmaking_queue WHERE status = 'matched' AND joined_at < NOW() - INTERVAL '5 minutes';
  DELETE FROM matchmaking_queue WHERE status = 'waiting' AND joined_at < NOW() - INTERVAL '2 minutes';
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_duelcoins(p_receiver_id uuid, p_amount integer)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_sender_balance INTEGER;
  v_receiver_username TEXT;
  v_sender_username TEXT;
BEGIN
  v_sender_id := auth.uid();
  IF v_sender_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Não autenticado'); END IF;
  IF v_sender_id = p_receiver_id THEN RETURN json_build_object('success', false, 'message', 'Não é possível enviar DuelCoins para si mesmo'); END IF;
  IF p_amount <= 0 THEN RETURN json_build_object('success', false, 'message', 'Quantidade inválida'); END IF;
  SELECT duelcoins_balance INTO v_sender_balance FROM public.profiles WHERE user_id = v_sender_id;
  IF v_sender_balance < p_amount THEN RETURN json_build_object('success', false, 'message', 'Saldo insuficiente'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_receiver_id) THEN RETURN json_build_object('success', false, 'message', 'Usuário destinatário não encontrado'); END IF;
  SELECT username INTO v_sender_username FROM public.profiles WHERE user_id = v_sender_id;
  SELECT username INTO v_receiver_username FROM public.profiles WHERE user_id = p_receiver_id;
  BEGIN
    UPDATE public.profiles SET duelcoins_balance = duelcoins_balance - p_amount WHERE user_id = v_sender_id;
    UPDATE public.profiles SET duelcoins_balance = duelcoins_balance + p_amount WHERE user_id = p_receiver_id;
    INSERT INTO public.duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description)
    VALUES (v_sender_id, p_receiver_id, p_amount, 'transfer', format('Transferência de %s para %s', v_sender_username, v_receiver_username));
    RETURN json_build_object('success', true, 'message', format('Transferência de %s DuelCoins para %s realizada com sucesso!', p_amount, v_receiver_username));
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', 'Erro ao processar transferência');
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_manage_duelcoins(p_user_id uuid, p_amount integer, p_operation text, p_reason text DEFAULT 'Ajuste administrativo')
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current_balance integer;
  v_new_balance integer;
BEGIN
  SELECT duelcoins_balance INTO v_current_balance FROM profiles WHERE user_id = p_user_id;
  IF v_current_balance IS NULL THEN RETURN json_build_object('success', false, 'message', 'Usuário não encontrado'); END IF;
  IF p_operation = 'add' THEN
    v_new_balance := v_current_balance + p_amount;
    UPDATE profiles SET duelcoins_balance = v_new_balance WHERE user_id = p_user_id;
    INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description) VALUES (NULL, p_user_id, p_amount, 'admin_add', p_reason);
    RETURN json_build_object('success', true, 'message', format('Adicionado %s DuelCoins. Novo saldo: %s', p_amount, v_new_balance));
  ELSIF p_operation = 'remove' THEN
    IF v_current_balance < p_amount THEN RETURN json_build_object('success', false, 'message', format('Saldo insuficiente. Saldo atual: %s', v_current_balance)); END IF;
    v_new_balance := v_current_balance - p_amount;
    UPDATE profiles SET duelcoins_balance = v_new_balance WHERE user_id = p_user_id;
    INSERT INTO duelcoins_transactions (sender_id, receiver_id, amount, transaction_type, description) VALUES (p_user_id, NULL, p_amount, 'admin_remove', p_reason);
    RETURN json_build_object('success', true, 'message', format('Removido %s DuelCoins. Novo saldo: %s', p_amount, v_new_balance));
  ELSE
    RETURN json_build_object('success', false, 'message', 'Operação inválida');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard(limit_count integer DEFAULT 50)
RETURNS TABLE(user_id uuid, username text, avatar_url text, points integer, wins integer, losses integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id, username, avatar_url, points, wins, losses FROM public.profiles ORDER BY points DESC, wins DESC LIMIT limit_count;
$$;

CREATE OR REPLACE FUNCTION public.search_users(search_term text, limit_count integer DEFAULT 20)
RETURNS TABLE(user_id uuid, username text, avatar_url text, points integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id, username, avatar_url, points FROM public.profiles WHERE username ILIKE '%' || search_term || '%' ORDER BY points DESC LIMIT limit_count;
$$;

CREATE OR REPLACE FUNCTION public.get_user_profile(p_user_id uuid)
RETURNS TABLE(user_id uuid, username text, avatar_url text, points integer, wins integer, losses integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT user_id, username, avatar_url, points, wins, losses FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_tournament_participants(p_tournament_id uuid)
RETURNS TABLE(user_id uuid, username text, avatar_url text, is_online boolean, joined_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT tp.user_id, p.username, p.avatar_url, p.is_online, tp.registered_at
  FROM tournament_participants tp
  INNER JOIN profiles p ON p.user_id = tp.user_id
  WHERE tp.tournament_id = p_tournament_id
  ORDER BY tp.registered_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tournament_opponents(p_tournament_id uuid)
RETURNS TABLE(opponent_id uuid, opponent_username text, match_id uuid, round integer, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN tm.player1_id = v_user_id THEN tm.player2_id ELSE tm.player1_id END,
    p.username,
    tm.id,
    tm.round,
    tm.status
  FROM tournament_matches tm
  LEFT JOIN profiles p ON p.user_id = CASE WHEN tm.player1_id = v_user_id THEN tm.player2_id ELSE tm.player1_id END
  WHERE tm.tournament_id = p_tournament_id
    AND (tm.player1_id = v_user_id OR tm.player2_id = v_user_id)
    AND tm.status IN ('pending', 'in_progress')
  ORDER BY tm.round ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_tournaments()
RETURNS TABLE(id uuid, name text, status text, is_weekly boolean, created_by uuid, current_round integer, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.status, COALESCE(t.is_weekly, false), t.created_by, t.current_round, t.created_at
  FROM tournaments t
  INNER JOIN tournament_participants tp ON tp.tournament_id = t.id
  WHERE tp.user_id = auth.uid()
  ORDER BY t.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_created_tournaments()
RETURNS TABLE(id uuid, name text, status text, is_weekly boolean, total_collected integer, prize_paid boolean, prize_pool integer, participant_count bigint, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.status, COALESCE(t.is_weekly, false), COALESCE(t.total_collected, 0), COALESCE(t.prize_paid, false), t.prize_pool,
    (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = t.id), t.created_at
  FROM tournaments t WHERE t.created_by = auth.uid() ORDER BY t.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_weekly_tournaments()
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT tor.id, tor.name, tor.description, tor.start_date, tor.end_date, tor.max_participants, tor.prize_pool, tor.entry_fee, tor.status, tor.is_weekly,
        COALESCE(tor.total_collected, 0) as total_collected, COALESCE(tor.prize_paid, false) as prize_paid, tor.created_by, tor.current_round,
        (SELECT COUNT(*) FROM tournament_participants tp WHERE tp.tournament_id = tor.id)::integer as participant_count
      FROM tournaments tor WHERE tor.is_weekly = true ORDER BY tor.created_at DESC
    ) t
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_normal_tournament(p_name text, p_description text, p_start_date text, p_end_date text, p_prize_pool integer, p_entry_fee integer, p_max_participants integer, p_tournament_type text DEFAULT 'single_elimination')
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_balance integer; v_tournament_id uuid; v_total_rounds integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_prize_pool THEN RETURN json_build_object('success', false, 'message', 'Saldo insuficiente para criar o torneio'); END IF;
  IF p_tournament_type = 'swiss' THEN
    IF p_max_participants >= 65 THEN v_total_rounds := 7;
    ELSIF p_max_participants >= 33 THEN v_total_rounds := 6;
    ELSIF p_max_participants >= 17 THEN v_total_rounds := 5;
    ELSIF p_max_participants >= 9 THEN v_total_rounds := 4;
    ELSE v_total_rounds := 3; END IF;
  ELSE v_total_rounds := NULL; END IF;
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool WHERE user_id = v_user_id;
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento de prêmio - Torneio: ' || p_name);
  INSERT INTO tournaments (name, description, start_date, end_date, prize_pool, entry_fee, max_participants, tournament_type, total_rounds, created_by, status, is_weekly)
  VALUES (p_name, p_description, p_start_date::timestamptz, p_end_date::timestamptz, p_prize_pool, p_entry_fee, p_max_participants, p_tournament_type, v_total_rounds, v_user_id, 'upcoming', false)
  RETURNING id INTO v_tournament_id;
  RETURN json_build_object('success', true, 'message', 'Torneio criado com sucesso', 'tournament_id', v_tournament_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_weekly_tournament(p_name text, p_description text, p_prize_pool integer, p_entry_fee integer, p_max_participants integer DEFAULT 32)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_balance integer; v_tournament_id uuid; v_start_date timestamptz; v_end_date timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance IS NULL OR v_balance < p_prize_pool THEN RETURN json_build_object('success', false, 'message', 'Saldo insuficiente'); END IF;
  v_start_date := now(); v_end_date := now() + interval '7 days';
  UPDATE profiles SET duelcoins_balance = duelcoins_balance - p_prize_pool WHERE user_id = v_user_id;
  INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
  VALUES (v_user_id, p_prize_pool, 'tournament_prize', 'Pagamento de prêmio - Torneio Semanal: ' || p_name);
  INSERT INTO tournaments (name, description, start_date, end_date, prize_pool, entry_fee, max_participants, tournament_type, total_rounds, created_by, status, is_weekly)
  VALUES (p_name, p_description, v_start_date, v_end_date, p_prize_pool, p_entry_fee, p_max_participants, 'single_elimination', 5, v_user_id, 'upcoming', true)
  RETURNING id INTO v_tournament_id;
  RETURN json_build_object('success', true, 'message', 'Torneio semanal criado', 'tournament_id', v_tournament_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_weekly_tournament(p_tournament_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid; v_entry_fee integer; v_balance integer; v_max_participants integer; v_current_count integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Não autenticado'); END IF;
  SELECT entry_fee, max_participants INTO v_entry_fee, v_max_participants FROM tournaments WHERE id = p_tournament_id AND is_weekly = true;
  IF v_entry_fee IS NULL THEN RETURN json_build_object('success', false, 'message', 'Torneio não encontrado'); END IF;
  IF EXISTS (SELECT 1 FROM tournament_participants WHERE tournament_id = p_tournament_id AND user_id = v_user_id) THEN
    RETURN json_build_object('success', false, 'message', 'Você já está inscrito'); END IF;
  SELECT COUNT(*) INTO v_current_count FROM tournament_participants WHERE tournament_id = p_tournament_id;
  IF v_current_count >= v_max_participants THEN RETURN json_build_object('success', false, 'message', 'Torneio lotado'); END IF;
  SELECT duelcoins_balance INTO v_balance FROM profiles WHERE user_id = v_user_id;
  IF v_balance < v_entry_fee THEN RETURN json_build_object('success', false, 'message', 'Saldo insuficiente'); END IF;
  IF v_entry_fee > 0 THEN
    UPDATE profiles SET duelcoins_balance = duelcoins_balance - v_entry_fee WHERE user_id = v_user_id;
    INSERT INTO duelcoins_transactions (sender_id, amount, transaction_type, description)
    VALUES (v_user_id, v_entry_fee, 'tournament_entry', 'Inscrição em torneio semanal');
    UPDATE tournaments SET total_collected = COALESCE(total_collected, 0) + v_entry_fee WHERE id = p_tournament_id;
  END IF;
  INSERT INTO tournament_participants (tournament_id, user_id, status) VALUES (p_tournament_id, v_user_id, 'registered');
  RETURN json_build_object('success', true, 'message', 'Inscrito com sucesso!');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_match_winner(p_match_id uuid, p_winner_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid; v_created_by uuid;
BEGIN
  SELECT tm.tournament_id INTO v_tournament_id FROM tournament_matches tm WHERE tm.id = p_match_id;
  IF v_tournament_id IS NULL THEN RETURN json_build_object('success', false, 'message', 'Partida não encontrada'); END IF;
  SELECT created_by INTO v_created_by FROM tournaments WHERE id = v_tournament_id;
  IF v_created_by != auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'message', 'Sem permissão'); END IF;
  UPDATE tournament_matches SET winner_id = p_winner_id, status = 'completed' WHERE id = p_match_id;
  RETURN json_build_object('success', true, 'message', 'Vencedor definido');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_match_result(p_duel_id uuid, p_player1_id uuid, p_player2_id uuid, p_winner_id uuid, p_player1_score integer, p_player2_score integer, p_bet_amount integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_match_id uuid; v_duel_status game_status; v_duel_creator uuid; v_duel_opponent uuid; v_is_ranked boolean; v_points_change integer;
BEGIN
  IF auth.uid() NOT IN (p_player1_id, p_player2_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (p_player1_id, p_player2_id) THEN RAISE EXCEPTION 'Invalid winner'; END IF;
  SELECT status, creator_id, opponent_id, is_ranked INTO v_duel_status, v_duel_creator, v_duel_opponent, v_is_ranked FROM public.live_duels WHERE id = p_duel_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Duel not found'; END IF;
  IF v_duel_status != 'in_progress' AND v_duel_status != 'finished' THEN RAISE EXCEPTION 'Duel must be in progress or finished'; END IF;
  INSERT INTO public.match_history (player1_id, player2_id, winner_id, player1_score, player2_score, bet_amount)
  VALUES (p_player1_id, p_player2_id, p_winner_id, p_player1_score, p_player2_score, p_bet_amount)
  RETURNING id INTO v_match_id;
  IF v_is_ranked AND p_winner_id IS NOT NULL THEN
    IF p_bet_amount > 0 THEN v_points_change := p_bet_amount;
    ELSE
      IF p_winner_id = p_player1_id THEN v_points_change := 10 + (p_player1_score / 100);
      ELSE v_points_change := 10 + (p_player2_score / 100); END IF;
    END IF;
    UPDATE public.profiles SET wins = wins + 1, points = points + v_points_change WHERE user_id = p_winner_id;
    UPDATE public.profiles SET losses = losses + 1, points = GREATEST(points - (v_points_change / 2), 0)
    WHERE user_id = CASE WHEN p_winner_id = p_player1_id THEN p_player2_id ELSE p_player1_id END;
  ELSIF NOT v_is_ranked AND p_winner_id IS NOT NULL THEN
    UPDATE public.profiles SET wins = wins + 1 WHERE user_id = p_winner_id;
    UPDATE public.profiles SET losses = losses + 1
    WHERE user_id = CASE WHEN p_winner_id = p_player1_id THEN p_player2_id ELSE p_player1_id END;
  END IF;
  RETURN v_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_data jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_notification_id UUID;
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (p_user_id, p_type, p_title, p_message, p_data)
  RETURNING id INTO v_notification_id;
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.matchmake(p_match_type text, p_user_id uuid)
RETURNS TABLE(duel_id uuid, player_role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_waiting_entry RECORD; v_new_duel_id UUID;
BEGIN
  DELETE FROM matchmaking_queue WHERE expires_at < NOW();
  SELECT * INTO v_waiting_entry FROM matchmaking_queue
  WHERE status = 'waiting' AND match_type = p_match_type AND user_id != p_user_id
  ORDER BY joined_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF FOUND THEN
    INSERT INTO live_duels (creator_id, opponent_id, status, is_ranked)
    VALUES (v_waiting_entry.user_id, p_user_id, 'waiting', p_match_type = 'ranked')
    RETURNING id INTO v_new_duel_id;
    INSERT INTO redirects (user_id, duel_id) VALUES (v_waiting_entry.user_id, v_new_duel_id), (p_user_id, v_new_duel_id);
    DELETE FROM matchmaking_queue WHERE user_id IN (v_waiting_entry.user_id, p_user_id);
    RETURN QUERY SELECT v_new_duel_id, 'matched'::TEXT;
  ELSE
    INSERT INTO matchmaking_queue (user_id, match_type, status, expires_at)
    VALUES (p_user_id, p_match_type, 'waiting', NOW() + INTERVAL '2 minutes')
    ON CONFLICT (user_id) DO UPDATE SET match_type = EXCLUDED.match_type, status = 'waiting', joined_at = NOW(), expires_at = NOW() + INTERVAL '2 minutes';
    RETURN QUERY SELECT NULL::UUID, 'waiting'::TEXT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_storage_recordings()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage
AS $$
BEGIN
  INSERT INTO public.match_recordings (user_id, video_url, title, is_public, file_size, created_at)
  SELECT
    o.owner_id::uuid, 'https://YOUR_SUPABASE_URL/storage/v1/object/public/match-recordings/' || o.name,
    'Gravação ' || to_char(o.created_at, 'DD/MM/YYYY HH24:MI'), false, COALESCE((o.metadata->>'size')::bigint, 0), o.created_at
  FROM storage.objects o
  WHERE o.bucket_id = 'match-recordings' AND o.owner_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.match_recordings mr WHERE mr.video_url LIKE '%' || o.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_users()
RETURNS TABLE(deleted_count integer, deleted_emails text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  orphaned_user RECORD; deleted_counter integer := 0; deleted_email_list text[] := ARRAY[]::text[];
BEGIN
  FOR orphaned_user IN SELECT au.id, au.email FROM auth.users au LEFT JOIN public.profiles p ON au.id = p.user_id WHERE p.user_id IS NULL
  LOOP
    deleted_email_list := array_append(deleted_email_list, orphaned_user.email);
    deleted_counter := deleted_counter + 1;
  END LOOP;
  RETURN QUERY SELECT deleted_counter, deleted_email_list;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cleanup_orphaned_auth_users()
RETURNS TABLE(deleted_user_id uuid, deleted_email text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  orphaned_user RECORD; delete_count integer := 0;
BEGIN
  FOR orphaned_user IN SELECT au.id, au.email FROM auth.users au LEFT JOIN public.profiles p ON au.id = p.user_id WHERE p.user_id IS NULL
  LOOP
    deleted_user_id := orphaned_user.id; deleted_email := orphaned_user.email; status := 'orphaned_auth_user_found';
    RETURN NEXT; delete_count := delete_count + 1;
  END LOOP;
  RETURN;
END;
$$;

-- handle_new_user (TRIGGER FUNCTION para auth.users - configure no dashboard do Supabase)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  username_generated text; username_counter integer := 0;
BEGIN
  IF NEW.raw_user_meta_data->>'username' IS NOT NULL AND NEW.raw_user_meta_data->>'username' != '' THEN
    username_generated := NEW.raw_user_meta_data->>'username';
    username_generated := regexp_replace(username_generated, '[^a-zA-Z0-9]', '', 'g');
    username_generated := lower(substring(username_generated from 1 for 17));
  ELSE
    username_generated := split_part(NEW.email, '@', 1);
    username_generated := regexp_replace(username_generated, '[^a-zA-Z0-9]', '', 'g');
    username_generated := lower(substring(username_generated from 1 for 17));
  END IF;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = username_generated) LOOP
    username_counter := username_counter + 1;
    IF NEW.raw_user_meta_data->>'username' IS NOT NULL THEN
      username_generated := lower(substring(NEW.raw_user_meta_data->>'username' from 1 for 15)) || username_counter;
    ELSE
      username_generated := lower(substring(split_part(NEW.email, '@', 1) from 1 for 15)) || username_counter;
    END IF;
  END LOOP;
  INSERT INTO public.profiles (user_id, username, avatar_url)
  VALUES (NEW.id, username_generated, COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id::text));
  IF (SELECT COUNT(*) FROM public.profiles) = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

-- profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Admins delete any profile" ON public.profiles FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Admins update any profile" ON public.profiles FOR UPDATE USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Authenticated users can view basic profile data" ON public.profiles FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own complete profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);

-- user_roles
CREATE POLICY "Admins manage all roles" ON public.user_roles FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- live_duels
CREATE POLICY "Admins delete any duel" ON public.live_duels FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated users view live duels" ON public.live_duels FOR SELECT USING (true);
CREATE POLICY "Creators delete duels" ON public.live_duels FOR DELETE USING (auth.uid() = creator_id);
CREATE POLICY "Participants update duels v2" ON public.live_duels FOR UPDATE USING ((auth.uid() = creator_id) OR (auth.uid() = opponent_id) OR ((opponent_id IS NULL) AND (auth.uid() <> creator_id))) WITH CHECK ((auth.uid() = creator_id) OR (auth.uid() = opponent_id) OR ((opponent_id IS NULL) AND (auth.uid() <> creator_id)));
CREATE POLICY "Users create duels" ON public.live_duels FOR INSERT WITH CHECK (auth.uid() = creator_id);

-- players
CREATE POLICY "All view players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Players update own status" ON public.players FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users join duels" ON public.players FOR INSERT WITH CHECK (auth.uid() = user_id);

-- chat_messages
CREATE POLICY "Admins delete any message" ON public.chat_messages FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "All view chat messages" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Users delete own messages" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users send messages" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- friend_requests
CREATE POLICY "Admins delete any request" ON public.friend_requests FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Users create requests" ON public.friend_requests FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users delete own requests" ON public.friend_requests FOR DELETE USING ((auth.uid() = sender_id) OR (auth.uid() = receiver_id));
CREATE POLICY "Users update received requests" ON public.friend_requests FOR UPDATE USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "Users view own requests" ON public.friend_requests FOR SELECT USING ((auth.uid() = sender_id) OR (auth.uid() = receiver_id));

-- match_history
CREATE POLICY "Admins delete match history" ON public.match_history FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "All view match history" ON public.match_history FOR SELECT USING (true);

-- tournaments
CREATE POLICY "Admins manage tournaments" ON public.tournaments FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "All view tournaments" ON public.tournaments FOR SELECT USING (true);

-- tournament_participants
CREATE POLICY "Admins podem gerenciar participantes" ON public.tournament_participants FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Participantes são visíveis para todos" ON public.tournament_participants FOR SELECT USING (true);
CREATE POLICY "Usuários podem se inscrever em torneios" ON public.tournament_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

-- tournament_matches
CREATE POLICY "Apenas admins e juízes podem atualizar partidas" ON public.tournament_matches FOR UPDATE USING (is_admin(auth.uid()) OR is_judge(auth.uid()));
CREATE POLICY "Apenas admins podem criar partidas" ON public.tournament_matches FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Everyone can view tournament matches" ON public.tournament_matches FOR SELECT USING (true);

-- tournament_match_reports
CREATE POLICY "Authenticated users can create reports" ON public.tournament_match_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can view reports for their tournaments" ON public.tournament_match_reports FOR SELECT USING (true);

-- tournament_players
CREATE POLICY "Everyone can view tournament players" ON public.tournament_players FOR SELECT USING (true);
CREATE POLICY "Users can join tournaments" ON public.tournament_players FOR INSERT WITH CHECK (auth.uid() = user_id);

-- tournament_chat_messages
CREATE POLICY "Admins podem deletar qualquer mensagem tcm" ON public.tournament_chat_messages FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Usuários podem deletar suas próprias mensagens tcm" ON public.tournament_chat_messages FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem enviar mensagens em torneios" ON public.tournament_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Usuários podem ver mensagens de torneios" ON public.tournament_chat_messages FOR SELECT USING (true);

-- duelcoins_transactions
CREATE POLICY "Admins view all transactions" ON public.duelcoins_transactions FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Only through functions" ON public.duelcoins_transactions FOR INSERT WITH CHECK (false);
CREATE POLICY "Users view own transactions" ON public.duelcoins_transactions FOR SELECT USING (
  (auth.uid() = sender_id) OR (auth.uid() = receiver_id) OR
  (EXISTS (SELECT 1 FROM tournaments t WHERE t.id = duelcoins_transactions.tournament_id AND
    (t.created_by = auth.uid() OR auth.uid() IN (SELECT user_id FROM tournament_participants WHERE tournament_id = t.id))))
);

-- notifications
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);

-- news
CREATE POLICY "Admins manage news" ON public.news FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "All view news" ON public.news FOR SELECT USING (true);

-- advertisements
CREATE POLICY "Admins manage ads" ON public.advertisements FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "All view active ads" ON public.advertisements FOR SELECT USING (is_active = true);

-- judges
CREATE POLICY "Apenas admins podem gerenciar juízes" ON public.judges FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Juízes são visíveis para todos" ON public.judges FOR SELECT USING (true);

-- judge_actions
CREATE POLICY "Ações dos juízes são visíveis para todos" ON public.judge_actions FOR SELECT USING (true);
CREATE POLICY "Juízes podem registrar suas ações" ON public.judge_actions FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM judges WHERE judges.user_id = auth.uid() AND judges.active = true));

-- judge_logs
CREATE POLICY "Admins manage all judge logs" ON public.judge_logs FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Judges update calls" ON public.judge_logs FOR UPDATE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'judge'));
CREATE POLICY "Judges view all pending calls" ON public.judge_logs FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'judge'));
CREATE POLICY "Players can create judge calls" ON public.judge_logs FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "Players view own calls" ON public.judge_logs FOR SELECT USING ((auth.uid() = player_id) OR (auth.uid() = judge_id));

-- duel_invites
CREATE POLICY "Receivers can update invites" ON public.duel_invites FOR UPDATE USING (auth.uid() = receiver_id) WITH CHECK (auth.uid() = receiver_id);
CREATE POLICY "Users can create invites" ON public.duel_invites FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can delete their own invites" ON public.duel_invites FOR DELETE USING ((auth.uid() = sender_id) OR (auth.uid() = receiver_id));
CREATE POLICY "Users can view their own invites" ON public.duel_invites FOR SELECT USING ((auth.uid() = receiver_id) OR (auth.uid() = sender_id));

-- private_messages
CREATE POLICY "Users can delete their own sent messages" ON public.private_messages FOR DELETE USING (auth.uid() = sender_id);
CREATE POLICY "Users can send messages" ON public.private_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "Users can view their own messages" ON public.private_messages FOR SELECT USING ((auth.uid() = sender_id) OR (auth.uid() = receiver_id));

-- global_chat_messages
CREATE POLICY "Admins podem deletar qualquer mensagem gcm" ON public.global_chat_messages FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Todos podem ver mensagens do chat global" ON public.global_chat_messages FOR SELECT USING (true);
CREATE POLICY "Usuários podem deletar suas próprias mensagens gcm" ON public.global_chat_messages FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem enviar mensagens no chat global" ON public.global_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- system_settings
CREATE POLICY "Admins can delete settings" ON public.system_settings FOR DELETE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can insert settings" ON public.system_settings FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update settings" ON public.system_settings FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Anyone can view settings" ON public.system_settings FOR SELECT USING (true);

-- saved_decks
CREATE POLICY "Anyone can view public decks" ON public.saved_decks FOR SELECT USING (is_public = true);
CREATE POLICY "Users can create their own decks" ON public.saved_decks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own decks" ON public.saved_decks FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own decks" ON public.saved_decks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own decks" ON public.saved_decks FOR SELECT USING (auth.uid() = user_id);

-- match_recordings
CREATE POLICY "Anyone can increment views on public recordings" ON public.match_recordings FOR UPDATE USING (is_public = true) WITH CHECK (is_public = true);
CREATE POLICY "Anyone can view public recordings" ON public.match_recordings FOR SELECT USING (is_public = true);
CREATE POLICY "Owners can view their own recordings" ON public.match_recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own recordings" ON public.match_recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own recordings" ON public.match_recordings FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own recordings" ON public.match_recordings FOR UPDATE USING (auth.uid() = user_id);

-- matchmaking_queue
CREATE POLICY "Users can join queue" ON public.matchmaking_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave queue" ON public.matchmaking_queue FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own queue entry" ON public.matchmaking_queue FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view queue entries" ON public.matchmaking_queue FOR SELECT USING (true);

-- redirects
CREATE POLICY "Users can view their own redirects" ON public.redirects FOR SELECT USING (auth.uid() = user_id);

-- lives
CREATE POLICY "Everyone can view active lives" ON public.lives FOR SELECT USING ((status = 'active') OR (status = 'finished'));

-- ============================================================================
-- 8. TRIGGERS
-- ============================================================================

CREATE TRIGGER on_profile_delete AFTER DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION cleanup_auth_user_on_profile_delete();
CREATE TRIGGER trigger_update_level BEFORE UPDATE OF points ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_level_on_points_change();
CREATE TRIGGER on_duel_invite_created AFTER INSERT ON public.duel_invites FOR EACH ROW EXECUTE FUNCTION notify_duel_invite();
CREATE TRIGGER on_private_message_sent AFTER INSERT ON public.private_messages FOR EACH ROW EXECUTE FUNCTION notify_private_message();
CREATE TRIGGER on_tournament_message_sent AFTER INSERT ON public.tournament_chat_messages FOR EACH ROW EXECUTE FUNCTION notify_tournament_chat_message();
CREATE TRIGGER update_saved_decks_updated_at BEFORE UPDATE ON public.saved_decks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 9. REALTIME
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_duels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.news;
ALTER PUBLICATION supabase_realtime ADD TABLE public.advertisements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.matchmaking_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_match_reports;

ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
ALTER TABLE public.tournament_matches REPLICA IDENTITY FULL;

-- ============================================================================
-- 10. STORAGE BUCKETS (criar no dashboard do Supabase)
-- ============================================================================
-- Crie os seguintes buckets no dashboard:
-- - avatars (público)
-- - news-media (público)
-- - ads-media (público)
-- - match-recordings (público)

-- ============================================================================
-- 11. AUTH TRIGGER (criar no dashboard do Supabase)
-- ============================================================================
-- No dashboard do Supabase, vá em Authentication > Hooks
-- Adicione um trigger "After sign up" apontando para public.handle_new_user()
-- OU execute (precisa de permissão):
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
-- FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 12. SECRETS NECESSÁRIOS (configurar no Edge Functions)
-- ============================================================================
-- DAILY_API_KEY - Para videochamadas via Daily.co
-- VAPID_PRIVATE_KEY - Para push notifications
-- FCM_SERVER_KEY - Para Firebase Cloud Messaging
-- LOVABLE_API_KEY - Para IA (reconhecimento de cartas) - substituir por sua própria API

-- ============================================================================
-- NOTA: Substitua 'YOUR_SUPABASE_URL' pela URL do seu projeto Supabase
-- na função sync_storage_recordings()
-- ============================================================================
