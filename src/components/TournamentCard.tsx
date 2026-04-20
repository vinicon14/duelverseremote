import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users, Coins, Calendar, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TournamentCardProps {
  tournament: {
    id: string;
    name: string;
    description?: string;
    max_participants: number;
    entry_fee: number;
    prize_pool: number;
    status: string;
    start_time?: string;
    participants?: number;
  };
  onJoin?: (tournamentId: string) => void;
}

export const TournamentCard = ({ tournament, onJoin }: TournamentCardProps) => {
  const { toast } = useToast();

  const handleShare = async () => {
    const url = `${window.location.origin}/tournaments/${tournament.id}`;
    const text = `🏆 ${tournament.name} - Participe do torneio no DuelVerse!`;
    if (navigator.share) {
      try {
        await navigator.share({ title: tournament.name, text, url });
      } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado!", description: "Link do torneio copiado para a área de transferência." });
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'bg-primary/20 text-primary';
      case 'active':
        return 'bg-accent/20 text-accent';
      case 'completed':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'upcoming':
        return 'Em breve';
      case 'active':
        return 'Em andamento';
      case 'completed':
        return 'Finalizado';
      default:
        return status;
    }
  };

  return (
    <Card className="card-mystic hover:border-primary/40 transition-all">
      <CardHeader className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg sm:text-xl text-gradient-mystic mb-2 break-words">
              {tournament.name}
            </CardTitle>
            {tournament.description && (
              <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 break-words">
                {tournament.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShare}>
              <Share2 className="w-4 h-4" />
            </Button>
            <Badge className={`${getStatusColor(tournament.status)} text-xs`}>
              {getStatusText(tournament.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6 pt-0 sm:pt-0">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <Users className="w-4 h-4 text-primary shrink-0" />
            <span>
              {tournament.participants || 0}/{tournament.max_participants}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <Coins className="w-4 h-4 text-secondary shrink-0" />
            <span>{tournament.entry_fee} moedas</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <Trophy className="w-4 h-4 text-secondary shrink-0" />
          <span className="text-gradient-gold font-semibold">
            Premiação: {tournament.prize_pool} moedas
          </span>
        </div>

        {tournament.start_time && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>
              {new Date(tournament.start_time).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        )}

        {tournament.status === 'upcoming' && onJoin && (
          <div className="space-y-2">
            <Button
              onClick={() => onJoin(tournament.id)}
              className="w-full btn-mystic text-white"
            >
              Participar
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = `/tournaments/${tournament.id}`}
              className="w-full"
            >
              Ver Detalhes
            </Button>
          </div>
        )}

        {tournament.status === 'active' && (
          <Button
            onClick={() => window.location.href = `/tournaments/${tournament.id}`}
            variant="outline"
            className="w-full"
          >
            Acompanhar
          </Button>
        )}

        {tournament.status === 'completed' && (
          <Button
            onClick={() => window.location.href = `/tournaments/${tournament.id}`}
            variant="outline"
            className="w-full"
          >
            Ver Resultados
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
