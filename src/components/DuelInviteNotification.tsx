/**
 * DuelVerse - Notificação de Convite de Duelo
 * Desenvolvido por Vinícius
 * 
 * Exibe popup quando o usuário recebe um convite de duelo.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Swords } from "lucide-react";

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
  const [pendingInvite, setPendingInvite] = useState<DuelInvite | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Log quando o componente é montado
  useEffect(() => {
    console.log('🔔 [INVITE NOTIFICATION] Componente montado. CurrentUserId:', currentUserId);
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      console.log('🔔 [INVITE NOTIFICATION] Aguardando currentUserId...');
      setIsReady(false);
      return;
    }

    setIsReady(true);
    console.log('✅ [INVITE NOTIFICATION] Sistema de notificações ATIVO para:', currentUserId);

    // Buscar convites pendentes ao montar
    const fetchPendingInvites = async () => {
      console.log('🔔 [INVITE NOTIFICATION] Buscando convites pendentes...');
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
        console.error('🔔 [INVITE NOTIFICATION] Erro ao buscar convites:', error);
      } else if (data) {
        console.log('🔔 [INVITE NOTIFICATION] Convite pendente encontrado:', data);
        setPendingInvite(data as any);
      } else {
        console.log('🔔 [INVITE NOTIFICATION] Nenhum convite pendente');
      }
    };

    fetchPendingInvites();

    console.log('🔔 [INVITE NOTIFICATION] Configurando listener para user:', currentUserId);

    // Listener realtime para novos convites
    const channel = supabase
      .channel(`duel-invites-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'duel_invites',
          filter: `receiver_id=eq.${currentUserId}`,
        },
        async (payload) => {
          console.log('🔔 [INVITE NOTIFICATION] Novo convite de duelo recebido:', payload);
          
          // Tocar som de notificação (opcional)
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBCmGzu/aij0GG2S659+USwsRVrLn65djGAg+luDzxW8fByR9y+/glEIIElys5+mVWBwIK4PQ8N2dXiAELYjU8N6gUwwTUKvq8axXFAk2i9Xx0X4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhc');
            audio.play().catch(() => {});
          } catch (e) {}
          
          // Mostrar toast também
          toast({
            title: "🎮 Novo Desafio!",
            description: "Você recebeu um convite de duelo. Verifique a notificação!",
          });
          
          // Buscar dados completos do convite com informações do sender
          const { data, error } = await supabase
            .from('duel_invites')
            .select(`
              *,
              sender:profiles!duel_invites_sender_id_fkey(username, avatar_url)
            `)
            .eq('id', payload.new.id)
            .maybeSingle();

          if (!error && data) {
            console.log('🔔 [INVITE NOTIFICATION] Dados do convite carregados:', data);
            setPendingInvite(data as any);
          } else {
            console.error('🔔 [INVITE NOTIFICATION] Erro ao carregar convite:', error);
          }
        }
      )
      .subscribe((status) => {
        console.log('🔔 [INVITE NOTIFICATION] Status da subscrição:', status);
      });

    return () => {
      console.log('🔔 [INVITE NOTIFICATION] Removendo canal');
      supabase.removeChannel(channel);
    };
  }, [currentUserId, toast]);

  const handleAccept = async () => {
    if (!pendingInvite) return;

    try {
      // Verificar se o usuário já está em algum duelo ativo
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${currentUserId},opponent_id.eq.${currentUserId}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        toast({
          title: "Você já está em um duelo",
          description: "Termine ou saia do duelo atual antes de aceitar outro convite.",
          variant: "destructive",
        });
        
        // Atualizar status do convite para rejeitado
        await supabase
          .from('duel_invites')
          .update({ status: 'rejected' })
          .eq('id', pendingInvite.id);
        
        setPendingInvite(null);
        return;
      }

      // Sincroniza o TCG ativo do receptor com o TCG do duelo
      try {
        const { data: duelData } = await supabase
          .from('live_duels')
          .select('tcg_type')
          .eq('id', pendingInvite.duel_id)
          .maybeSingle();
        const duelTcg = (duelData as any)?.tcg_type || 'yugioh';
        localStorage.setItem('activeTcg', duelTcg);
      } catch {}

      // Atualizar status do convite para aceito
      const { error: updateError } = await supabase
        .from('duel_invites')
        .update({ status: 'accepted' })
        .eq('id', pendingInvite.id);

      if (updateError) throw updateError;

      toast({
        title: "Convite aceito!",
        description: "Entrando na sala de duelo...",
      });

      // Navegar para a sala do duelo
      navigate(`/duel/${pendingInvite.duel_id}`);
      setPendingInvite(null);
    } catch (error: any) {
      console.error('Erro ao aceitar convite:', error);
      toast({
        title: "Erro ao aceitar convite",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleReject = async () => {
    if (!pendingInvite) return;

    try {
      // Atualizar status do convite para rejeitado
      const { error } = await supabase
        .from('duel_invites')
        .update({ status: 'rejected' })
        .eq('id', pendingInvite.id);

      if (error) throw error;

      // Deletar a sala de duelo se ainda estiver em waiting
      await supabase
        .from('live_duels')
        .delete()
        .eq('id', pendingInvite.duel_id)
        .eq('status', 'waiting');

      toast({
        title: "Convite recusado",
        description: "Você recusou o convite de duelo.",
      });

      setPendingInvite(null);
    } catch (error: any) {
      console.error('Erro ao recusar convite:', error);
      toast({
        title: "Erro ao recusar convite",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (!pendingInvite || !isReady) {
    return null;
  }

  return (
    <AlertDialog open={true} onOpenChange={(open) => {
      if (!open) {
        handleReject();
      }
    }}>
      <AlertDialogContent className="card-mystic border-primary/30">
        <AlertDialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/20 animate-pulse">
              <Swords className="w-8 h-8 text-primary" />
            </div>
          </div>
          <AlertDialogTitle className="text-center text-2xl text-gradient-mystic">
            Convite de Duelo!
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-lg">
            <span className="font-semibold text-primary">
              {pendingInvite.sender.username}
            </span>{" "}
            te convidou para um duelo!
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-3">
          <AlertDialogCancel 
            onClick={handleReject} 
            className="w-full sm:w-auto border-destructive text-destructive hover:bg-destructive hover:text-white"
          >
            ❌ Recusar Duelo
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleAccept} 
            className="btn-mystic text-white w-full sm:w-auto"
          >
            <Swords className="w-4 h-4 mr-2" />
            ⚔️ Entrar no Duelo
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
