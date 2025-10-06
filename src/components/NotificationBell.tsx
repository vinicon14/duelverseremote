import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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

export const NotificationBell = ({ userId }: { userId: string }) => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    fetchNotifications();

    // Listen for new friend requests
    const channel = supabase
      .channel(`notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `addressee_id=eq.${userId}`
        },
        () => {
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_duels',
          filter: `player2_id=eq.${userId}`
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchNotifications = async () => {
    try {
      // Buscar pedidos de amizade pendentes
      const { data: friendRequests } = await supabase
        .from('friend_requests')
        .select(`
          *,
          requester:profiles!friend_requests_requester_id_fkey(username)
        `)
        .eq('addressee_id', userId)
        .eq('status', 'pending');

      // Buscar duelos onde o usuário foi convidado
      const { data: duelInvites } = await supabase
        .from('live_duels')
        .select(`
          *,
          player1:profiles!live_duels_player1_id_fkey(username)
        `)
        .eq('player2_id', userId)
        .eq('status', 'waiting');

      const allNotifications = [
        ...(friendRequests?.map(req => ({
          id: req.id,
          type: 'friend_request',
          message: `${req.requester?.username} quer ser seu amigo`,
          data: req,
        })) || []),
        ...(duelInvites?.map(duel => ({
          id: duel.id,
          type: 'duel_invite',
          message: `${duel.player1?.username} te desafiou para um duelo`,
          data: duel,
        })) || []),
      ];

      setNotifications(allNotifications);
      setUnreadCount(allNotifications.length);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    }
  };

  const handleNotificationClick = (notification: any) => {
    if (notification.type === 'friend_request') {
      navigate('/friends?tab=requests');
    } else if (notification.type === 'duel_invite') {
      navigate(`/duel/${notification.id}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma notificação
          </div>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className="cursor-pointer p-4 flex flex-col items-start gap-1"
            >
              <span className="font-medium text-sm">{notification.message}</span>
              <span className="text-xs text-muted-foreground">
                Clique para visualizar
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
