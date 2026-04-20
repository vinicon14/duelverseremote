
CREATE OR REPLACE FUNCTION public.notify_duel_invite()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inviter_username TEXT;
  v_tcg_type TEXT;
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  IF NEW.status != 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT username INTO inviter_username
  FROM public.profiles
  WHERE user_id = NEW.sender_id;

  SELECT tcg_type INTO v_tcg_type
  FROM public.live_duels
  WHERE id = NEW.duel_id;

  -- Insert notification for bell
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.receiver_id,
    'duel_invite',
    '⚔️ Desafio de Duelo!',
    COALESCE(inviter_username, 'Usuário') || ' te desafiou para um duelo!',
    jsonb_build_object(
      'type', 'duel_invite',
      'duel_id', NEW.duel_id,
      'invite_id', NEW.id,
      'sender_id', NEW.sender_id,
      'tcg_type', COALESCE(v_tcg_type, 'yugioh'),
      'url', '/duel/' || NEW.duel_id
    )
  );

  -- Send web push notification
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR v_url = '' THEN
    SELECT value INTO v_url FROM public.system_settings WHERE key = 'supabase_url';
  END IF;
  
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_key IS NOT NULL THEN
    BEGIN
      PERFORM extensions.http_post(
        url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/send-push-notification',
        body := jsonb_build_object(
          'user_ids', jsonb_build_array(NEW.receiver_id),
          'title', '⚔️ Desafio de Duelo!',
          'body', COALESCE(inviter_username, 'Usuário') || ' te desafiou para um duelo!',
          'data', jsonb_build_object(
            'type', 'duel_invite',
            'duelId', NEW.duel_id,
            'inviteId', NEW.id,
            'senderId', NEW.sender_id,
            'tcgType', COALESCE(v_tcg_type, 'yugioh'),
            'url', '/duel/' || NEW.duel_id
          )
        )::text,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to send duel invite push: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notify_duel_invite error: %', SQLERRM;
    RETURN NEW;
END;
$$;
