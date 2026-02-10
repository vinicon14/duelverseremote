import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bell, Clock, User, Trophy, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TournamentMatchReportModal } from "./TournamentMatchReportModal";

interface TournamentNotificationsProps {
  userId?: string;
}

interface PendingMatch {
  id: string;
  tournament_id: string;
  tournament_name: string;
  player1_id: string | null;
  player2_id: string | null;
  opponent_id: string;
  opponent_username: string;
  round: number;
  match_deadline: string;
  duel_room_id: string | null;
  player1_reported: boolean;
  player2_reported: boolean;
}

export const TournamentNotifications = ({ userId }: TournamentNotificationsProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<PendingMatch | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    fetchPendingMatches();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('tournament-notifications')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'tournament_matches' 
      }, () => {
        fetchPendingMatches();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const fetchPendingMatches = async () => {
    if (!userId) return;

    try {
      // Get user's pending matches in active tournaments
      const { data: matches, error } = await supabase
        .from('tournament_matches')
        .select(`
          id,
          tournament_id,
          round,
          match_deadline,
          duel_room_id,
          player1_id,
          player2_id,
          player1_reported,
          player2_reported,
          tournaments!inner(
            name,
            status,
            created_by
          )
        `)
        .eq('tournaments.status', 'active')
        .in('status', ['pending', 'in_progress'])
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);

      if (error) throw error;

      // Get opponent usernames
      const matchesWithOpponents = await Promise.all(
        (matches || []).map(async (match) => {
          const opponentId = match.player1_id === userId ? match.player2_id : match.player1_id;
          let opponentUsername = 'Desconhecido';

          if (opponentId) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username')
              .eq('user_id', opponentId)
              .maybeSingle();
            opponentUsername = profile?.username || 'Desconhecido';
          }

          return {
            ...match,
            opponent_id: opponentId,
            opponent_username: opponentUsername,
            tournament_name: match.tournaments.name,
          };
        })
      );

      setPendingMatches(matchesWithOpponents);
    } catch (error) {
      console.error('Error fetching pending matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTimeRemaining = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffMs = deadlineDate.getTime() - now.getTime();
    
    if (diffMs <= 0) {
      return { text: 'Prazo expirado!', urgent: true };
    }

    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) {
      return { text: `${diffDays}d ${diffHours}h restantes`, urgent: diffDays < 1 };
    } else if (diffHours > 0) {
      return { text: `${diffHours}h ${diffMinutes}m restantes`, urgent: true };
    } else {
      return { text: `${diffMinutes}m restantes`, urgent: true };
    }
  };

  const handleEnterRoom = (duelRoomId: string | null, matchId: string) => {
    if (duelRoomId) {
      navigate(`/duel/${duelRoomId}`);
    } else {
      toast({
        title: "Sala ainda não disponível",
        description: "A sala de duelo será criada em breve",
        variant: "default",
      });
    }
  };

  const handleReport = (match: PendingMatch) => {
    setSelectedMatch(match);
    setReportModalOpen(true);
  };

  if (loading) {
    return null;
  }

  if (pendingMatches.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mb-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-yellow-500" />
          <h2 className="text-lg font-semibold">Torneios Pendentes</h2>
          <Badge variant="secondary">{pendingMatches.length}</Badge>
        </div>

        {pendingMatches.map((match) => {
          const timeRemaining = getTimeRemaining(match.match_deadline);
          const isPlayer1 = match.player1_id === userId;
          const hasReported = isPlayer1 ? match.player1_reported : match.player2_reported;

          return (
            <Card key={match.id} className={`card-mystic ${timeRemaining.urgent ? 'border-red-500/50' : ''}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-primary" />
                      {match.tournament_name}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Rodada {match.round} • Chave #{match.id.slice(0, 8)}
                    </p>
                  </div>
                  <Badge variant={timeRemaining.urgent ? "destructive" : "secondary"}>
                    <Clock className="w-3 h-3 mr-1" />
                    {timeRemaining.text}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Opponent Info */}
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">Oponente: {match.opponent_username}</span>
                </div>

                {/* Report Status */}
                <div className="flex items-center gap-2">
                  {hasReported ? (
                    <div className="flex items-center gap-2 text-green-500">
                      <CheckCircle className="w-4 h-4" />
                      <span className="text-sm">Você já reportou</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-yellow-500">
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm">Aguardando seu reporte</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleReport(match)}
                  >
                    {hasReported ? 'Editar Reporte' : 'Reportar Resultado'}
                  </Button>
                  <Button
                    className="flex-1 btn-mystic text-white"
                    onClick={() => handleEnterRoom(match.duel_room_id, match.id)}
                    disabled={!match.duel_room_id}
                  >
                    Entrar na Sala
                  </Button>
                </div>

                {/* Judge Call */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground"
                  onClick={() => {
                    toast({
                      title: "Juiz chamado",
                      description: "Um juiz foi notificado para esta partida",
                      variant: "default",
                    });
                    // TODO: Call judge via Supabase functions
                  }}
                >
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Chamar Juiz
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Report Modal */}
      {selectedMatch && (
        <TournamentMatchReportModal
          open={reportModalOpen}
          onOpenChange={setReportModalOpen}
          matchId={selectedMatch.id}
          tournamentId={selectedMatch.tournament_id}
          opponentUsername={selectedMatch.opponent_username}
          opponentId={selectedMatch.opponent_id}
          onReportSubmitted={() => {
            fetchPendingMatches();
            setReportModalOpen(false);
          }}
        />
      )}
    </>
  );
};
