-- Create function to notify tournament participants when a new message is sent
CREATE OR REPLACE FUNCTION notify_tournament_chat_message()
RETURNS TRIGGER AS $$
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
    INSERT INTO notifications (user_id, type, title, body, data)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for tournament chat messages
DROP TRIGGER IF EXISTS on_tournament_message_sent ON tournament_chat_messages;
CREATE TRIGGER on_tournament_message_sent
  AFTER INSERT ON tournament_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_tournament_chat_message();

-- Create function to notify users when a new duel invite is sent
CREATE OR REPLACE FUNCTION notify_duel_invite()
RETURNS TRIGGER AS $$
DECLARE
  inviter_username TEXT;
BEGIN
  -- Only notify if invite is pending
  IF NEW.status = 'pending' THEN
    -- Get inviter username
    SELECT username INTO inviter_username
    FROM profiles
    WHERE user_id = NEW.inviter_id;

    -- Insert notification
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      NEW.invited_id,
      'duel_invite',
      'Convite para Duelo',
      COALESCE(inviter_username, 'Usuário') || ' convidou você para um duelo!',
      jsonb_build_object(
        'duel_id', NEW.id,
        'url', '/duels'
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for duel invites
DROP TRIGGER IF EXISTS on_duel_invite_created ON duel_invites;
CREATE TRIGGER on_duel_invite_created
  AFTER INSERT ON duel_invites
  FOR EACH ROW
  EXECUTE FUNCTION notify_duel_invite();

-- Create function to notify users when private message is sent
CREATE OR REPLACE FUNCTION notify_private_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_username TEXT;
BEGIN
  -- Get sender username
  SELECT username INTO sender_username
  FROM profiles
  WHERE user_id = NEW.sender_id;

  -- Insert notification for receiver
  INSERT INTO notifications (user_id, type, title, body, data)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for private messages
DROP TRIGGER IF EXISTS on_private_message_sent ON private_messages;
CREATE TRIGGER on_private_message_sent
  AFTER INSERT ON private_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_private_message();