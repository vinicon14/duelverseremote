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
          setAccountType(data.account_type as 'free' | 'pro');
        }
      }
      setLoading(false);
    };

    checkAccountType();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAccountType();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { accountType, isPro: accountType === 'pro', loading };
};
