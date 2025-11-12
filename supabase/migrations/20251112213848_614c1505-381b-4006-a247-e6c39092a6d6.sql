-- Remove os triggers primeiro
DROP TRIGGER IF EXISTS on_notification_created ON public.notifications;
DROP TRIGGER IF EXISTS send_push_on_notification ON public.notifications;

-- Agora remove a função com CASCADE para garantir
DROP FUNCTION IF EXISTS public.send_push_on_notification() CASCADE;