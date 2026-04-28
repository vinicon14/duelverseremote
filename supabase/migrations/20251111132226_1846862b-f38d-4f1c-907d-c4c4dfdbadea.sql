-- Recriar o trigger que envia push notifications quando uma notificação é criada

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS send_push_on_notification ON public.notifications;

-- Recriar a função que envia push notifications
CREATE OR REPLACE FUNCTION public.send_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Chamar a edge function de forma assíncrona usando pg_net
  PERFORM
    net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'userId', NEW.user_id::text,
        'title', NEW.title,
        'body', NEW.message,
        'data', NEW.data
      )
    );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log do erro mas não falha a inserção da notificação
    RAISE WARNING 'Erro ao enviar push notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Criar o trigger
CREATE TRIGGER send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_on_notification();