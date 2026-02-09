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
          const accountTypeValue = data.account_type as 'free' | 'pro';
          setAccountType(accountTypeValue);
          
          // Only set isProUser = true for Pro users
          // Free users will have isProUser undefined, so ads will show
          if (typeof window !== 'undefined' && accountTypeValue === 'pro') {
            window.isProUser = true;
          }
        }
      }
      setLoading(false);
    };

    checkAccountType();

    // Listener para mudanças de autenticação
    const { data: { subscription: authSubscription } } = supabase.auth.onAuthStateChange(() => {
      checkAccountType();
    });

    // Listener para mudanças em tempo real no perfil do usuário
    const channel = supabase
      .channel('account_type_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          console.log('Account type changed:', payload);
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
