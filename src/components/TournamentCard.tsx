import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Users, Coins, Calendar } from "lucide-react";

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
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-xl text-gradient-mystic mb-2">
              {tournament.name}
            </CardTitle>
            {tournament.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {tournament.description}
              </p>
            )}
          </div>
          <Badge className={getStatusColor(tournament.status)}>
            {getStatusText(tournament.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Users className="w-4 h-4 text-primary" />
            <span>
              {tournament.participants || 0}/{tournament.max_participants}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Coins className="w-4 h-4 text-secondary" />
            <span>{tournament.entry_fee} moedas</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Trophy className="w-4 h-4 text-secondary" />
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
