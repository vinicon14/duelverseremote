import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DuelInvite {
  id: string;
  sender_id: string;
  receiver_id: string;
  duel_id: string;
  status: string;
  sender: {
    username: string;
    avatar_url: string | null;
  };
}

export const DuelInviteNotification = ({ currentUserId }: { currentUserId?: string }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isReady, setIsReady] = useState(false);
  const lastInviteIdRef = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  // Função para verificar convites pendentes
  const checkPendingInvites = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const { data, error } = await supabase
        .from('duel_invites')
        .select(`
          *,
          sender:profiles!duel_invites_sender_id_fkey(username, avatar_url)
        `)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('🔔 [INVITE] Erro ao buscar convites:', error);
        return;
      }

      if (data && data.id !== lastInviteIdRef.current) {
        console.log('🔔 [INVITE] Convite pendente encontrado:', data);
        lastInviteIdRef.current = data.id;
        
        // Tocar som de notificação
        try {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBCmGzu/aij0GG2S659+USwsRVrLn65djGAg+luDzxW8fByR9y+/glEIIElys5+mVWBwIK4PQ8N2dXiAELYjU8N6gUwwTUKvq8axXFAk2i9Xx0X4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhc');
          audio.play().catch(() => {});
        } catch (e) {}

        // Mostrar toast
        toast({
          title: "🎮 Novo Desafio!",
          description: `${(data.sender as any).username} te convidou para um duelo!`,
        });

        // Redirecionar para página de convite
        navigate(`/invite/${data.id}`, { replace: true });
      }
    } catch (err) {
      console.error('🔔 [INVITE] Erro:', err);
    }
  }, [currentUserId, navigate, toast]);

  useEffect(() => {
    console.log('🔔 [INVITE] Componente montado. UserId:', currentUserId);
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      setIsReady(false);
      return;
    }

    setIsReady(true);
    console.log('✅ [INVITE] Sistema ativo para:', currentUserId);

    // Verificar imediatamente
    checkPendingInvites();

    // Configurar polling a cada 3 segundos para garantir que não perca nenhum convite
    intervalRef.current = window.setInterval(checkPendingInvites, 3000);

    // Listener realtime para novos convites
    const channel = supabase
      .channel(`duel-invites-global-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'duel_invites',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          console.log('🔔 [INVITE] Novo convite realtime:', payload);
          
          // Pequeno delay para garantir que os dados estão disponíveis
          setTimeout(() => {
            lastInviteIdRef.current = null; // Reset para permitir novo convite
            checkPendingInvites();
          }, 500);
        }
      )
      .subscribe();

    return () => {
      console.log('🔔 [INVITE] Cleanup');
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [currentUserId, checkPendingInvites]);

  // O componente não renderiza nada - apenas gerencia redirects
  return null;
};
