import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const OnlineUsersCounter = () => {
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    const fetchOnlineUsers = async () => {
      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_online', true);
      
      setOnlineCount(count || 0);
    };

    fetchOnlineUsers();

    // Subscribe to profile changes
    const channel = supabase
      .channel('online-users-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: 'is_online=eq.true'
        },
        () => {
          fetchOnlineUsers();
        }
      )
      .subscribe();

    // Refresh count every minute
    const interval = setInterval(fetchOnlineUsers, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
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
