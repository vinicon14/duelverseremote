/**
 * DuelVerse - Torneios
 * Desenvolvido por Vinícius
 * 
 * Lista e gerenciamento de torneios.
 * Usuários podem criar, participar e gerenciar torneios.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { TournamentCard } from "@/components/TournamentCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Trophy, Plus, Crown, Users, Settings } from "lucide-react";
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
import { useTcg } from "@/contexts/TcgContext";
import { DecklistUploadModal } from "@/components/tournament/DecklistUploadModal";
import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "react-i18next";

const Tournaments = () => {
  useBanCheck();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const { isPro } = useAccountType();
  const { activeTcg } = useTcg();
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [decklistTournamentId, setDecklistTournamentId] = useState<string | null>(null);
  const [pendingJoinTournamentId, setPendingJoinTournamentId] = useState<string | null>(null);
  
  const canCreateTournament = isAdmin || isPro;

  useEffect(() => {
    checkAuth();
    fetchTournaments();
  }, [activeTcg]);

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
        .eq('tcg_type', activeTcg)
        .order('start_date', { ascending: true });

      if (error) throw error;

      const tournamentsWithCount = data?.map(t => ({
        ...t,
        participants: t.tournament_participants?.[0]?.count || 0,
      })) || [];

      setTournaments(tournamentsWithCount);
    } catch (error: any) {
      toast({
        title: t('tournaments.errorLoad'),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const joinTournament = async (tournamentId: string) => {
    if (!currentUser) return;

    // Check if tournament requires decklist
    const tournament = tournaments.find(t => t.id === tournamentId);
    if (tournament?.requires_decklist) {
      // Check if user already uploaded decklist
      const { data: existing } = await (supabase as any)
        .from('tournament_decklists')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (!existing) {
        // Show upload modal first, then join after upload
        setPendingJoinTournamentId(tournamentId);
        setDecklistTournamentId(tournamentId);
        return;
      }
    }

    await executeJoin(tournamentId);
  };

  const executeJoin = async (tournamentId: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('charge-tournament-entry-fee', {
        body: { tournament_id: tournamentId },
      });

      const result = data;
      let message = result?.message || '';
      if (error && !message) {
        try {
          const ctx = (error as any)?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            message = body?.message || error.message;
          } else { message = error.message; }
        } catch { message = error.message; }
      }
      if (!message) message = t('tournaments.errorJoin');

      if (error || !result?.success) {
        const isAlreadyJoined = message.includes('já está inscrito') || message.includes('23505');
        const isNoBalance = message.includes('Saldo insuficiente') || message.includes('precisa de');
        
        toast({
          title: isAlreadyJoined ? t('tournaments.alreadyJoined') : isNoBalance ? t('tournaments.noBalance') : t('tournaments.errorJoin'),
          description: isAlreadyJoined ? t('tournaments.alreadyJoinedDesc') : isNoBalance ? t('tournaments.noBalanceDesc') : message,
          variant: "destructive",
        });
        if (isNoBalance) {
          setTimeout(() => navigate('/buy-duelcoins'), 1500);
        }
        return;
      }

      toast({
        title: t('tournaments.joinSuccess'),
        description: result.message,
      });

      await fetchTournaments();
    } catch (error: any) {
      const msg = error?.message || '';
      const isAlreadyJoined = msg.includes('já está inscrito') || msg.includes('23505');
      const isNoBalance = msg.includes('Saldo insuficiente') || msg.includes('precisa de');
      
      toast({
        title: isAlreadyJoined ? t('tournaments.alreadyJoined') : isNoBalance ? t('tournaments.noBalance') : t('tournaments.errorJoin'),
        description: isAlreadyJoined ? t('tournaments.alreadyJoinedDesc') : isNoBalance ? t('tournaments.noBalanceDesc') : msg,
        variant: "destructive",
      });
      if (isNoBalance) {
        setTimeout(() => navigate('/buy-duelcoins'), 1500);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDecklistUploaded = () => {
    if (pendingJoinTournamentId) {
      executeJoin(pendingJoinTournamentId);
      setPendingJoinTournamentId(null);
    }
  };

  const upcomingTournaments = tournaments.filter(t => t.status === 'upcoming');
  const activeTournaments = tournaments.filter(t => t.status === 'active');
  const completedTournaments = tournaments.filter(t => t.status === 'completed');

  return (
    <div className="min-h-screen bg-background">
      <SEOHead tKey="tournaments" path="/tournaments" />
      <Navbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8 animate-fade-in-up">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient-mystic mb-2">
              <Trophy className="w-8 h-8 inline-block mr-2 animate-float" />
              {t('tournaments.title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {t('tournaments.subtitle')}
            </p>
          </div>

          {canCreateTournament ? (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => navigate("/my-tournaments")}
              >
                <Users className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t('tournaments.myTournaments')}</span>
              </Button>
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => navigate("/tournament-manager")}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t('tournaments.manager')}</span>
              </Button>
              <Button
                className="btn-mystic text-white flex-1 sm:flex-none"
                onClick={() => navigate("/create-tournament")}
              >
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t('tournaments.create')}</span>
                <span className="sm:hidden">{t('tournaments.createShort')}</span>
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => navigate("/my-tournaments")}
              >
                <Users className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">{t('tournaments.myTournaments')}</span>
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex-1 sm:flex-none">
                      <Button disabled className="opacity-50 w-full">
                        <Crown className="mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">{t('tournaments.createPro')}</span>
                        <span className="sm:hidden">PRO</span>
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('tournaments.createProTip')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        <Tabs defaultValue="upcoming" className="space-y-4 sm:space-y-6 animate-fade-in-up delay-150">
          <TabsList className="w-full sm:w-auto grid grid-cols-3 sm:inline-flex">
            <TabsTrigger value="upcoming" className="text-xs sm:text-sm">
              {t('tournaments.tabUpcoming', { count: upcomingTournaments.length })}
            </TabsTrigger>
            <TabsTrigger value="active" className="text-xs sm:text-sm">
              {t('tournaments.tabActive', { count: activeTournaments.length })}
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-xs sm:text-sm">
              {t('tournaments.tabCompleted', { count: completedTournaments.length })}
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
                <h3 className="text-xl font-semibold mb-2">{t('tournaments.noUpcoming')}</h3>
                <p className="text-muted-foreground">
                  {t('tournaments.noUpcomingDesc')}
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
                <h3 className="text-xl font-semibold mb-2">{t('tournaments.noActive')}</h3>
                <p className="text-muted-foreground">
                  {t('tournaments.noActiveDesc')}
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
                <h3 className="text-xl font-semibold mb-2">{t('tournaments.noCompleted')}</h3>
                <p className="text-muted-foreground">
                  {t('tournaments.noCompletedDesc')}
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

      {/* Decklist Upload Modal */}
      <DecklistUploadModal
        open={!!decklistTournamentId}
        onOpenChange={(open) => {
          if (!open) {
            setDecklistTournamentId(null);
            setPendingJoinTournamentId(null);
          }
        }}
        tournamentId={decklistTournamentId || ""}
        onUploaded={handleDecklistUploaded}
      />
    </div>
  );
};

export default Tournaments;
