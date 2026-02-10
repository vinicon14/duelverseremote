import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trophy } from "lucide-react";

interface MatchResultSelectorProps {
  matchId: string;
  player1: { id: string; username: string } | null;
  player2: { id: string; username: string } | null;
  onResultReported: () => void;
}

export const MatchResultSelector = ({
  matchId,
  player1,
  player2,
  onResultReported,
}: MatchResultSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const reportResult = async (winnerId: string) => {
    try {
      setLoading(true);

      // Try Edge Function first
      const { data, error } = await supabase.functions.invoke('report-match-result', {
        body: { 
          match_id: matchId,
          winner_id: winnerId
        },
      });

      if (!error && data?.success) {
        toast({
          title: "Resultado reportado!",
          description: data.next_round_generated 
            ? "Próxima rodada gerada automaticamente." 
            : data.message,
        });
        setIsOpen(false);
        onResultReported();
        setLoading(false);
        return;
      }

      // Fallback: Update match status directly if Edge Function fails
      const { error: updateError } = await supabase
        .from('tournament_matches')
        .update({ 
          winner_id: winnerId,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', matchId);

      if (updateError) throw updateError;

      toast({
        title: "Resultado reportado!",
        description: "Partida atualizada com sucesso.",
      });

      setIsOpen(false);
      onResultReported();
    } catch (error: any) {
      toast({
        title: "Erro ao reportar resultado",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!player1 || !player2) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="btn-mystic">
          Reportar Resultado
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md card-mystic">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Reportar Vencedor
          </DialogTitle>
          <DialogDescription>
            Selecione o vencedor desta partida
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-4">
          <Button
            onClick={() => reportResult(player1.id)}
            disabled={loading}
            className="w-full btn-mystic text-white justify-between"
          >
            <span>{player1.username}</span>
            <Trophy className="w-4 h-4" />
          </Button>
          <Button
            onClick={() => reportResult(player2.id)}
            disabled={loading}
            className="w-full btn-mystic text-white justify-between"
          >
            <span>{player2.username}</span>
            <Trophy className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
