CREATE OR REPLACE FUNCTION public.replicate_chat_to_discord()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_service_key text;
  v_username text;
  v_avatar text;
  v_payload jsonb;
BEGIN
  -- Buscar nome/avatar: primeiro tenta Discord vinculado, senão usa perfil
  SELECT 
    COALESCE(dl.discord_username, p.username) AS uname,
    COALESCE(dl.discord_avatar_url, p.avatar_url) AS av
    INTO v_username, v_avatar
  FROM public.profiles p
  LEFT JOIN public.discord_links dl ON dl.user_id = p.user_id
  WHERE p.user_id = NEW.user_id;

  IF v_username IS NULL THEN
    RETURN NEW;
  END IF;

  v_url := 'https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-bridge';

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
  LIMIT 1;

  IF v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'type', 'chat_to_discord',
    'username', v_username,
    'avatarUrl', v_avatar,
    'content', NEW.message,
    'userId', NEW.user_id
  );

  BEGIN
    PERFORM extensions.http_post(
      url := v_url,
      body := v_payload::text,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Discord replication failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_replicate_chat_to_discord ON public.global_chat_messages;
CREATE TRIGGER trg_replicate_chat_to_discord
  AFTER INSERT ON public.global_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.replicate_chat_to_discord();