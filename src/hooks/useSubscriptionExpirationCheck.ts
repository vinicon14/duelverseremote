import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useSubscriptionExpirationCheck = () => {
  useEffect(() => {
    const checkExpiredSubscriptions = async () => {
      try {
        await supabase.rpc('check_expired_subscriptions');
      } catch (error) {
        console.error('Error checking expired subscriptions:', error);
      }
    };

    checkExpiredSubscriptions();

    const interval = setInterval(() => {
      checkExpiredSubscriptions();
    }, 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);
};
