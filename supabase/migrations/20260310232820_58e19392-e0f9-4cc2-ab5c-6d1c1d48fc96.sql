
-- Drop existing triggers first, then recreate all

DROP TRIGGER IF EXISTS trigger_notify_global_chat_push ON public.global_chat_messages;
DROP TRIGGER IF EXISTS trigger_notify_new_duel_room ON public.live_duels;
DROP TRIGGER IF EXISTS trigger_send_push_on_notification ON public.notifications;
DROP TRIGGER IF EXISTS trigger_notify_friend_request_push ON public.friend_requests;
DROP TRIGGER IF EXISTS trigger_notify_new_news ON public.news;
DROP TRIGGER IF EXISTS trigger_notify_tournament_status ON public.tournaments;
DROP TRIGGER IF EXISTS trigger_notify_private_message ON public.private_messages;
DROP TRIGGER IF EXISTS trigger_notify_duel_invite ON public.duel_invites;
DROP TRIGGER IF EXISTS trigger_notify_tournament_chat ON public.tournament_chat_messages;
DROP TRIGGER IF EXISTS trigger_update_level ON public.profiles;

-- Recreate all triggers
CREATE TRIGGER trigger_notify_global_chat_push
  AFTER INSERT ON public.global_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_global_chat_message();

CREATE TRIGGER trigger_notify_new_duel_room
  AFTER INSERT ON public.live_duels
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_duel_room();

CREATE TRIGGER trigger_send_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.send_push_via_edge_function();

CREATE TRIGGER trigger_notify_friend_request_push
  AFTER INSERT OR UPDATE ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_friend_request_push();

CREATE TRIGGER trigger_notify_new_news
  AFTER INSERT ON public.news
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_news();

CREATE TRIGGER trigger_notify_tournament_status
  AFTER UPDATE ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_tournament_status_change();

CREATE TRIGGER trigger_notify_private_message
  AFTER INSERT ON public.private_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_private_message();

CREATE TRIGGER trigger_notify_duel_invite
  AFTER INSERT ON public.duel_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_duel_invite();

CREATE TRIGGER trigger_notify_tournament_chat
  AFTER INSERT ON public.tournament_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_tournament_chat_message();

CREATE TRIGGER trigger_update_level
  BEFORE UPDATE OF points ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_level_on_points_change();

-- Ensure http extension is available
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
