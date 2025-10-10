import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Users, X } from "lucide-react";

interface QueueWaitingProps {
  duelId: string;
  onCancel: () => void;
}

export const QueueWaiting = ({ duelId, onCancel }: QueueWaitingProps) => {
  const navigate = useNavigate();
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    console.log('[QueueWaiting] Iniciando espera para duelo:', duelId);
    
    // Timer para mostrar tempo de espera
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    // Listener realtime para detectar quando opponent entrar
    const channel = supabase
      .channel(`queue-${duelId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_duels',
          filter: `id=eq.${duelId}`,
        },
        (payload) => {
          console.log('[QueueWaiting] Update recebido:', payload.new);
          
          // Se opponent_id foi preenchido, redirecionar para a sala
          if (payload.new.opponent_id) {
            console.log('[QueueWaiting] Oponente encontrado! Redirecionando...');
            navigate(`/duel/${duelId}`);
          }
        }
      )
      .subscribe((status) => {
        console.log('[QueueWaiting] Status do canal:', status);
      });

    return () => {
      console.log('[QueueWaiting] Limpando recursos');
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [duelId, navigate]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCancel = async () => {
    console.log('[QueueWaiting] Cancelando sala:', duelId);
    
    try {
      await supabase
        .from('live_duels')
        .delete()
        .eq('id', duelId);
      
      console.log('[QueueWaiting] Sala deletada com sucesso');
    } catch (error) {
      console.error('[QueueWaiting] Erro ao cancelar sala:', error);
    }
    
    onCancel();
  };

  return (
    <Dialog open={true} onOpenChange={handleCancel}>
      <DialogContent className="card-mystic max-w-md">
        <DialogHeader>
          <DialogTitle className="text-gradient-mystic flex items-center justify-between">
            <span>Procurando Oponente</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            Sua sala está na fila. Continue navegando enquanto esperamos um oponente!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="text-center">
            <Loader2 className="h-16 w-16 mx-auto mb-4 text-primary animate-spin" />
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>Tempo de espera: {formatTime(elapsedTime)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-gradient-primary animate-pulse" style={{ width: "70%" }} />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Aguardando jogador entrar via Matchmaking ou lista de salas...
            </p>
          </div>

          <div className="bg-primary/5 rounded-lg p-4 text-sm text-muted-foreground">
            <p className="text-center">
              💡 Você pode continuar navegando na plataforma. Quando um oponente entrar, você será redirecionado automaticamente para a chamada!
            </p>
          </div>

          <Button
            onClick={handleCancel}
            variant="outline"
            className="w-full"
          >
            Cancelar e Sair da Fila
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
