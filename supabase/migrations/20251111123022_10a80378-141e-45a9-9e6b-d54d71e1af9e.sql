-- Habilitar extensão http para fazer requisições
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- Criar função que envia push notification automaticamente
CREATE OR REPLACE FUNCTION send_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  project_url text;
  service_role_key text;
  function_url text;
  request_id bigint;
BEGIN
  -- Obter URL do projeto
  project_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- Se não estiver configurado, usar valores padrão
  IF project_url IS NULL THEN
    project_url := 'https://xxttwzewtqxvpgefggah.supabase.co';
  END IF;
  
  -- Construir URL da função
  function_url := project_url || '/functions/v1/send-push-notification';
  
  -- Fazer requisição HTTP assíncrona para a edge function
  SELECT extensions.http_post(
    function_url,
    jsonb_build_object(
      'userId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'data', NEW.data
    )::text,
    'application/json'
  ) INTO request_id;
  
  RAISE NOTICE 'Push notification request sent for notification %', NEW.id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Criar trigger que dispara após inserir notificação
DROP TRIGGER IF EXISTS on_notification_created ON notifications;
CREATE TRIGGER on_notification_created
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_push_on_notification();

-- Adicionar comentário explicativo
COMMENT ON FUNCTION send_push_on_notification() IS 'Automatically sends push notifications when a new notification is created';
COMMENT ON TRIGGER on_notification_created ON notifications IS 'Triggers push notification sending when new notification is inserted';