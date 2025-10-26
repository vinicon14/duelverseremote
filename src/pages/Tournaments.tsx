import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { TournamentCard } from "@/components/TournamentCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Plus, Crown } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdmin } from "@/hooks/useAdmin";
import { useAccountType } from "@/hooks/useAccountType";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBanCheck } from "@/hooks/useBanCheck";

const Tournaments = () => {
  useBanCheck(); // Proteger contra usuários banidos
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const { isPro } = useAccountType();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  const canCreateTournament = isAdmin || isPro;

  useEffect(() => {
    checkAuth();
    fetchTournaments();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setCurrentUser(session.user);
  };

  const fetchTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select(`
          *,
          tournament_participants(count)
        `)
        .order('start_date', { ascending: true });

      if (error) throw error;

      const tournamentsWithCount = data?.map(t => ({
        ...t,
        participants: t.tournament_participants?.[0]?.count || 0,
      })) || [];

      setTournaments(tournamentsWithCount);
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

  const joinTournament = async (tournamentId: string) => {
    if (!currentUser) return;

    try {
      const tournament = tournaments.find(t => t.id === tournamentId);
      if (!tournament) return;

      // Verificar se já está inscrito
      const { data: existingParticipant } = await supabase
        .from('tournament_participants')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('user_id', currentUser.id)
        .single();

      if (existingParticipant) {
        toast({
          title: "Já inscrito",
          description: "Você já está participando deste torneio",
        });
        return;
      }

      // Verificar se há vagas
      if (tournament.participants >= tournament.max_participants) {
        toast({
          title: "Torneio cheio",
          description: "Não há mais vagas disponíveis",
          variant: "destructive",
        });
        return;
      }

      // Inscrever no torneio
      const { error } = await supabase
        .from('tournament_participants')
        .insert({
          tournament_id: tournamentId,
          user_id: currentUser.id,
          status: 'registered'
        });

      if (error) throw error;

      toast({
        title: "Inscrição realizada!",
        description: "Você foi inscrito no torneio com sucesso",
      });

      fetchTournaments();
    } catch (error: any) {
      toast({
        title: "Erro ao se inscrever",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const upcomingTournaments = tournaments.filter(t => t.status === 'upcoming');
  const activeTournaments = tournaments.filter(t => t.status === 'active');
  const completedTournaments = tournaments.filter(t => t.status === 'completed');

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient-mystic mb-2">
              Torneios
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Participe de torneios e ganhe recompensas
            </p>
          </div>

          {canCreateTournament ? (
            <Button
              className="btn-mystic text-white w-full sm:w-auto"
              onClick={() => navigate("/create-tournament")}
            >
              <Plus className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Criar Torneio</span>
              <span className="sm:hidden">Criar</span>
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="w-full sm:w-auto">
                    <Button disabled className="opacity-50 w-full sm:w-auto">
                      <Crown className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">Criar Torneio (PRO)</span>
                      <span className="sm:hidden">Criar (PRO)</span>
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Apenas usuários PRO ou Admin podem criar torneios</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <Tabs defaultValue="upcoming" className="space-y-4 sm:space-y-6">
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
            <TabsTrigger value="upcoming" className="text-xs sm:text-sm">
              Em Breve ({upcomingTournaments.length})
            </TabsTrigger>
            <TabsTrigger value="active" className="text-xs sm:text-sm">
              Ativos ({activeTournaments.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">
              Finalizados ({completedTournaments.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <Card key={i} className="card-mystic animate-pulse">
                    <CardContent className="h-64" />
                  </Card>
                ))}
              </div>
            ) : upcomingTournaments.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Trophy className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum torneio disponível</h3>
                <p className="text-muted-foreground">
                  Novos torneios serão anunciados em breve!
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {upcomingTournaments.map(tournament => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    onJoin={joinTournament}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="active">
            {activeTournaments.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Trophy className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum torneio ativo</h3>
                <p className="text-muted-foreground">
                  Aguarde o início dos próximos torneios
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeTournaments.map(tournament => (
                  <TournamentCard key={tournament.id} tournament={tournament} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedTournaments.length === 0 ? (
              <Card className="card-mystic text-center py-12">
                <Trophy className="w-16 h-16 mx-auto text-primary/50 mb-4" />
                <h3 className="text-xl font-semibold mb-2">Nenhum torneio finalizado</h3>
                <p className="text-muted-foreground">
                  Histórico de torneios aparecerá aqui
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {completedTournaments.map(tournament => (
                  <TournamentCard key={tournament.id} tournament={tournament} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Tournaments;
