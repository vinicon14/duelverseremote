import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Swords, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;

    const fetchPendingInvites = async () => {
      const { data } = await supabase
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

      if (data) setPendingInvite(data as any);
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
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBCmGzu/aij0GG2S659+USwsRVrLn65djGAg+luDzxW8fByR9y+/glEIIElys5+mVWBwIK4PQ8N2dXiAELYjU8N6gUwwTUKvq8axXFAk2i9Xx0X4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhcHwQthtPy0oEoCS+G0fDejzsIHHK+6uSMQwoTXLHm66dVEwk3jNby0H4lCCGAzu7ag0IJGGm45+SRSwwPUqzl7qhc');
            audio.play().catch(() => {});
          } catch (e) {}

          const { data } = await supabase
            .from('duel_invites')
            .select(`
              *,
              sender:profiles!duel_invites_sender_id_fkey(username, avatar_url)
            `)
            .eq('id', payload.new.id)
            .maybeSingle();

          if (data) setPendingInvite(data as any);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleAccept = async () => {
    if (!pendingInvite) return;
    setLoading(true);

    try {
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id')
        .or(`creator_id.eq.${currentUserId},opponent_id.eq.${currentUserId}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        toast({
          title: "Você já está em um duelo",
          description: "Termine ou saia do duelo atual antes de aceitar outro convite.",
          variant: "destructive",
        });
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

      toast({
        title: "Convite aceito!",
        description: "Entrando na sala de duelo...",
      });

      navigate(`/duel/${pendingInvite.duel_id}`);
      setPendingInvite(null);
    } catch (error: any) {
      toast({
        title: "Erro ao aceitar convite",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!pendingInvite) return;
    setLoading(true);

    try {
      await supabase
        .from('duel_invites')
        .update({ status: 'rejected' })
        .eq('id', pendingInvite.id);

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
      toast({
        title: "Erro ao recusar convite",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!pendingInvite) return null;

  const senderName = pendingInvite.sender?.username || "Jogador";
  const senderAvatar = pendingInvite.sender?.avatar_url;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md animate-in fade-in duration-300">
      <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full mx-4 text-center">
        {/* Animated swords icon */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative p-6 rounded-full bg-primary/10 border-2 border-primary/30">
            <Swords className="w-16 h-16 text-primary animate-pulse" />
          </div>
        </div>

        {/* Avatar */}
        <Avatar className="w-24 h-24 border-4 border-primary/30 shadow-lg">
          <AvatarImage src={senderAvatar || undefined} />
          <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
            {senderName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Convite de Duelo!
          </h1>
          <p className="text-xl text-muted-foreground">
            <span className="font-bold text-primary">{senderName}</span>{" "}
            convidou você para um duelo!
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full mt-4">
          <Button
            onClick={handleAccept}
            disabled={loading}
            size="lg"
            className="flex-1 h-14 text-lg gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
          >
            <ShieldCheck className="w-6 h-6" />
            Aceitar Duelo
          </Button>
          <Button
            onClick={handleReject}
            disabled={loading}
            size="lg"
            variant="outline"
            className="flex-1 h-14 text-lg gap-2 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <X className="w-6 h-6" />
            Recusar
          </Button>
        </div>
      </div>
    </div>
  );
};
