import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useAccountType = () => {
  const [accountType, setAccountType] = useState<'free' | 'pro'>('free');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAccountType = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        console.log('Checking account type for user:', session.user.id);
        
        const { data, error } = await supabase
          .from('profiles')
          .select('account_type')
          .eq('user_id', session.user.id)
          .single();
        
        console.log('Profile data:', data, 'Error:', error);
        
        if (data && data.account_type === 'pro') {
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
          event: '*',
          schema: 'public',
          table: 'profiles'
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
