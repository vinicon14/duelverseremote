-- Recriar trigger usando extensão pg_net corretamente

-- Verificar se pg_net está habilitada
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Recriar a função de envio de push usando pg_net
CREATE OR REPLACE FUNCTION public.send_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id bigint;
  supabase_url text := 'https://xxttwzewtqxvpgefggah.supabase.co';
BEGIN
  -- Fazer requisição HTTP assíncrona
  SELECT net.http_post(
    url := supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'userId', NEW.user_id::text,
      'title', NEW.title,
      'body', NEW.message,
      'data', NEW.data
    )
  ) INTO request_id;
  
  RAISE NOTICE 'Push notification request sent: %', request_id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;