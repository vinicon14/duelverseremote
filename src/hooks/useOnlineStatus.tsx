import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useOnlineStatus = () => {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const setupPresence = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) return;

      const userId = session.user.id;
      
      // Atualizar status no banco
      await supabase
        .from('profiles')
        .update({
          is_online: true,
          last_seen: new Date().toISOString(),
        })
        .eq('user_id', userId);

      // Configurar presença em tempo real
      channelRef.current = supabase.channel('online-users');
      
      // Rastrear presença do usuário
      await channelRef.current
        .on('presence', { event: 'sync' }, () => {
          const state = channelRef.current.presenceState();
          console.log('Usuários online:', Object.keys(state).length);
        })
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            await channelRef.current.track({
              user_id: userId,
              online_at: new Date().toISOString(),
            });
          }
        });

      // Heartbeat a cada 15 segundos
      const heartbeat = setInterval(async () => {
        await supabase
          .from('profiles')
          .update({
            is_online: true,
            last_seen: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }, 15000);

      // Cleanup ao sair
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
        clearInterval(heartbeat);
        
        if (channelRef.current) {
          channelRef.current.untrack();
          supabase.removeChannel(channelRef.current);
        }
        
        // Marcar como offline
        supabase
          .from('profiles')
          .update({
            is_online: false,
            last_seen: new Date().toISOString(),
          })
          .eq('user_id', userId);
      };
    };

    const cleanup = setupPresence();
    
    return () => {
      cleanup.then((fn) => fn && fn());
    };
  }, []);
};
