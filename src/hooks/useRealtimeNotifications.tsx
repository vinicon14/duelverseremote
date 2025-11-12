import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBrowserNotifications } from "./useBrowserNotifications";

interface NotificationData {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  created_at: string;
}

export const useRealtimeNotifications = (userId: string | undefined) => {
  const { hasPermission, showNotification } = useBrowserNotifications();

  useEffect(() => {
    if (!userId || !hasPermission) return;

    console.log('👂 Setting up realtime notifications listener');

    // Subscribe to new notifications
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = payload.new as NotificationData;
          console.log('🔔 New notification received:', notification);

          // Always show browser notification
          showNotification(notification.title, {
            body: notification.message,
            tag: notification.id,
            data: notification.data,
          });
        }
      )
      .subscribe();

    return () => {
      console.log('👋 Cleaning up notifications listener');
      supabase.removeChannel(channel);
    };
  }, [userId, hasPermission, showNotification]);
};
