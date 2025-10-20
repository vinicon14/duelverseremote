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
      channelRef.current = supabase.channel('online-presence', {
        config: {
          presence: {
            key: session.user.id,
          },
        },
      });

      channelRef.current
        .on('presence', { event: 'sync' }, () => {
          const state = channelRef.current.presenceState();
          const count = Object.keys(state).length;
          console.log('Online users count:', count, state);
          setOnlineCount(count);
        })
        .on('presence', { event: 'join' }, ({ newPresences }: any) => {
          console.log('User joined:', newPresences);
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }: any) => {
          console.log('User left:', leftPresences);
        })
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            await channelRef.current.track({
              user_id: session.user.id,
              online_at: new Date().toISOString(),
            });
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
