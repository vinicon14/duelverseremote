import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

interface DuelInvite {
  id: string;
  duel_id: string;
  sender: {
    username: string;
    avatar_url: string;
  };
  duel: {
    is_ranked: boolean;
    status: string;
  };
}

export const DuelInvitePopup = ({ userId }: { userId: string | undefined }) => {
  const navigate = useNavigate();
  const [invite, setInvite] = useState<DuelInvite | null>(null);
  const [processedInvites, setProcessedInvites] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) return;

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
          const latestInvite = invites[0] as any;
          // Só mostrar se o duelo ainda está esperando
          if (latestInvite.duel?.status === 'waiting' && !processedInvites.has(latestInvite.id)) {
            setInvite(latestInvite);
            setProcessedInvites(prev => new Set(prev).add(latestInvite.id));
          }
        }
      } catch (error) {
        console.error('Erro ao verificar convites pendentes:', error);
      }
    };

    checkPendingInvites();

    // Listener em tempo real para novos convites
    const channel = supabase
      .channel(`duel_invites_popup_${userId}`)
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
            const { data: newInvite } = await supabase
              .from('duel_invites')
              .select(`
                id,
                duel_id,
                sender:profiles!duel_invites_sender_id_fkey(username, avatar_url),
                duel:live_duels(is_ranked, status)
              `)
              .eq('id', payload.new.id)
              .single();

            if (newInvite && !processedInvites.has(newInvite.id)) {
              setInvite(newInvite as any);
              setProcessedInvites(prev => new Set(prev).add(newInvite.id));
              
              // Tocar som de notificação (opcional)
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBy/LaizsIGGS57OyhUBELTKXh8bllHAU2jdXzzn0vBSF0xPDdl0QKElyw6OyrWBQLRJvi8sFuIwUrfsfx3I4+CRdjuOvvoVIRC0ml4fG6ZxwFNo/X8s18LgUhc8Tv3phFChJbr+jur1sVDEKZ4PK+cSMFKnvF8NyQPwkWYrfr76RUEQtHo+HxtGkcBTWL1PLPfi8GIHHB79yaRwkRWK7n7LFeIgcrfsXu3JE/CBVftuvtoV8YC0mi4PG1bR4FPZLW8sx+MQgfdL/u3Z1KCxFYrez0pGQaDj+Y3vHBcCQFKnjE7tySQAcUW7Tr6pVpHAM+ldvxwHImByF4u+3dnVUPFV+96/CkbCQON4rW8sZ+PAgfesvv3J5ODxdgu+rrpXEhEkCW2vC/diYGHnm+7N2gWRUSV6zl6qZxKRMxidPvw3s1Dx18yO7dlFgWFV2w5euocisQN4fP7MBwOwwQbsPq6qF4LhI6j9XuwHo6EBl5vu3cmlkVEleq4+qmcisTMYfS78J7Nw4ffMbq3JdaGBVerunro30yFDSEx+bBcz4LEG6/6uigeSUaNJDU77x4OQ8SeMXt3JVgGRJYpOPpnnErETaH0O7Be0QPHnvH69uWZB0UX6vn6aN+NBEzhcfl');
              audio.volume = 0.3;
              audio.play().catch(() => {});
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
  }, [userId]);

  const handleAccept = async () => {
    if (!invite) return;
    
    try {
      await supabase
        .from('duel_invites')
        .update({ status: 'accepted' })
        .eq('id', invite.id);
      
      setInvite(null);
      navigate(`/duel/${invite.duel_id}`);
    } catch (error) {
      console.error('Erro ao aceitar convite:', error);
    }
  };

  const handleReject = async () => {
    if (!invite) return;
    
    try {
      await supabase
        .from('duel_invites')
        .update({ status: 'rejected' })
        .eq('id', invite.id);
      
      setInvite(null);
    } catch (error) {
      console.error('Erro ao recusar convite:', error);
    }
  };

  if (!invite) return null;

  const matchType = invite.duel.is_ranked ? "🏆 Ranqueada" : "🎮 Casual";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <Card className="card-mystic max-w-md w-full border-2 border-primary shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="relative p-6">
          {/* Botão fechar */}
          <button
            onClick={handleReject}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Conteúdo */}
          <div className="text-center space-y-4">
            {/* Ícone */}
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <Swords className="w-8 h-8 text-primary" />
            </div>

            {/* Título */}
            <div>
              <h2 className="text-2xl font-bold text-gradient-mystic mb-1">
                Desafio de Duelo!
              </h2>
              <p className="text-sm text-muted-foreground">
                Você recebeu um convite para batalhar
              </p>
            </div>

            {/* Avatar e nome do desafiante */}
            <div className="flex items-center justify-center gap-3 py-4">
              <Avatar className="w-16 h-16 border-2 border-primary">
                <AvatarImage src={invite.sender.avatar_url} />
                <AvatarFallback className="bg-primary/20 text-lg">
                  {invite.sender.username?.charAt(0).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <p className="font-bold text-lg">{invite.sender.username}</p>
                <p className="text-sm text-muted-foreground">te desafiou!</p>
              </div>
            </div>

            {/* Tipo de partida */}
            <div className="inline-block px-4 py-2 rounded-full bg-primary/20 text-primary font-semibold">
              {matchType}
            </div>

            {/* Botões de ação */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleReject}
                variant="outline"
                className="flex-1"
                size="lg"
              >
                Recusar
              </Button>
              <Button
                onClick={handleAccept}
                className="flex-1 btn-mystic text-white"
                size="lg"
              >
                <Swords className="w-4 h-4 mr-2" />
                Aceitar
              </Button>
            </div>

            {/* Timer visual */}
            <p className="text-xs text-muted-foreground">
              Este convite expira em breve
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
