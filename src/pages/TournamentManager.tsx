import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Users, Coins, MessageSquare, Plus, Loader2, Crown } from "lucide-react";
import { useAccountType } from "@/hooks/useAccountType";

interface ManagedTournament {
  id: string;
  name: string;
  status: string;
  is_weekly: boolean;
  total_collected: number;
  prize_paid: boolean;
  prize_pool: number;
  participant_count: number;
  created_at: string;
}

interface Participant {
  user_id: string;
  username: string;
  avatar_url: string;
  is_online: boolean;
  joined_at: string;
}

const TournamentManager = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isPro, loading: loadingAccountType } = useAccountType();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<ManagedTournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<ManagedTournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

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
    await fetchMyCreatedTournaments(session.user.id);
  };

  const fetchMyCreatedTournaments = async (userId: string) => {
    setLoading(true);
    try {
      // Usando query direta em vez de RPC para evitar problemas de cache
      const { data, error } = await supabase
        .from('tournaments')
        .select(`*
          participant_count: tournament_participants(count)
        `)
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const tournamentsData = data.map((t: any) => ({
          ...t,
          participant_count: t.participant_count?.[0]?.count || 0
        })) as unknown as ManagedTournament[];
        setTournaments(tournamentsData);
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

  const fetchParticipants = async (tournamentId: string) => {
    setLoadingParticipants(true);
    try {
      const { data, error } = await supabase
        .rpc('get_tournament_participants', { p_tournament_id: tournamentId });

      if (error) throw error;

      if (data) {
        setParticipants(data as unknown as Participant[]);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar participantes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingParticipants(false);
    }
  };

  const handleSelectTournament = (tournament: ManagedTournament) => {
    setSelectedTournament(tournament);
    fetchParticipants(tournament.id);
  };

  const handleMessageParticipant = (participantId: string) => {
    navigate(`/chat/${participantId}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'upcoming':
        return <Badge className="bg-blue-500/20 text-blue-400">Em Breve</Badge>;
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400">Ativo</Badge>;
      case 'completed':
        return <Badge className="bg-gray-500/20 text-gray-400">Finalizado</Badge>;
      case 'expired':
        return <Badge className="bg-red-500/20 text-red-400">Expirado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const totalArrecadation = tournaments.reduce((sum, t) => sum + (t.total_collected || 0), 0);

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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <h1 className="text-3xl font-bold text-gradient-mystic flex items-center gap-2">
              <Crown className="w-8 h-8 text-yellow-500" />
              Gerenciador de Torneios
            </h1>
            {isPro && (
              <Button
                onClick={() => navigate('/create-weekly-tournament')}
                className="bg-yellow-500/20 text-yellow-600 hover:bg-yellow-500/30 border border-yellow-500/50"
              >
                <Trophy className="w-4 h-4 mr-2" />
                Criar Torneio Semanal
              </Button>
            )}
          </div>
          <p className="text-muted-foreground">
            Gerencie seus torneios e converse com participantes
          </p>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="card-mystic">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/20 rounded-full">
                  <Trophy className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Torneios Criados</p>
                  <p className="text-2xl font-bold">{tournaments.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-500/20 rounded-full">
                  <Coins className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Arrecadado</p>
                  <p className="text-2xl font-bold flex items-center gap-1">
                    {totalArrecadation.toLocaleString()} <span className="text-sm">DC</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-yellow-500/20 rounded-full">
                  <Users className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Participantes</p>
                  <p className="text-2xl font-bold">
                    {tournaments.reduce((sum, t) => sum + (t.participant_count || 0), 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tournament List */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Seus Torneios</h2>
            {tournaments.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Trophy className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum torneio criado</h3>
                <p className="text-muted-foreground mb-4">
                  Crie seu primeiro torneio para começar!
                </p>
                <Button
                  onClick={() => navigate('/create-tournament')}
                  className="btn-mystic text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Torneio
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {tournaments.map((tournament) => (
                  <Card
                    key={tournament.id}
                    className={`card-mystic cursor-pointer transition-all ${
                      selectedTournament?.id === tournament.id
                        ? 'border-primary/50 ring-1 ring-primary'
                        : 'hover:border-primary/30'
                    }`}
                    onClick={() => handleSelectTournament(tournament)}
                  >
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {tournament.is_weekly && (
                              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600">
                                🏆 Semanal
                              </Badge>
                            )}
                            {getStatusBadge(tournament.status)}
                          </div>
                          <h3 className="font-semibold">{tournament.name}</h3>
                          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {tournament.participant_count}
                            </span>
                            <span className="flex items-center gap-1">
                              <Coins className="w-4 h-4" />
                              Arrecadado: {tournament.total_collected?.toLocaleString() || 0}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          {tournament.prize_paid ? (
                            <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                              Prêmio Pago
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              Prêmio: {tournament.prize_pool?.toLocaleString()} DC
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Participants Panel */}
          <div>
            <h2 className="text-xl font-semibold mb-4">
              {selectedTournament
                ? `Participantes: ${selectedTournament.name}`
                : 'Selecione um Torneio'}
            </h2>

            {!selectedTournament ? (
              <Card className="card-mystic text-center py-12">
                <Users className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <p className="text-muted-foreground">
                  Selecione um torneio à esquerda para ver os participantes
                </p>
              </Card>
            ) : loadingParticipants ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : participants.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Users className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <p className="text-muted-foreground">
                  Nenhum participante inscrito ainda
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {participants.map((participant) => (
                  <Card key={participant.user_id} className="card-mystic">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={participant.avatar_url || ""} />
                            <AvatarFallback className="bg-primary/20">
                              {participant.username?.charAt(0).toUpperCase() || "U"}
                            </AvatarFallback>
                          </Avatar>
                          {participant.is_online && (
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-background rounded-full" />
                          )}
                        </div>

                        <div className="flex-1">
                          <h4 className="font-semibold flex items-center gap-2">
                            {participant.username}
                            {participant.is_online && (
                              <span className="text-xs text-green-500 font-normal">● Online</span>
                            )}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Inscrito em {new Date(participant.joined_at).toLocaleDateString()}
                          </p>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMessageParticipant(participant.user_id)}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Chat
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default TournamentManager;
