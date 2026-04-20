/**
 * DuelVerse - Hook de Status Online de Amigos
 * Desenvolvido por Vinícius
 * 
 * Escuta o status online dos amigos em tempo real.
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface OnlineUser {
  user_id: string;
  online_at: string;
}

export const useFriendsOnlineStatus = (friendIds: string[]) => {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const channelRef = useRef<any>(null);

  const isOnline = useCallback((userId: string): boolean => {
    return onlineUserIds.has(userId);
  }, [onlineUserIds]);

  useEffect(() => {
    if (friendIds.length === 0) {
      setOnlineUserIds(new Set());
      return;
    }

    let isMounted = true;

    const initPresence = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session || !isMounted) return;

      const channelName = 'room:online';
      
      channelRef.current = supabase.channel(channelName);

      channelRef.current
        .on('presence', { event: 'sync' }, () => {
          if (!isMounted || !channelRef.current) return;
          
          const state = channelRef.current.presenceState();
          const onlineIds = new Set<string>();
          
          Object.values(state).forEach((presences: any) => {
            if (Array.isArray(presences)) {
              presences.forEach((presence: OnlineUser) => {
                if (presence.user_id && friendIds.includes(presence.user_id)) {
                  onlineIds.add(presence.user_id);
                }
              });
            }
          });
          
          console.log('Friends online:', onlineIds.size, 'of', friendIds.length);
          setOnlineUserIds(onlineIds);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
          if (!isMounted) return;
          
          newPresences?.forEach((presence: OnlineUser) => {
            if (presence.user_id && friendIds.includes(presence.user_id)) {
              console.log('Friend came online:', presence.user_id);
              setOnlineUserIds(prev => new Set([...prev, presence.user_id]));
            }
          });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }: any) => {
          if (!isMounted) return;
          
          leftPresences?.forEach((presence: OnlineUser) => {
            if (presence.user_id && friendIds.includes(presence.user_id)) {
              console.log('Friend went offline:', presence.user_id);
              setOnlineUserIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(presence.user_id);
                return newSet;
              });
            }
          });
        })
        .subscribe(async (status: string) => {
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
  }, [friendIds]);

  return { onlineUserIds, isOnline };
};
