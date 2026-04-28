CREATE TRIGGER on_global_chat_message_insert
  AFTER INSERT ON public.global_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_global_chat_message();