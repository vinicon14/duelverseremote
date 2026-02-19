import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAccountType = () => {
  const [accountType, setAccountType] = useState<'free' | 'pro'>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccountType = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const { data } = await supabase
          .from('profiles')
          .select('account_type')
          .eq('user_id', session.user.id)
          .single();
        
        if (data) {
          if (data.account_type === 'pro') {
            setAccountType('pro');
            setLoading(false);
            return;
          }
        }

        const { data: subscriptionData } = await (supabase as any)
          .from('user_subscriptions')
          .select('expires_at')
          .eq('user_id', session.user.id)
          .eq('is_active', true)
          .gte('expires_at', new Date().toISOString())
          .maybeSingle();

        if (subscriptionData) {
          setAccountType('pro');
        } else {
          setAccountType('free');
        }
      }
      setLoading(false);
    };

    checkAccountType();

    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(() => {
      checkAccountType();
    });

    const channel = supabase
      .channel('account_type_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${supabase.auth.getSession().then(({ data }) => data.session?.user?.id)}`
        },
        () => {
          checkAccountType();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_subscriptions'
        },
        () => {
          checkAccountType();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_subscriptions'
        },
        () => {
          checkAccountType();
        }
      )
      .subscribe();

    return () => {
      authSubscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  return { accountType, isPro: accountType === 'pro', loading };
};
