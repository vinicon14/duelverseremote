import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const OnlineUsersCounter = () => {
  const [onlineCount, setOnlineCount] = useState(0);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const initPresence = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setOnlineCount(0);
        return;
      }

      // Create a shared presence channel that all users join
      const channelName = 'room:online';
      
      channelRef.current = supabase.channel(channelName);

      channelRef.current
        .on('presence', { event: 'sync' }, () => {
          const state = channelRef.current.presenceState();
          const count = Object.keys(state).length;
          console.log('✅ Online users synced:', count);
          setOnlineCount(count);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
          console.log('👋 User joined:', key, newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
          console.log('👋 User left:', key, leftPresences);
        })
        .subscribe(async (status: string) => {
          console.log('📡 Channel status:', status);
          if (status === 'SUBSCRIBED') {
            const presenceStatus = await channelRef.current.track({
              user_id: session.user.id,
              online_at: new Date().toISOString(),
            });
            console.log('📍 Presence tracked:', presenceStatus);
          }
        });
    };

    initPresence();

    return () => {
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
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
