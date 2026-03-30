/**
 * DuelVerse - Hook de Notificações em Tempo Real
 * Desenvolvido por Vinícius
 * 
 * Escuta notificações em tempo real via Supabase Realtime.
 * Exibe notificações no navegador quando recebidas.
 */
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

  // On native app, always set up listener regardless of permission state
  const isNativeApp = navigator.userAgent.includes('DuelVerseApp');
  const shouldListen = isNativeApp || hasPermission;

  useEffect(() => {
    console.log('🔍 useRealtimeNotifications:', { userId, hasPermission, isNativeApp, shouldListen });
    
    if (!userId) {
      console.log('⚠️ No userId, skipping notification setup');
      return;
    }
    
    if (!shouldListen) {
      console.log('⚠️ No notification permission and not native, skipping setup');
      return;
    }

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

          showNotification(notification.title, {
            body: notification.message,
            tag: notification.id,
            data: notification.data,
          });
        }
      )
      .subscribe();

    // Subscribe to global chat messages
    const globalChatChannel = supabase
      .channel('global-chat-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'global_chat_messages',
        },
        async (payload) => {
          const msg = payload.new as { id: string; user_id: string; message: string };
          // Don't notify for own messages
          if (msg.user_id === userId) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('user_id', msg.user_id)
            .single();

          const senderName = profile?.username || 'Usuário';

          showNotification(`💬 ${senderName}`, {
            body: msg.message,
            tag: `global-chat-${msg.id}`,
            data: { type: 'global_chat', url: '/duels' },
          });
        }
      )
      .subscribe();

    return () => {
      console.log('👋 Cleaning up notifications listener');
      supabase.removeChannel(channel);
      supabase.removeChannel(globalChatChannel);
    };
  }, [userId, shouldListen, showNotification]);
};
