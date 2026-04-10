/**
 * DuelVerse - Profile Select (Legacy cleanup redirect)
 * 
 * Auto-deletes magic/pokemon profiles and redirects to /duels.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export default function ProfileSelect() {
  const navigate = useNavigate();

  useEffect(() => {
    const cleanup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth', { replace: true });
        return;
      }

      // Delete magic and pokemon profiles
      await supabase
        .from('tcg_profiles')
        .delete()
        .eq('user_id', user.id)
        .in('tcg_type', ['magic', 'pokemon']);

      // Ensure yugioh profile exists
      const { data: yugioh } = await supabase
        .from('tcg_profiles')
        .select('id')
        .eq('user_id', user.id)
        .eq('tcg_type', 'yugioh')
        .maybeSingle();

      if (!yugioh) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', user.id)
          .maybeSingle();
        await supabase.from('tcg_profiles').insert({
          user_id: user.id,
          tcg_type: 'yugioh',
          username: profile?.username || user.email?.split('@')[0] || 'Duelista',
        });
      }

      localStorage.setItem('activeTcg', 'yugioh');
      navigate('/duels', { replace: true });
    };

    cleanup();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
    </div>
  );
}
