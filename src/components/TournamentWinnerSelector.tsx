import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  const finalizeTournament = async () => {
    if (!selectedWinnerId) {
      toast({
        title: t('tournamentWinner.selectFirstTitle'),
        description: t('tournamentWinner.selectFirstDesc'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Pagamento atômico via RPC SECURITY DEFINER: valida que o caller é o
      // criador do torneio, credita o vencedor e registra a transação.
      const { data: rpcData, error: payError } = await (supabase.rpc as any)(
        'tournament_pay_winner',
        {
          p_tournament_id: tournamentId,
          p_winner_id: selectedWinnerId,
          p_amount: prizePool,
        }
      );

      if (payError) throw payError;
      const payResult = rpcData as { success?: boolean; message?: string } | null;
      if (!payResult?.success) {
        throw new Error(payResult?.message || 'Falha ao pagar prêmio');
      }

      // Buscar nome do vencedor apenas para feedback no toast.
      const { data: winnerProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', selectedWinnerId)
        .single();
      const transactionError = null;

      // Marcar participante como vencedor
      await supabase
        .from('tournament_participants')
        .update({ status: 'winner' })
        .eq('tournament_id', tournamentId)
        .eq('user_id', selectedWinnerId);

      // Finalizar torneo
      const { error: tournamentError } = await supabase
        .from('tournaments')
        .update({ status: 'completed', end_date: new Date().toISOString() })
        .eq('id', tournamentId);

      if (tournamentError) throw tournamentError;

      const winner = participants.find(p => p.user_id === selectedWinnerId);

      toast({
        title: t('tournamentWinner.successTitle'),
        description: t('tournamentWinner.prizeDistributed', { prize: prizePool, name: winnerProfile?.username || t('tournamentWinner.winnerFallback') }),
      });
      onWinnerSelected();
    } catch (error: any) {
      toast({
        title: t('tournamentWinner.errorTitle'),
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
          {t('tournamentWinner.cardTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Coins className="w-5 h-5 text-yellow-500" />
          <span>{t('tournamentWinner.prizeLabel', { prize: prizePool })}</span>
        </div>

        {participants.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            {t('tournamentWinner.noParticipants')}
          </div>
        ) : (
          <Select value={selectedWinnerId} onValueChange={setSelectedWinnerId}>
            <SelectTrigger>
              <SelectValue placeholder={t('tournamentWinner.selectPlaceholder')} />
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
          {loading ? t('tournamentWinner.finalizing') : t('tournamentWinner.finalizeAndAward')}
        </Button>
      </CardContent>
    </Card>
  );
};
