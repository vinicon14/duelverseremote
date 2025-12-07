import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useOnlineStatus = () => {
  const channelRef = useRef<any>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let isMounted = true;

    const setupPresence = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user || !isMounted) return;

      const userId = session.user.id;

      // Atualizar status como online no banco
      await supabase
        .from('profiles')
        .update({
          is_online: true,
          last_seen: new Date().toISOString(),
        })
        .eq('user_id', userId);

      // Usar o mesmo canal compartilhado do contador de usuários online
      const channelName = 'room:online';
      
      channelRef.current = supabase.channel(channelName);

      channelRef.current
        .on('presence', { event: 'sync' }, () => {
          const state = channelRef.current?.presenceState() || {};
          console.log('📊 Online users:', Object.keys(state).length);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }: any) => {
          console.log('👋 User joined:', key);
        })
        .on('presence', { event: 'leave' }, async ({ key, leftPresences }: any) => {
          console.log('👋 User left:', key);
          // Quando um usuário sai, marcar como offline no banco
          if (leftPresences && leftPresences.length > 0) {
            const leftUserId = leftPresences[0]?.user_id;
            if (leftUserId) {
              await supabase
                .from('profiles')
                .update({
                  is_online: false,
                  last_seen: new Date().toISOString(),
                })
                .eq('user_id', leftUserId);
            }
          }
        })
        .subscribe(async (status: string) => {
          console.log('📡 Presence channel status:', status);
          if (status === 'SUBSCRIBED' && channelRef.current) {
            await channelRef.current.track({
              user_id: userId,
              online_at: new Date().toISOString(),
            });
            console.log('✅ Presence tracked for user:', userId);
          }
        });

      // Heartbeat a cada 30 segundos para manter o status atualizado
      heartbeatRef.current = setInterval(async () => {
        if (!isMounted) return;
        
        await supabase
          .from('profiles')
          .update({
            is_online: true,
            last_seen: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }, 30000);

      // Cleanup ao sair da página
      const handleBeforeUnload = async () => {
        await supabase
          .from('profiles')
          .update({
            is_online: false,
            last_seen: new Date().toISOString(),
          })
          .eq('user_id', userId);
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('pagehide', handleBeforeUnload);

      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
        window.removeEventListener('pagehide', handleBeforeUnload);
      };
    };

    setupPresence();

    return () => {
      isMounted = false;
      
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
      }
    };
  }, []);
};
