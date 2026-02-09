import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Video, X } from "lucide-react";

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
  const location = useLocation();
  const { toast } = useToast();
  
  // Não mostrar na página de duelo (/duel/:id)
  const isInDuelRoom = location.pathname.startsWith('/duel/');
  const [pendingInvite, setPendingInvite] = useState<DuelInvite | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;

    setIsReady(true);

    const fetchPendingInvites = async () => {
      const { data, error } = await supabase
        .from('duel_invites')
        .select(`*, sender:profiles!duel_invites_sender_id_fkey(username, avatar_url)`)
        .eq('receiver_id', currentUserId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setPendingInvite(data as any);
      }
    };

    fetchPendingInvites();

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
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBCmGzu/aij0GG2S659+USwsRVrLn65djGAg+luDzxW8fByR9y+/glEIIElys5+mVWBwIK4PQ8N2dXiAELYjU8N6gUwwTUKvq8axXFAk2i9Xx0X4lCCGAzu7afj0GG2S659+USwsRVrLn65djGAg+luDzxW8fByR9y+/glEIIElys5+mVWBwIK4PQ8N2dXiAELYjU8N6gUwwTUKvq8axXFAk2i9Xx0X4l');
          audio.play().catch(() => {});

          const { data } = await supabase
            .from('duel_invites')
            .select(`*, sender:profiles!duel_invites_sender_id_fkey(username, avatar_url)`)
            .eq('id', payload.new.id)
            .maybeSingle();

          if (data) {
            setPendingInvite(data as any);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleAccept = async () => {
    if (!pendingInvite) return;

    try {
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${currentUserId},opponent_id.eq.${currentUserId}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        await supabase
          .from('duel_invites')
          .update({ status: 'rejected' })
          .eq('id', pendingInvite.id);
        setPendingInvite(null);
        return;
      }

      await supabase
        .from('duel_invites')
        .update({ status: 'accepted' })
        .eq('id', pendingInvite.id);

      navigate(`/duel/${pendingInvite.duel_id}`);
      setPendingInvite(null);
    } catch (error: any) {
      console.error('Erro ao aceitar convite:', error);
    }
  };

  const handleReject = async () => {
    if (!pendingInvite) return;

    await supabase
      .from('duel_invites')
      .update({ status: 'rejected' })
      .eq('id', pendingInvite.id);

    await supabase
      .from('live_duels')
      .delete()
      .eq('id', pendingInvite.duel_id)
      .eq('status', 'waiting');

    setPendingInvite(null);
  };

  // Não mostrar se não houver convite, não estiver pronto, ou estiver na sala de duelo
  if (!pendingInvite || !isReady || isInDuelRoom) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#1a1a2e] rounded-2xl border border-purple-500/20 shadow-2xl animate-in fade-in zoom-in duration-300 overflow-hidden">
        <div className="p-8 flex flex-col items-center text-center">
          {/* Check Icon */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-full border-4 border-emerald-500 flex items-center justify-center">
              <Check className="w-10 h-10 text-emerald-500" strokeWidth={3} />
            </div>
            <div className="absolute inset-0 w-20 h-20 rounded-full border-4 border-emerald-500/30 animate-ping" />
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-emerald-400 mb-2">
            Oponente Encontrado!
          </h2>

          {/* VS Username */}
          <p className="text-white font-semibold mb-4">
            vs {pendingInvite.sender.username}
          </p>

          {/* Description */}
          <p className="text-gray-400 text-sm mb-8">
            Clique no botão abaixo para entrar na chamada de vídeo
          </p>

          {/* Avatar */}
          <div className="mb-8">
            <Avatar className="w-24 h-24 border-4 border-purple-500/50 shadow-lg shadow-purple-500/20">
              <AvatarImage src={pendingInvite.sender.avatar_url || ""} />
              <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-white text-2xl font-bold">
                {pendingInvite.sender.username?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Join Video Button */}
          <Button
            onClick={handleAccept}
            className="w-full h-14 bg-gradient-to-r from-purple-600 via-purple-500 to-pink-500 hover:from-purple-700 hover:via-purple-600 hover:to-pink-600 text-white font-semibold text-lg rounded-xl shadow-lg shadow-purple-500/30 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] mb-4"
          >
            <Video className="w-5 h-5 mr-3" />
            Entrar na Chamada de Vídeo
          </Button>

          {/* Cancel Button */}
          <Button
            onClick={handleReject}
            variant="ghost"
            className="w-full h-12 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all duration-200"
          >
            <X className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
};
