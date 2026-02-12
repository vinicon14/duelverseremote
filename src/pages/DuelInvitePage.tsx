import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Swords, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DuelInvite {
  id: string;
  sender_id: string;
  receiver_id: string;
  duel_id: string;
  status: string;
  created_at: string;
  sender: {
    username: string;
    avatar_url: string | null;
  };
}

export const DuelInvitePage = () => {
  const { inviteId } = useParams<{ inviteId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invite, setInvite] = useState<DuelInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const fetchInvite = async () => {
      if (!inviteId) {
        toast({
          title: "Erro",
          description: "ID de convite inválido",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      try {
        const { data, error } = await supabase
          .from('duel_invites')
          .select(`
            *,
            sender:profiles!duel_invites_sender_id_fkey(username, avatar_url)
          `)
          .eq('id', inviteId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!data) {
          toast({
            title: "Convite não encontrado",
            description: "Este convite pode ter expirado ou sido cancelado.",
            variant: "destructive",
          });
          navigate("/");
          return;
        }

        // Verificar se já foi processado
        if (data.status !== 'pending') {
          toast({
            title: "Convite já processado",
            description: `Este convite já foi ${data.status === 'accepted' ? 'aceito' : 'recusado'}.`,
          });
          navigate("/");
          return;
        }

        setInvite(data as unknown as DuelInvite);
      } catch (error: any) {
        console.error('Erro ao buscar convite:', error);
        toast({
          title: "Erro ao carregar convite",
          description: error.message,
          variant: "destructive",
        });
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    fetchInvite();

    // Listener para atualizações em tempo real
    const channel = supabase
      .channel(`invite-${inviteId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'duel_invites',
          filter: `id=eq.${inviteId}`,
        },
        async (payload) => {
          if (payload.new && (payload.new as any).status !== 'pending') {
            toast({
              title: "Convite atualizado",
              description: `O convite foi ${(payload.new as any).status === 'accepted' ? 'aceito' : 'recusado'}.`,
            });
            navigate("/");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [inviteId, navigate, toast]);

  const handleAccept = async () => {
    if (!invite) return;

    setProcessing(true);
    try {
      // Verificar se o usuário já está em algum duelo ativo
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro",
          description: "Você precisa estar logado para aceitar convites.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${user.id},opponent_id.eq.${user.id}`)
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
          .eq('id', invite.id);
        
        navigate("/");
        return;
      }

      // Atualizar status do convite para aceito
      const { error: updateError } = await supabase
        .from('duel_invites')
        .update({ status: 'accepted' })
        .eq('id', invite.id);

      if (updateError) throw updateError;

      toast({
        title: "Convite aceito!",
        description: "Entrando na sala de duelo...",
      });

      // Navegar para a sala do duelo
      navigate(`/duel/${invite.duel_id}`);
    } catch (error: any) {
      console.error('Erro ao aceitar convite:', error);
      toast({
        title: "Erro ao aceitar convite",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!invite) return;

    setProcessing(true);
    try {
      // Atualizar status do convite para rejeitado
      const { error } = await supabase
        .from('duel_invites')
        .update({ status: 'rejected' })
        .eq('id', invite.id);

      if (error) throw error;

      // Deletar a sala de duelo se ainda estiver em waiting
      await supabase
        .from('live_duels')
        .delete()
        .eq('id', invite.duel_id)
        .eq('status', 'waiting');

      toast({
        title: "Convite recusado",
        description: "Você recusou o convite de duelo.",
      });

      navigate("/");
    } catch (error: any) {
      console.error('Erro ao recusar convite:', error);
      toast({
        title: "Erro ao recusar convite",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-slate-400">Carregando convite...</p>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <Swords className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">Convite não encontrado</p>
          <Button onClick={() => navigate("/")} className="mt-4 btn-mystic">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card Mystic Style */}
        <div className="card-mystic border-primary/30 p-8 rounded-2xl">
          {/* Header com ícone */}
          <div className="flex items-center justify-center mb-6">
            <div className="p-4 rounded-full bg-primary/20 animate-pulse">
              <Swords className="w-12 h-12 text-primary" />
            </div>
          </div>

          {/* Título */}
          <h1 className="text-2xl font-bold text-center text-gradient-mystic mb-6">
            Convite de Duelo!
          </h1>

          {/* Descrição */}
          <p className="text-lg text-center text-slate-300 mb-8">
            <span className="font-semibold text-primary text-xl">
              {invite.sender.username}
            </span>
            {" "}te convidou para um duelo!
          </p>

          {/* Botões */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={handleReject}
              disabled={processing}
              variant="outline"
              className="flex-1 border-destructive text-destructive hover:bg-destructive hover:text-white py-6 text-lg"
            >
              ❌ Recusar
            </Button>
            <Button
              onClick={handleAccept}
              disabled={processing}
              className="flex-1 btn-mystic text-white py-6 text-lg"
            >
              {processing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Swords className="w-5 h-5 mr-2" />
                  ⚔️ Aceitar
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Voltar */}
        <button
          onClick={() => navigate("/")}
          className="block w-full text-center mt-6 text-slate-400 hover:text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4 inline mr-2" />
          Voltar ao início
        </button>
      </div>
    </div>
  );
};
