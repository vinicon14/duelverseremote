CREATE OR REPLACE FUNCTION public.notify_global_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_url text;
  v_service_key text;
  v_sender_username text;
  v_notification_title text;
  v_notification_body text;
  v_target_user_ids uuid[];
BEGIN
  IF NEW.message IS NULL OR position('@' in NEW.message) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_sender_username
  FROM public.profiles
  WHERE user_id = NEW.user_id;

  WITH extracted_mentions AS (
    SELECT DISTINCT lower((match)[1]) AS mention
    FROM regexp_matches(lower(NEW.message), '@([a-z0-9_à-ÿ]+)', 'g') AS match
  )
  SELECT COALESCE(array_agg(DISTINCT p.user_id), ARRAY[]::uuid[])
  INTO v_target_user_ids
  FROM public.profiles p
  WHERE p.user_id <> NEW.user_id
    AND (
      EXISTS (SELECT 1 FROM extracted_mentions WHERE mention = 'todos')
      OR lower(p.username) IN (
        SELECT mention FROM extracted_mentions WHERE mention <> 'todos'
      )
    );

  IF COALESCE(array_length(v_target_user_ids, 1), 0) = 0 THEN
    RETURN NEW;
  END IF;

  v_notification_title := '💬 Menção no Chat Global';
  v_notification_body := COALESCE(v_sender_username, 'Usuário') || ' mencionou você: ' || LEFT(NEW.message, 120);

  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT
    target_user_id,
    'global_chat_mention',
    v_notification_title,
    v_notification_body,
    jsonb_build_object(
      'type', 'global_chat',
      'url', '/duels',
      'sender_id', NEW.user_id,
      'message_id', NEW.id,
      'tcg_type', NEW.tcg_type
    )
  FROM unnest(v_target_user_ids) AS target_user_id;

  v_url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/send-push-notification';

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_key IS NOT NULL THEN
    PERFORM extensions.http_post(
      url := v_url,
      body := jsonb_build_object(
        'user_ids', to_jsonb(v_target_user_ids),
        'title', v_notification_title,
        'body', v_notification_body,
        'data', jsonb_build_object(
          'type', 'global_chat',
          'url', '/duels',
          'message_id', NEW.id,
          'tcg_type', NEW.tcg_type
        )
      )::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send global chat mention notification: %', SQLERRM;
    RETURN NEW;
END;
$function$;