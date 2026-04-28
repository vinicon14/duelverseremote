import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const OnlineUsersCounter = () => {
  const [onlineCount, setOnlineCount] = useState(0);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const initPresence = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session || !isMounted) {
        setOnlineCount(0);
        return;
      }

      // Usar o mesmo canal compartilhado para todos os usuários
      const channelName = 'room:online';
      
      channelRef.current = supabase.channel(channelName);

      channelRef.current
        .on('presence', { event: 'sync' }, () => {
          if (!isMounted || !channelRef.current) return;
          
          const state = channelRef.current.presenceState();
          const count = Object.keys(state).length;
          console.log('✅ Online users synced:', count);
          setOnlineCount(count);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
          console.log('👋 User joined:', key);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
          console.log('👋 User left:', key);
        })
        .subscribe(async (status: string) => {
          console.log('📡 Counter channel status:', status);
          if (status === 'SUBSCRIBED' && channelRef.current) {
            await channelRef.current.track({
              user_id: session.user.id,
              online_at: new Date().toISOString(),
            });
          }
        });
    };

    initPresence();

    return () => {
      isMounted = false;
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  return (
    <Badge variant="outline" className="gap-2 px-3 py-1.5">
      <Users className="w-4 h-4 text-primary" />
      <span className="text-sm font-medium">
        {onlineCount} online
      </span>
    </Badge>
  );
};
