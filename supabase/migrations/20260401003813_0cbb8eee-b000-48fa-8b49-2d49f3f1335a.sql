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
  v_payload jsonb;
BEGIN
  -- Only send push if message contains @ mention
  IF position('@' in NEW.message) = 0 THEN
    RETURN NEW;
  END IF;

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
    'title', '💬 Chat Global',
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
$function$;