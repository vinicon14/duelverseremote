
-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create unique constraint on push_subscriptions endpoint for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_key'
  ) THEN
    ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
  END IF;
END $$;

-- Function to send push notification via edge function
CREATE OR REPLACE FUNCTION public.send_push_via_edge_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_url text;
  v_service_key text;
  v_payload jsonb;
BEGIN
  -- Build the edge function URL
  v_url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/send-push-notification';
  
  -- Get service role key
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  -- Build payload
  v_payload := jsonb_build_object(
    'user_ids', jsonb_build_array(NEW.user_id),
    'title', NEW.title,
    'body', NEW.message,
    'data', COALESCE(NEW.data, '{}'::jsonb)
  );

  -- Call edge function via pg_net
  PERFORM extensions.http_post(
    url := v_url,
    body := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$func$;

-- Trigger on notifications table to send push
DROP TRIGGER IF EXISTS trigger_send_push_on_notification ON public.notifications;
CREATE TRIGGER trigger_send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_via_edge_function();

-- Function to notify about global chat messages (broadcast to all subscribers)
CREATE OR REPLACE FUNCTION public.notify_global_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_url text;
  v_service_key text;
  v_sender_username text;
  v_payload jsonb;
BEGIN
  -- Get sender username
  SELECT username INTO v_sender_username
  FROM profiles WHERE user_id = NEW.user_id;

  v_url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/send-push-notification';

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  -- Send to ALL subscribers except the sender
  v_payload := jsonb_build_object(
    'title', 'Chat Global',
    'body', COALESCE(v_sender_username, 'Usuário') || ': ' || LEFT(NEW.message, 100),
    'data', jsonb_build_object('type', 'global_chat', 'url', '/duels'),
    'exclude_user_id', NEW.user_id
  );

  PERFORM extensions.http_post(
    url := v_url,
    body := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send global chat push: %', SQLERRM;
    RETURN NEW;
END;
$func$;

-- Trigger for global chat messages
DROP TRIGGER IF EXISTS trigger_push_global_chat ON public.global_chat_messages;
CREATE TRIGGER trigger_push_global_chat
  AFTER INSERT ON public.global_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_global_chat_message();

-- Function to notify about new duel rooms
CREATE OR REPLACE FUNCTION public.notify_new_duel_room()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_url text;
  v_service_key text;
  v_creator_username text;
  v_payload jsonb;
BEGIN
  -- Only notify on new rooms (status = waiting)
  IF NEW.status != 'waiting' THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_creator_username
  FROM profiles WHERE user_id = NEW.creator_id;

  v_url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/send-push-notification';

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  v_payload := jsonb_build_object(
    'title', '⚔️ Nova Sala de Duelo',
    'body', COALESCE(v_creator_username, 'Alguém') || ' abriu uma sala: ' || COALESCE(NEW.room_name, 'Duelo'),
    'data', jsonb_build_object('type', 'new_duel', 'duel_id', NEW.id, 'url', '/duels'),
    'exclude_user_id', NEW.creator_id
  );

  PERFORM extensions.http_post(
    url := v_url,
    body := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send new duel push: %', SQLERRM;
    RETURN NEW;
END;
$func$;

-- Trigger for new duel rooms
DROP TRIGGER IF EXISTS trigger_push_new_duel ON public.live_duels;
CREATE TRIGGER trigger_push_new_duel
  AFTER INSERT ON public.live_duels
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_duel_room();

-- Function to notify about friend requests
CREATE OR REPLACE FUNCTION public.notify_friend_request_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_sender_username text;
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT username INTO v_sender_username
    FROM profiles WHERE user_id = NEW.sender_id;

    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.receiver_id,
      'friend_request',
      'Pedido de Amizade',
      COALESCE(v_sender_username, 'Alguém') || ' quer ser seu amigo!',
      jsonb_build_object('sender_id', NEW.sender_id, 'url', '/friends')
    );
  ELSIF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    SELECT username INTO v_sender_username
    FROM profiles WHERE user_id = NEW.receiver_id;

    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.sender_id,
      'friend_accepted',
      'Amizade Aceita!',
      COALESCE(v_sender_username, 'Alguém') || ' aceitou seu pedido de amizade!',
      jsonb_build_object('friend_id', NEW.receiver_id, 'url', '/friends')
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to notify friend request: %', SQLERRM;
    RETURN NEW;
END;
$func$;

-- Trigger for friend requests  
DROP TRIGGER IF EXISTS trigger_push_friend_request ON public.friend_requests;
CREATE TRIGGER trigger_push_friend_request
  AFTER INSERT OR UPDATE ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_friend_request_push();

-- Function to notify about new news
CREATE OR REPLACE FUNCTION public.notify_new_news()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_url text;
  v_service_key text;
  v_payload jsonb;
BEGIN
  v_url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/send-push-notification';

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  -- Broadcast to all subscribers
  v_payload := jsonb_build_object(
    'title', '📰 Nova Notícia',
    'body', NEW.title,
    'data', jsonb_build_object('type', 'news', 'news_id', NEW.id, 'url', '/news')
  );

  PERFORM extensions.http_post(
    url := v_url,
    body := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send news push: %', SQLERRM;
    RETURN NEW;
END;
$func$;

-- Trigger for new news
DROP TRIGGER IF EXISTS trigger_push_new_news ON public.news;
CREATE TRIGGER trigger_push_new_news
  AFTER INSERT ON public.news
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_news();

-- Function to notify tournament status changes
CREATE OR REPLACE FUNCTION public.notify_tournament_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_participant RECORD;
  v_message text;
BEGIN
  -- Only on status change
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'active' THEN
    v_message := 'O torneio "' || NEW.name || '" começou! Prepare-se para duelar!';
  ELSIF NEW.status = 'completed' THEN
    v_message := 'O torneio "' || NEW.name || '" foi finalizado!';
  ELSE
    RETURN NEW;
  END IF;

  -- Notify all participants
  FOR v_participant IN
    SELECT user_id FROM tournament_participants WHERE tournament_id = NEW.id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      v_participant.user_id,
      'tournament_update',
      '🏆 Torneio',
      v_message,
      jsonb_build_object('tournament_id', NEW.id, 'url', '/tournaments/' || NEW.id)
    );
  END LOOP;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to notify tournament status: %', SQLERRM;
    RETURN NEW;
END;
$func$;

-- Trigger for tournament status changes
DROP TRIGGER IF EXISTS trigger_push_tournament_status ON public.tournaments;
CREATE TRIGGER trigger_push_tournament_status
  AFTER UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_tournament_status_change();
