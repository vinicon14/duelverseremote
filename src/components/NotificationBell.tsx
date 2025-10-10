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

    // Listen for new friend requests and duel invites
    const channel = supabase
      .channel(`notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `receiver_id=eq.${userId}`
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
          table: 'duel_invites',
          filter: `receiver_id=eq.${userId}`
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
        .select('*, sender:profiles!friend_requests_sender_id_fkey(username)')
        .eq('receiver_id', userId)
        .eq('status', 'pending');

      // Buscar duelos onde o usuário foi convidado (via duel_invites)
      const { data: duelInvites } = await supabase
        .from('duel_invites')
        .select(`
          *,
          duel:live_duels(id, is_ranked, status),
          sender:profiles!duel_invites_sender_id_fkey(username)
        `)
        .eq('receiver_id', userId)
        .eq('status', 'pending');

      const allNotifications = [
        ...(friendRequests?.map(req => ({
          id: req.id,
          type: 'friend_request',
          message: `${(req.sender as any)?.username || 'Alguém'} quer ser seu amigo`,
          data: req,
        })) || []),
        ...(duelInvites?.map(invite => ({
          id: invite.id,
          duelId: invite.duel_id,
          type: 'duel_invite',
          message: `${(invite.sender as any)?.username || 'Alguém'} te desafiou para um duelo ${(invite.duel as any)?.is_ranked ? '🏆 ranqueado' : '🎮 casual'}`,
          data: invite,
        })) || []),
      ];

      setNotifications(allNotifications);
      setUnreadCount(allNotifications.length);
    } catch (error) {
      console.error('Erro ao carregar notificações:', error);
    }
  };

  const handleNotificationClick = async (notification: any) => {
    if (notification.type === 'friend_request') {
      navigate('/friends?tab=requests');
    } else if (notification.type === 'duel_invite') {
      // Marcar convite como aceito e entrar no duelo
      try {
        await supabase
          .from('duel_invites')
          .update({ status: 'accepted' })
          .eq('id', notification.id);
        
        navigate(`/duel/${notification.duelId}`);
      } catch (error) {
        console.error('Erro ao aceitar convite:', error);
        navigate(`/duel/${notification.duelId}`);
      }
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
