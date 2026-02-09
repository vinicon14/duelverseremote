import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Swords, X, Check, Video } from "lucide-react";

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

  if (!pendingInvite || !isReady) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <Card className="card-mystic w-full max-w-md animate-in fade-in zoom-in duration-300">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="relative inline-block">
              <Swords className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-primary animate-pulse" />
              <div className="absolute inset-0 h-12 w-12 sm:h-16 sm:w-16 mx-auto rounded-full bg-primary/20 animate-ping" />
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-gradient-mystic">
              Desafio de Duelo!
            </h3>
            <p className="text-sm text-muted-foreground">
              {pendingInvite.sender.username} te desafiou para um duelo!
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 p-4 rounded-lg bg-background/50">
            <Avatar className="w-16 h-16 border-2 border-primary/30">
              <AvatarImage src={pendingInvite.sender.avatar_url || ""} />
              <AvatarFallback className="bg-primary/20 text-lg">
                {pendingInvite.sender.username?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleReject}
              variant="outline"
              className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-white"
            >
              <X className="w-4 h-4 mr-2" />
              Recusar
            </Button>
            <Button
              onClick={handleAccept}
              className="flex-1 btn-mystic text-white"
            >
              <Check className="w-4 h-4 mr-2" />
              Aceitar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
