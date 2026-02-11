import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, Calendar, Clock, Swords, Loader2 } from "lucide-react";

interface MyTournament {
  id: string;
  name: string;
  status: string;
  is_weekly: boolean;
  created_by: string;
  current_round: number | null;
  created_at: string;
}

interface Opponent {
  opponent_id: string;
  opponent_username: string;
  match_id: string;
  round: number;
  status: string;
}

const MyTournaments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [myTournaments, setMyTournaments] = useState<MyTournament[]>([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState<MyTournament[]>([]);
  const [activeTournaments, setActiveTournaments] = useState<MyTournament[]>([]);
  const [completedTournaments, setCompletedTournaments] = useState<MyTournament[]>([]);
  const [opponents, setOpponents] = useState<Record<string, Opponent[]>>({});

  useEffect(() => {
    checkAuthAndFetch();
  }, []);

  const checkAuthAndFetch = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setUserId(session.user.id);
    await fetchMyTournaments(session.user.id);
  };

  const fetchMyTournaments = async (userId: string) => {
    setLoading(true);
    try {
      // Try RPC first (works after cache is updated)
      const { data, error } = await (supabase as any).rpc('get_my_tournaments');

      if (!error && data) {
        const tournaments = data as unknown as MyTournament[];
        setMyTournaments(tournaments);

        // Separate by status
        setUpcomingTournaments(tournaments.filter(t => t.status === 'upcoming'));
        setActiveTournaments(tournaments.filter(t => t.status === 'active'));
        setCompletedTournaments(tournaments.filter(t => ['completed', 'expired'].includes(t.status)));

        // Fetch opponents for active tournaments
        const activeIds = tournaments.filter(t => t.status === 'active').map(t => t.id);
        await fetchOpponentsForTournaments(activeIds, userId);
        setLoading(false);
        return;
      }

      // Fallback: direct query if RPC fails
      const { data: directData, error: directError } = await supabase
        .from('tournament_participants')
        .select('tournaments(*)')
        .eq('user_id', userId);

      if (directError) throw directError;

      if (directData) {
        const tournaments = directData
          .map((d: any) => d.tournaments)
          .filter(Boolean) as MyTournament[];

        setMyTournaments(tournaments);
        setUpcomingTournaments(tournaments.filter(t => t.status === 'upcoming'));
        setActiveTournaments(tournaments.filter(t => t.status === 'active'));
        setCompletedTournaments(tournaments.filter(t => ['completed', 'expired'].includes(t.status)));
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar torneios",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOpponentsForTournaments = async (tournamentIds: string[], userId: string) => {
    const opponentsData: Record<string, Opponent[]> = {};

    for (const tournamentId of tournamentIds) {
      try {
        const { data, error } = await (supabase as any)
          .rpc('get_tournament_opponents', { p_tournament_id: tournamentId });

        if (!error && data) {
          opponentsData[tournamentId] = data as unknown as Opponent[];
        }
      } catch (err) {
        console.error(`Error fetching opponents for tournament ${tournamentId}:`, err);
      }
    }

    setOpponents(opponentsData);
  };

  const challengeOpponent = async (opponentId: string, tournamentId: string) => {
    if (!userId) return;

    try {
      // Check if user already in active duel
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        toast({
          title: "Você já está em um duelo",
          description: "Termine ou saia do duelo atual antes de desafiar.",
          variant: "destructive",
        });
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      // Check if opponent is available
      const { data: opponentDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${opponentId},opponent_id.eq.${opponentId}`)
        .in('status', ['waiting', 'in_progress']);

      if (opponentDuels && opponentDuels.length > 0) {
        toast({
          title: "Oponente ocupado",
          description: "Seu adversário já está em outro duelo.",
          variant: "destructive",
        });
        return;
      }

      // Create duel
      const { data: duelData, error: duelError } = await supabase
        .from('live_duels')
        .insert({
          creator_id: userId,
          status: 'waiting',
          is_ranked: false,
        })
        .select()
        .single();

      if (duelError) throw duelError;

      // Create invite
      await supabase.from('duel_invites').insert({
        sender_id: userId,
        receiver_id: opponentId,
        duel_id: duelData.id,
        status: 'pending',
      });

      toast({
        title: "Desafio enviado!",
        description: "Convite enviado para seu adversário.",
      });

      navigate(`/duel/${duelData.id}`);
    } catch (error: any) {
      toast({
        title: "Erro ao criar desafio",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming':
        return <Badge className="bg-blue-500/20 text-blue-400">Em Breve</Badge>;
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400">Em Andamento</Badge>;
      case 'completed':
        return <Badge className="bg-gray-500/20 text-gray-400">Finalizado</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/20 text-red-400">Expirado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderTournamentCard = (tournament: MyTournament, showChallenge: boolean = false) => {
    const tournamentOpponents = opponents[tournament.id] || [];

    return (
      <Card key={tournament.id} className="card-mystic hover:border-primary/40 transition-all">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-xl text-gradient-mystic mb-2">
                {tournament.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                {tournament.is_weekly && (
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500">
                    🏆 Semanal
                  </Badge>
                )}
                {getStatusBadge(tournament.status)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tournament.current_round && tournament.status === 'active' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>Rodada {tournament.current_round}</span>
            </div>
          )}

          {/* Challenge Buttons for Active Tournaments */}
          {showChallenge && tournamentOpponents.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Seus Oponentes:</p>
              {tournamentOpponents.map((opponent) => (
                <div
                  key={opponent.match_id}
                  className="flex items-center justify-between p-2 bg-background/50 rounded-lg"
                >
                  <span className="text-sm font-medium">
                    vs {opponent.opponent_username || 'TBD'}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => challengeOpponent(opponent.opponent_id, tournament.id)}
                    className="btn-mystic text-white"
                  >
                    <Swords className="w-3 h-3 mr-1" />
                    Desafiar
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate(`/tournaments/${tournament.id}`)}
          >
            Ver Detalhes
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gradient-mystic mb-2">
            Meus Torneios
          </h1>
          <p className="text-muted-foreground">
            Torneios em que você está inscrito
          </p>
        </div>

        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="upcoming">
              Em Breve ({upcomingTournaments.length})
            </TabsTrigger>
            <TabsTrigger value="active">
              Ativos ({activeTournaments.length})
            </TabsTrigger>
            <TabsTrigger value="completed">
              Finalizados ({completedTournaments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {upcomingTournaments.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Trophy className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum torneio em breve</h3>
                <p className="text-muted-foreground mb-4">
                  Inscreva-se em torneios para vê-los aqui!
                </p>
                <Button
                  onClick={() => navigate('/tournaments')}
                  className="btn-mystic text-white"
                >
                  Ver Torneios Disponíveis
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingTournaments.map((t) => renderTournamentCard(t, false))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="active">
            {activeTournaments.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Trophy className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum torneio ativo</h3>
                <p className="text-muted-foreground mb-4">
                  Aguarde o início de seus torneios inscritos!
                </p>
                <Button
                  onClick={() => navigate('/tournaments')}
                  className="btn-mystic text-white"
                >
                  Ver Torneios Disponíveis
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeTournaments.map((t) => renderTournamentCard(t, true))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedTournaments.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Trophy className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum torneio finalizado</h3>
                <p className="text-muted-foreground">
                  Seus torneios concluídos aparecerão aqui!
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedTournaments.map((t) => renderTournamentCard(t, false))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default MyTournaments;
