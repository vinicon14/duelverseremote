-- Corrigir search_path nas funções de notificação existentes

-- 1. Atualizar notify_private_message
CREATE OR REPLACE FUNCTION public.notify_private_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sender_username TEXT;
BEGIN
  -- Get sender username
  SELECT username INTO sender_username
  FROM profiles
  WHERE user_id = NEW.sender_id;

  -- Insert notification for receiver
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    NEW.receiver_id,
    'private_message',
    'Nova Mensagem',
    COALESCE(sender_username, 'Usuário') || ' enviou uma mensagem',
    jsonb_build_object(
      'sender_id', NEW.sender_id,
      'url', '/chat/' || NEW.sender_id
    )
  );

  RETURN NEW;
END;
$$;

-- 2. Atualizar notify_duel_invite
CREATE OR REPLACE FUNCTION public.notify_duel_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inviter_username TEXT;
BEGIN
  -- Only notify if invite is pending
  IF NEW.status = 'pending' THEN
    -- Get inviter username
    SELECT username INTO inviter_username
    FROM profiles
    WHERE user_id = NEW.sender_id;

    -- Insert notification
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      NEW.receiver_id,
      'duel_invite',
      'Convite para Duelo',
      COALESCE(inviter_username, 'Usuário') || ' convidou você para um duelo!',
      jsonb_build_object(
        'duel_id', NEW.duel_id,
        'url', '/duels'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Atualizar notify_tournament_chat_message
CREATE OR REPLACE FUNCTION public.notify_tournament_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_record RECORD;
  sender_username TEXT;
  tournament_name TEXT;
BEGIN
  -- Get sender username
  SELECT username INTO sender_username
  FROM profiles
  WHERE user_id = NEW.user_id;

  -- Get tournament name
  SELECT name INTO tournament_name
  FROM tournaments
  WHERE id = NEW.tournament_id;

  -- Notify all participants except the sender
  FOR participant_record IN
    SELECT DISTINCT user_id
    FROM tournament_participants
    WHERE tournament_id = NEW.tournament_id
    AND user_id != NEW.user_id
  LOOP
    -- Insert notification for each participant
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (
      participant_record.user_id,
      'tournament_message',
      'Chat do Torneio',
      COALESCE(sender_username, 'Usuário') || ' enviou uma mensagem no torneio "' || COALESCE(tournament_name, 'Sem nome') || '"',
      jsonb_build_object(
        'tournament_id', NEW.tournament_id,
        'message_id', NEW.id,
        'url', '/tournaments/' || NEW.tournament_id
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;