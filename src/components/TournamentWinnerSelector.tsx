import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Coins } from "lucide-react";

interface TournamentWinnerSelectorProps {
  tournamentId: string;
  participants: any[];
  prizePool: number;
  creatorId: string;
  onWinnerSelected: () => void;
}

export const TournamentWinnerSelector = ({ 
  tournamentId, 
  participants, 
  prizePool, 
  creatorId,
  onWinnerSelected 
}: TournamentWinnerSelectorProps) => {
  const [selectedWinnerId, setSelectedWinnerId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const finalizeTournament = async () => {
    if (!selectedWinnerId) {
      toast({
        title: "Selecione um vencedor",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Chamar a Edge Function para distribuir o prêmio
      const { data, error } = await supabase.functions.invoke('distribute-tournament-prize', {
        body: {
          tournament_id: tournamentId,
          winner_id: selectedWinnerId,
        },
      })

      if (error || !data.success) {
        throw new Error(data.message || error.message);
      }

      toast({
        title: "Torneio finalizado!",
        description: `O vencedor recebeu o prêmio de ${prizePool} DuelCoins.`,
      });

      onWinnerSelected();
    } catch (error: any) {
      toast({
        title: "Erro ao finalizar torneio",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="card-mystic">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          Selecionar Vencedor
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Coins className="w-5 h-5 text-yellow-500" />
          <span>Prêmio: {prizePool} DuelCoins</span>
        </div>

        <Select value={selectedWinnerId} onValueChange={setSelectedWinnerId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o vencedor" />
          </SelectTrigger>
          <SelectContent>
            {participants.map((participant) => (
              <SelectItem key={participant.user_id} value={participant.user_id}>
                {participant.profiles?.username}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={finalizeTournament}
          disabled={loading || !selectedWinnerId}
          className="w-full btn-mystic text-white"
        >
          {loading ? "Finalizando..." : "Finalizar Torneio e Premiar Vencedor"}
        </Button>
      </CardContent>
    </Card>
  );
};
