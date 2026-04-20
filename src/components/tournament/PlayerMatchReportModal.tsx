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
import { AlertTriangle, Trophy, XCircle, Clock, ShieldAlert } from "lucide-react";

interface PlayerMatchReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  opponentUsername: string;
  conflictCount?: number;
  alreadyReported?: boolean;
  onReportSubmitted: () => void;
}

export const PlayerMatchReportModal = ({
  open,
  onOpenChange,
  matchId,
  opponentUsername,
  conflictCount = 0,
  alreadyReported = false,
  onReportSubmitted,
}: PlayerMatchReportModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<'win' | 'loss' | null>(null);
  const [step, setStep] = useState<'select' | 'confirm'>('select');

  const handleSubmit = async () => {
    if (!selectedResult) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('player-report-match-result', {
        body: { match_id: matchId, result: selectedResult },
      });

      if (error) throw error;

      if (!data?.success) {
        toast({ title: "Erro", description: data?.message || "Erro ao reportar", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (data.status === 'confirmed') {
        toast({
          title: "✅ Resultado Confirmado!",
          description: "O resultado foi validado automaticamente. O torneio avança!",
        });
      } else if (data.status === 'conflict') {
        toast({
          title: "⚠️ Conflito Detectado",
          description: data.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "⏳ Aguardando Oponente",
          description: "Sua resposta foi registrada. Aguardando o outro jogador.",
        });
      }

      onReportSubmitted();
      onOpenChange(false);
      setStep('select');
      setSelectedResult(null);
    } catch (error: any) {
      toast({ title: "Erro ao enviar reporte", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const isManualReview = conflictCount >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Reportar Resultado
          </DialogTitle>
          <DialogDescription>
            Partida contra <strong>{opponentUsername}</strong>
          </DialogDescription>
        </DialogHeader>

        {isManualReview ? (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-400">Revisão Manual</p>
                <p className="text-sm text-muted-foreground">
                  Houve {conflictCount} conflitos nesta partida. O administrador irá resolver.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : alreadyReported ? (
          <Card className="border-yellow-500/50 bg-yellow-500/10">
            <CardContent className="p-4 flex items-start gap-3">
              <Clock className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Aguardando oponente</p>
                <p className="text-sm text-muted-foreground">
                  Você já reportou. Aguardando {opponentUsername} reportar.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {conflictCount > 0 && (
              <Card className="border-orange-500/50 bg-orange-500/10 mb-2">
                <CardContent className="p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-400">
                    Houve {conflictCount} conflito(s). Reporte com atenção. Após 3 conflitos a partida vai para revisão manual.
                  </p>
                </CardContent>
              </Card>
            )}

            {step === 'select' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Card
                    className={`cursor-pointer transition-all ${
                      selectedResult === 'win'
                        ? 'border-green-500 bg-green-500/10 ring-2 ring-green-500/30'
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedResult('win')}
                  >
                    <CardContent className="p-6 flex flex-col items-center text-center gap-2">
                      <Trophy className="w-8 h-8 text-green-500" />
                      <p className="font-bold text-lg">VITÓRIA</p>
                      <p className="text-xs text-muted-foreground">Eu venci esta partida</p>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all ${
                      selectedResult === 'loss'
                        ? 'border-red-500 bg-red-500/10 ring-2 ring-red-500/30'
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedResult('loss')}
                  >
                    <CardContent className="p-6 flex flex-col items-center text-center gap-2">
                      <XCircle className="w-8 h-8 text-red-500" />
                      <p className="font-bold text-lg">DERROTA</p>
                      <p className="text-xs text-muted-foreground">Eu perdi esta partida</p>
                    </CardContent>
                  </Card>
                </div>

                <Button
                  className="w-full"
                  disabled={!selectedResult}
                  onClick={() => setStep('confirm')}
                >
                  Continuar
                </Button>
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-4">
                <Card className={`${selectedResult === 'win' ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium">Confirme o resultado</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedResult === 'win'
                            ? `Você está reportando que VENCEU a partida contra ${opponentUsername}.`
                            : `Você está reportando que PERDEU a partida contra ${opponentUsername}.`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep('select')} disabled={loading}>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
