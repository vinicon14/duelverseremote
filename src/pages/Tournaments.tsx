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
        .select('*')
        .order('start_date', { ascending: true });

      if (error) throw error;

      const tournamentsWithCount = data?.map(t => ({
        ...t,
        participants: 0, // Count not implemented yet
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
    // Tournament participants feature not yet implemented
    toast({
      title: "Em desenvolvimento",
      description: "A inscrição em torneios ainda não está disponível",
      variant: "destructive",
    });
  };

  const upcomingTournaments = tournaments.filter(t => t.status === 'upcoming');
  const activeTournaments = tournaments.filter(t => t.status === 'active');
  const completedTournaments = tournaments.filter(t => t.status === 'completed');

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gradient-mystic mb-2">
              Torneios
            </h1>
            <p className="text-muted-foreground">
              Participe de torneios e ganhe recompensas
            </p>
          </div>

          {canCreateTournament ? (
            <Button className="btn-mystic text-white" disabled>
              <Plus className="mr-2 h-4 w-4" />
              Criar Torneio (Em breve)
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button disabled className="opacity-50">
                      <Crown className="mr-2 h-4 w-4" />
                      Criar Torneio (PRO)
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

        <Tabs defaultValue="upcoming" className="space-y-6">
          <TabsList>
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
