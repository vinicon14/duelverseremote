import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useOnlineStatus = () => {
  useEffect(() => {
    const updateOnlineStatus = async (isOnline: boolean) => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        await supabase
          .from('profiles')
          .update({
            is_online: isOnline,
            last_seen: new Date().toISOString(),
          })
          .eq('user_id', session.user.id);
      }
    };

    // Set user as online when component mounts
    updateOnlineStatus(true);

    // Set user as offline when page is closed/refreshed
    const handleBeforeUnload = () => {
      updateOnlineStatus(false);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Update online status periodically (every 30 seconds)
    const interval = setInterval(() => {
      updateOnlineStatus(true);
    }, 30000);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(interval);
      updateOnlineStatus(false);
    };
  }, []);
};
