import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

interface DBNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  read: boolean;
  created_at: string;
}

export const NotificationBell = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);

  const getDismissedFriendRequestIds = useCallback(() => {
    if (!userId) return [] as string[];

    try {
      const stored = localStorage.getItem(`dismissed_friend_requests_${userId}`);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }, [userId]);

  const setDismissedFriendRequestIds = useCallback((ids: string[]) => {
    if (!userId) return;
    localStorage.setItem(`dismissed_friend_requests_${userId}`, JSON.stringify(ids));
  }, [userId]);

  const dismissFriendRequestNotifications = useCallback((ids: string[]) => {
    if (ids.length === 0) return;

    const mergedIds = Array.from(new Set([...getDismissedFriendRequestIds(), ...ids]));
    setDismissedFriendRequestIds(mergedIds);
  }, [getDismissedFriendRequestIds, setDismissedFriendRequestIds]);

  const fetchNotifications = useCallback(async () => {
    try {
      // Fetch all persisted notifications (unread)
      const { data: dbNotifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('read', false)
        .order('created_at', { ascending: false })
        .limit(50);

      // Fetch pending friend requests
      const { data: friendRequests } = await supabase
        .from('friend_requests')
        .select('*, sender:profiles!friend_requests_sender_id_fkey(username)')
        .eq('receiver_id', userId)
        .eq('status', 'pending');

      const pendingFriendRequests = friendRequests || [];
      const activeFriendRequestIds = new Set(pendingFriendRequests.map(req => req.id));
      const dismissedFriendRequestIds = getDismissedFriendRequestIds();
      const validDismissedFriendRequestIds = dismissedFriendRequestIds.filter(id => activeFriendRequestIds.has(id));

      if (validDismissedFriendRequestIds.length !== dismissedFriendRequestIds.length) {
        setDismissedFriendRequestIds(validDismissedFriendRequestIds);
      }

      const dismissedFriendRequestIdSet = new Set(validDismissedFriendRequestIds);

      const friendNotifs: DBNotification[] = pendingFriendRequests
        .filter(req => !dismissedFriendRequestIdSet.has(req.id))
        .map(req => ({
          id: `fr_${req.id}`,
          user_id: userId,
          type: 'friend_request',
          title: '👋 Pedido de Amizade',
          message: `${(req.sender as any)?.username || 'Alguém'} quer ser seu amigo`,
          data: req,
          read: false,
          created_at: req.created_at,
        }));

      const allNotifications = [
        ...(dbNotifications || []),
        ...friendNotifs,
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setNotifications(allNotifications);
      setUnreadCount(allNotifications.length);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    }
  }, [getDismissedFriendRequestIds, setDismissedFriendRequestIds, userId]);

  useEffect(() => {
    if (!userId) return;

    fetchNotifications();

    // Listen for new notifications in realtime
    const channel = supabase
      .channel(`bell_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const newNotif = payload.new as DBNotification;
          setNotifications(prev => [newNotif, ...prev]);
          setUnreadCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `receiver_id=eq.${userId}`,
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchNotifications, userId]);

  const handleNotificationClick = (notification: DBNotification) => {
    const url = notification.data?.url;
    if (notification.type === 'friend_request') {
      navigate('/friends?tab=requests');
    } else if (url) {
      navigate(url);
    }
  };

  const handleDismiss = async (e: React.MouseEvent, notification: DBNotification) => {
    e.stopPropagation();

    if (notification.type === 'friend_request') {
      dismissFriendRequestNotifications([notification.id.replace('fr_', '')]);
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
      setUnreadCount(prev => Math.max(0, prev - 1));
      return;
    }

    // Mark as read in DB
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notification.id);

    setNotifications(prev => prev.filter(n => n.id !== notification.id));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllNotificationsAsRead = useCallback(async () => {
    while (true) {
      const { data, error } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .or('read.eq.false,read.is.null')
        .limit(500);

      if (error) throw error;

      const ids = (data || []).map(notification => notification.id);

      if (ids.length === 0) {
        break;
      }

      const { error: updateError } = await supabase
        .from('notifications')
        .update({ read: true })
        .in('id', ids);

      if (updateError) throw updateError;

      if (ids.length < 500) {
        break;
      }
    }
  }, [userId]);

  const handleDismissAll = async () => {
    if (isClearingAll) return;

    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    const friendRequestIds = notifications
      .filter(n => n.id.startsWith('fr_'))
      .map(n => n.id.replace('fr_', ''));

    setIsClearingAll(true);

    try {
      dismissFriendRequestNotifications(friendRequestIds);
      setNotifications([]);
      setUnreadCount(0);

      await markAllNotificationsAsRead();
      setOpen(false);
    } catch (error) {
      console.error('Erro ao limpar notificações:', error);
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      fetchNotifications();
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleDismissAllInteraction = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    await handleDismissAll();
  };

  const formatTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd/MM HH:mm');
    } catch {
      return '';
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={(nextOpen) => !isClearingAll && setOpen(nextOpen)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        {notifications.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground">Notificações</span>
            <button
              type="button"
              disabled={isClearingAll}
              className="text-xs h-6 px-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
              onClick={handleDismissAllInteraction}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {isClearingAll ? 'Limpando...' : 'Limpar tudo'}
            </button>
          </div>
        )}
        <ScrollArea className="h-[320px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className="cursor-pointer px-4 py-3 flex items-start gap-2 border-b border-border/50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm block">{notification.title}</span>
                  <span className="text-xs text-muted-foreground block truncate">{notification.message}</span>
                  <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                    {formatTime(notification.created_at)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={(e) => handleDismiss(e, notification)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
