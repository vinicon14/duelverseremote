import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useBanCheck = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const checkBanStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return;

        // Verificar status de banimento
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('is_banned')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (error) {
          console.error("Error checking ban status:", error);
          return;
        }

        if (profile?.is_banned) {
          // Usuário está banido - fazer logout imediatamente
          toast.error("Sua conta foi suspensa. Entre em contato com o suporte.");
          await supabase.auth.signOut();
          navigate('/auth');
        }
      } catch (error) {
        console.error("Unexpected error in ban check:", error);
      }
    };

    // Verificar imediatamente
    checkBanStatus();

    // Configurar listener para mudanças em tempo real
    const channel = supabase
      .channel('ban_status_check')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${supabase.auth.getUser().then(({ data }) => data.user?.id)}`
        },
        (payload) => {
          if (payload.new.is_banned) {
            toast.error("Sua conta foi suspensa. Entre em contato com o suporte.");
            supabase.auth.signOut();
            navigate('/auth');
          }
        }
      )
      .subscribe();

    // Verificar periodicamente a cada 30 segundos
    const interval = setInterval(checkBanStatus, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [navigate]);
};
