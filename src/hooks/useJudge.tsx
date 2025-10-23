import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useJudge = () => {
  const [isJudge, setIsJudge] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkJudge = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'judge')
          .maybeSingle();
        
        setIsJudge(!!data);
      } else {
        setIsJudge(false);
      }
      setLoading(false);
    };

    checkJudge();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkJudge();
    });

    return () => subscription.unsubscribe();
  }, []);

  return { isJudge, loading };
};
