import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  useEffect(() => {
    if (!userId) return;

    // Check if notifications are supported and permission is granted
    const hasPermission = 'Notification' in window && Notification.permission === 'granted';
    
    if (!hasPermission) return;

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

          // Show browser notification
          if (document.hidden) {
            // Only show notification if app is not visible
            new Notification(notification.title, {
              body: notification.message,
              icon: '/favicon.png',
              badge: '/favicon.png',
              tag: notification.id,
              data: notification.data,
            });
          }
        }
      )
      .subscribe();

    return () => {
      console.log('👋 Cleaning up notifications listener');
      supabase.removeChannel(channel);
    };
  }, [userId]);
};
