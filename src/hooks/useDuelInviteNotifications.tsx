/**
 * DuelVerse - Hook de Notificações de Convite de Duelo
 * Desenvolvido por Vinícius
 * 
 * Escuta e exibe notificações de convite para dueloes em tempo real.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DuelInvite {
  id: string;
  duel_id: string;
  sender: {
    username: string;
    avatar_url: string;
  };
  duel: {
    is_ranked: boolean;
  };
}

export const useDuelInviteNotifications = (userId: string | undefined) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [processedInvites, setProcessedInvites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

    // Função para mostrar notificação de convite
    const showInviteNotification = (invite: DuelInvite) => {
      // Evitar duplicatas
      if (processedInvites.has(invite.id)) return;
      
      setProcessedInvites(prev => new Set(prev).add(invite.id));

      const matchType = invite.duel.is_ranked ? "🏆 Ranqueada" : "🎮 Casual";
      
      toast({
        title: "🎯 Novo Desafio de Duelo!",
        description: (
          <div className="space-y-3">
            <p className="text-sm">
              <strong>{invite.sender.username}</strong> te desafiou para uma partida <strong>{matchType}</strong>!
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await supabase
                      .from('duel_invites')
                      .update({ status: 'accepted' })
                      .eq('id', invite.id);
                    
                    navigate(`/duel/${invite.duel_id}`);
                  } catch (error) {
                    console.error('Erro ao aceitar convite:', error);
                  }
                }}
                className="flex-1 btn-mystic text-white"
              >
                <Swords className="w-4 h-4 mr-2" />
                Aceitar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await supabase
                      .from('duel_invites')
                      .update({ status: 'rejected' })
                      .eq('id', invite.id);
                  } catch (error) {
                    console.error('Erro ao recusar convite:', error);
                  }
                }}
                className="flex-1"
              >
                Recusar
              </Button>
            </div>
          </div>
        ),
        duration: 30000, // 30 segundos
      });
    };

    // Verificar convites pendentes ao carregar
    const checkPendingInvites = async () => {
      try {
        const { data: invites } = await supabase
          .from('duel_invites')
          .select(`
            id,
            duel_id,
            sender:profiles!duel_invites_sender_id_fkey(username, avatar_url),
            duel:live_duels(is_ranked, status)
          `)
          .eq('receiver_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (invites && invites.length > 0) {
          // Mostrar apenas o convite mais recente se houver múltiplos
          const latestInvite = invites[0] as any;
          if (latestInvite.duel?.status === 'waiting') {
            showInviteNotification(latestInvite);
          }
        }
      } catch (error) {
        console.error('Erro ao verificar convites pendentes:', error);
      }
    };

    checkPendingInvites();

    // Listener em tempo real para novos convites
    const channel = supabase
      .channel(`duel_invites_realtime_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'duel_invites',
          filter: `receiver_id=eq.${userId}`,
        },
        async (payload) => {
          console.log('🔔 Novo convite de duelo recebido:', payload);
          
          // Buscar dados completos do convite
          try {
            const { data: invite } = await supabase
              .from('duel_invites')
              .select(`
                id,
                duel_id,
                sender:profiles!duel_invites_sender_id_fkey(username, avatar_url),
                duel:live_duels(is_ranked, status)
              `)
              .eq('id', payload.new.id)
              .single();

            if (invite) {
              showInviteNotification(invite as any);
            }
          } catch (error) {
            console.error('Erro ao buscar dados do convite:', error);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, toast, navigate]);
};
