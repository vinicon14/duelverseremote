/**
 * DuelVerse - Torneios Semanais
 * Desenvolvido por Vinícius
 * 
 * Torneios recorrentes semanais com premiações em DuelCoins.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { WeeklyTournamentCard } from "@/components/tournament/WeeklyTournamentCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Plus, Loader2, RefreshCw, Crown, Lock } from "lucide-react";
import { useAccountType } from "@/hooks/useAccountType";

type WeeklyTournament = {
  id: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  max_participants: number;
  prize_pool: number;
  entry_fee: number;
  status: string;
  is_weekly: boolean;
  total_collected: number;
  prize_paid: boolean;
  created_by: string;
  current_round: number | null;
  participant_count: number;
};

const WeeklyTournaments = () => {
  const navigate = useNavigate();
  const { isPro, loading: loadingAccountType } = useAccountType();
  const [tournaments, setTournaments] = useState<WeeklyTournament[]>([]);
  const [joinedTournaments, setJoinedTournaments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!loadingAccountType && !isPro) {
      // Redirect non-Pro users
      navigate("/tournaments", { replace: true });
    }
  }, [isPro, loadingAccountType, navigate]);

  useEffect(() => {
    if (!loadingAccountType && isPro) {
      fetchUser();
    }
  }, [loadingAccountType, isPro]);

  const fetchUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  useEffect(() => {
    if (userId) {
      fetchTournaments();
    }
  }, [userId]);

  const fetchTournaments = async () => {
    setLoading(true);
    try {
      // Try RPC first (works after cache is updated)
      const { data, error } = await supabase.rpc("get_weekly_tournaments");

      if (!error && data) {
        const tournamentsData = data as unknown as WeeklyTournament[];
        setTournaments(tournamentsData);
        
        // Verificar quais torneios o usuário está inscrito
        await fetchUserJoinedTournaments(tournamentsData);
        setLoading(false);
        return;
      }

      // Fallback: direct query if RPC fails
      const { data: directData, error: directError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('is_weekly', true)
        .order('created_at', { ascending: false });

      if (directError) throw directError;

      if (directData) {
        const tournamentsData = directData.map(t => ({
          ...t,
          participant_count: 0, // Will be updated by fetchUserJoinedTournaments
        })) as unknown as WeeklyTournament[];
        setTournaments(tournamentsData);
        
        await fetchUserJoinedTournaments(tournamentsData);
      }
    } catch (error) {
      console.error("Error fetching tournaments:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserJoinedTournaments = async (tournamentsData: WeeklyTournament[]) => {
    if (!userId) return;
    
    const joined = new Set<string>();
    
    // Buscar inscrições do usuário
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: participations } = await supabase
      .from("tournament_participants")
      .select("tournament_id")
      .eq("user_id", user.id);

    participations?.forEach((p: any) => {
      joined.add(p.tournament_id);
    });

    setJoinedTournaments(joined);
  };

  const isUserCreator = (tournament: WeeklyTournament) => {
    return tournament.created_by === userId;
  };

  const isUserJoined = (tournamentId: string) => {
    return joinedTournaments.has(tournamentId);
  };

  if (loadingAccountType) {
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

  if (!isPro) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-500/20 rounded-full">
              <Trophy className="w-8 h-8 text-yellow-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gradient-mystic">Torneios Semanais</h1>
              <p className="text-muted-foreground">
                Participe de torneios automáticos com duração de 1 semana
              </p>
            </div>
          </div>
          <Button
            onClick={() => navigate("/create-weekly-tournament")}
            className="btn-mystic text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Criar Torneio Semanal
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTournaments}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty State */}
        {!loading && tournaments.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-medium mb-2">Nenhum Torneio Semanal</h3>
            <p className="text-muted-foreground mb-6">
              Seja o primeiro a criar um Torneio Semanal!
            </p>
            <Button
              onClick={() => navigate("/create-weekly-tournament")}
              className="btn-mystic text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Torneio Semanal
            </Button>
          </div>
        )}

        {/* Tournament Grid */}
        {!loading && tournaments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map((tournament) => (
              <WeeklyTournamentCard
                key={tournament.id}
                tournament={{
                  ...tournament,
                  created_at: new Date().toISOString(),
                } as any}
                isCreator={isUserCreator(tournament)}
                isJoined={isUserJoined(tournament.id)}
                onJoin={fetchTournaments}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default WeeklyTournaments;
