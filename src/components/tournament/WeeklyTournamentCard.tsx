import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, Clock, Calendar, Coins, Share2 } from "lucide-react";
import { WeeklyTournamentWithCount } from "@/types/weeklyTournament";

interface WeeklyTournamentCardProps {
  tournament: WeeklyTournamentWithCount;
  onJoin?: () => void;
  isJoined?: boolean;
  isCreator?: boolean;
}

export const WeeklyTournamentCard = ({
  tournament,
  onJoin,
  isJoined = false,
  isCreator = false,
}: WeeklyTournamentCardProps) => {
  const { toast } = useToast();
  const [joining, setJoining] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/tournaments/${tournament.id}`;
    const text = `🏆 ${tournament.name} - Participe do torneio semanal no DuelVerse!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.name, text, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado!", description: "Link do torneio copiado para a área de transferência." });
    }
  };

  const daysRemaining = Math.ceil(
    new Date(tournament.end_date).getTime() - Date.now()
  ) / (1000 * 60 * 60 * 24);

  const isFull = tournament.participant_count >= tournament.max_participants;
  const isOpen = tournament.status === "upcoming";

  const handleJoin = async () => {
    setJoining(true);
    try {
      // Try RPC first
      const { data, error } = await (supabase as any).rpc("join_weekly_tournament", {
        p_tournament_id: tournament.id,
      });

      if (!error && data?.success) {
        toast({
          title: "Inscrição realizada!",
          description: `Você se inscreveu no ${tournament.name}`,
        });
        if (onJoin) onJoin();
        setJoining(false);
        return;
      }

      // Fallback: Direct database operations
      if (tournament.isFull) {
        throw new Error("Torneio está lotado");
      }

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Check if already joined
      const { data: existing } = await (supabase as any)
        .from('tournament_participants')
        .select('id')
        .eq('tournament_id', tournament.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        throw new Error("Você já está inscrito neste torneio");
      }

      // Use edge function to handle entry fee + registration atomically
      const { data: result, error: fnError } = await supabase.functions.invoke('charge-tournament-entry-fee', {
        body: { tournament_id: tournament.id }
      });

      let message = result?.message || '';
      if (fnError && !message) {
        try {
          const ctx = (fnError as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            message = body?.message || fnError.message;
          } else { message = fnError.message; }
        } catch { message = fnError.message; }
      }
      if (!message) message = 'Erro ao processar inscrição';

      if (fnError || (result && !result.success)) {
        const isAlreadyJoined = message.includes('já está inscrito') || message.includes('23505');
        const isNoBalance = message.includes('Saldo insuficiente') || message.includes('precisa de');
        
        toast({
          title: isAlreadyJoined ? "Você já está inscrito" : isNoBalance ? "Saldo insuficiente" : "Erro na inscrição",
          description: isAlreadyJoined ? "Você já está inscrito neste torneio." : isNoBalance ? "Você não tem DuelCoins suficientes para se inscrever." : message,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Inscrição realizada!",
        description: `Você se inscreveu no ${tournament.name}`,
      });
      if (onJoin) onJoin();
    } catch (error: any) {
      const msg = error?.message || '';
      const isAlreadyJoined = msg.includes('já está inscrito') || msg.includes('23505');
      const isNoBalance = msg.includes('Saldo insuficiente') || msg.includes('precisa de');
      
      toast({
        title: isAlreadyJoined ? "Você já está inscrito" : isNoBalance ? "Saldo insuficiente" : "Erro na inscrição",
        description: isAlreadyJoined ? "Você já está inscrito neste torneio." : isNoBalance ? "Você não tem DuelCoins suficientes para se inscrever." : msg,
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  };

  return (
    <Card className="weekly-tournament-card hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="mb-2 bg-yellow-500/10 text-yellow-600 border-yellow-500">
            🏆 Torneio Semanal
          </Badge>
          {tournament.prize_paid && (
            <Badge variant="secondary" className="bg-green-500/10 text-green-600">
              Prêmio Pago
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{tournament.name}</CardTitle>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleShare}>
            <Share2 className="w-4 h-4" />
          </Button>
        </div>
        <CardDescription>{tournament.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Prize and Fee */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="w-4 h-4 text-yellow-600" />
              <Label className="text-xs text-yellow-700">Prêmio</Label>
            </div>
            <p className="text-xl font-bold text-yellow-600 flex items-center gap-1">
              <Coins className="w-4 h-4" />
              {tournament.prize_pool.toLocaleString()} DC
            </p>
          </div>
          <div className="bg-gradient-to-br from-blue-500/20 to-indigo-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-blue-600" />
              <Label className="text-xs text-blue-700">Taxa</Label>
            </div>
            <p className="text-xl font-bold text-blue-600 flex items-center gap-1">
              <Coins className="w-4 h-4" />
              {tournament.entry_fee.toLocaleString()} DC
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="flex flex-col items-center p-2 bg-muted rounded-lg">
            <Users className="w-4 h-4 mb-1 text-muted-foreground" />
            <span className="text-sm font-medium">
              {tournament.participant_count}/{tournament.max_participants}
            </span>
            <span className="text-xs text-muted-foreground">Participantes</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-muted rounded-lg">
            <Clock className="w-4 h-4 mb-1 text-muted-foreground" />
            <span className="text-sm font-medium">{Math.floor(daysRemaining)}d</span>
            <span className="text-xs text-muted-foreground">Restantes</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-muted rounded-lg">
            <Calendar className="w-4 h-4 mb-1 text-muted-foreground" />
            <span className="text-sm font-medium">
              {new Date(tournament.start_date).toLocaleDateString("pt-BR")}
            </span>
            <span className="text-xs text-muted-foreground">Início</span>
          </div>
        </div>

        {/* Arrecadação do Criador */}
        {isCreator && tournament.status === "upcoming" && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-sm text-green-700">
              <span className="font-medium">Arrecadação:</span> {tournament.total_collected.toLocaleString()} DC
            </p>
          </div>
        )}

        {/* Action Button */}
        {isCreator ? (
          <Button className="w-full" variant="outline" disabled>
            Seu Torneio
          </Button>
        ) : isJoined ? (
          <Button className="w-full" variant="secondary" disabled>
            ✓ Já Inscrito
          </Button>
        ) : isOpen ? (
          <Button
            onClick={handleJoin}
            disabled={joining || isFull}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            {joining
              ? "Inscrevendo..."
              : isFull
              ? "Torneio Lotado"
              : "Inscrever-se"}
          </Button>
        ) : (
          <Button className="w-full" variant="secondary" disabled>
            {tournament.status === "completed"
              ? "Torneio Encerrado"
              : "Inscrições Encerradas"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
