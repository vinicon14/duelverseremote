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
        description: "Escolha o vencedor antes de finalizar",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Try Edge Function first
      const { data, error } = await supabase.functions.invoke('distribute-tournament-prize', {
        body: {
          tournament_id: tournamentId,
          winner_id: selectedWinnerId,
        },
      });

      if (!error && data?.success) {
        toast({
          title: "Sucesso!",
          description: data.message,
        });
        onWinnerSelected();
        setLoading(false);
        return;
      }

      // Fallback: Record transaction directly if Edge Function fails
      const winner = participants.find(p => p.user_id === selectedWinnerId);
      
      // Get current balance and add prize
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('duelcoins_balance')
        .eq('user_id', selectedWinnerId)
        .single();
      
      const newBalance = (currentProfile?.duelcoins_balance || 0) + prizePool;
      
      // Add prize to winner's balance
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ duelcoins_balance: newBalance })
        .eq('user_id', selectedWinnerId);

      if (updateError) throw updateError;

      // Record transaction
      await supabase.from('duelcoins_transactions').insert({
        sender_id: creatorId,
        receiver_id: selectedWinnerId,
        amount: prizePool,
        transaction_type: 'tournament_prize',
        description: `Prêmio do Torneio: ${winner?.profiles?.username || 'Torneio'}`
      });

      // Update tournament status
      await supabase
        .from('tournaments')
        .update({ status: 'completed', prize_paid: true })
        .eq('id', tournamentId);

      toast({
        title: "Sucesso!",
        description: `Prêmio de ${prizePool} DuelCoins enviado para ${winner?.profiles?.username || 'o vencedor'}!`,
      });
      onWinnerSelected();
    } catch (error: any) {
      toast({
        title: "Não foi possível finalizar",
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

        {participants.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            Nenhum participante encontrado
          </div>
        ) : (
          <Select value={selectedWinnerId} onValueChange={setSelectedWinnerId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o vencedor" />
            </SelectTrigger>
            <SelectContent>
              {participants.filter(p => p.profiles?.username).map((participant) => (
                <SelectItem key={participant.user_id} value={participant.user_id}>
                  {participant.profiles?.username || participant.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          onClick={finalizeTournament}
          disabled={loading || !selectedWinnerId || participants.length === 0}
          className="w-full btn-mystic text-white"
        >
          {loading ? "Finalizando..." : "Finalizar Torneio e Premiar Vencedor"}
        </Button>
      </CardContent>
    </Card>
  );
};
