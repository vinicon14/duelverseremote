import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

interface TournamentMatchReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  tournamentId: string;
  opponentUsername: string;
  opponentId: string | null;
  onReportSubmitted: () => void;
}

type ReportResult = 'player1_win' | 'player2_win' | 'double_loss' | null;

export const TournamentMatchReportModal = ({
  open,
  onOpenChange,
  matchId,
  tournamentId,
  opponentUsername,
  opponentId,
  onReportSubmitted,
}: TournamentMatchReportModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ReportResult>(null);
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  const handleSubmit = async () => {
    if (!selectedResult) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Usuário não autenticado");
      const user = session.user;

      // Check if user is player1 or player2
      const { data: match } = await supabase
        .from('tournament_matches')
        .select('player1_id, player2_id')
        .eq('id', matchId)
        .single();

      if (!match) throw new Error("Partida não encontrada");

      // Submit report (using insert since table might not exist yet)
      const { error } = await (supabase as any)
        .from('tournament_match_reports')
        .insert({
          match_id: matchId,
          reporter_id: user.id,
          reported_result: selectedResult,
        });

      if (error) throw error;

      toast({
        title: "Reporte enviado!",
        description: "Seu reporte foi registrado com sucesso.",
        variant: "default",
      });

      onReportSubmitted();
      onOpenChange(false);
      setStep('select');
      setSelectedResult(null);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar reporte",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reportar Resultado</DialogTitle>
          <DialogDescription>
            Selecione o resultado da partida contra {opponentUsername}
          </DialogDescription>
        </DialogHeader>

        {step === 'select' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card 
                className={`cursor-pointer transition-all ${
                  selectedResult === 'player1_win' 
                    ? 'border-green-500 bg-green-500/10' 
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelectedResult('player1_win')}
              >
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <p className="font-medium">Eu venci</p>
                  <p className="text-xs text-muted-foreground">Vitória para mim</p>
                </CardContent>
              </Card>

              <Card 
                className={`cursor-pointer transition-all ${
                  selectedResult === 'double_loss' 
                    ? 'border-red-500 bg-red-500/10' 
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelectedResult('double_loss')}
              >
                <CardContent className="p-4 flex flex-col items-center text-center">
                  <p className="font-medium">Empate/Derrota</p>
                  <p className="text-xs text-muted-foreground">Ambos perderam</p>
                </CardContent>
              </Card>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              Nota: Ambos os jogadores precisam reportar.
            </p>

            <Button 
              className="w-full" 
              disabled={!selectedResult || loading}
              onClick={() => setStep('confirm')}
            >
              Continuar
            </Button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <Card className="border-yellow-500/50 bg-yellow-500/10">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Confirme o resultado</p>
                    <p className="text-sm text-muted-foreground">
                      {selectedResult === 'player1_win' 
                        ? 'Você está reportando que VENCEU a partida.' 
                        : 'Você está reportando DERROTA OU EMPATE.'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={() => setStep('select')}
                disabled={loading}
              >
                Voltar
              </Button>
              <Button 
                className="flex-1 btn-mystic text-white"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Enviando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
