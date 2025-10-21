import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Trophy, Swords, TrendingUp, Calendar } from "lucide-react";
import { AvatarUpload } from "@/components/AvatarUpload";

const Profile = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    await fetchProfile(session.user.id);
    await fetchStats(session.user.id);
    await fetchRecentMatches(session.user.id);
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Perfil não encontrado",
          description: "Por favor, faça logout e login novamente.",
          variant: "destructive",
        });
        return;
      }
      
      setProfile(data);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar perfil",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchStats = async (userId: string) => {
    try {
      const { data: matches, error } = await supabase
        .from('match_history')
        .select('*')
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);

      if (error) throw error;

      const wins = matches?.filter(m => m.winner_id === userId).length || 0;
      const total = matches?.length || 0;
      const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : '0.0';

      setStats({
        totalGames: total,
        wins,
        losses: total - wins,
        winRate,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao carregar estatísticas",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentMatches = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('match_history')
        .select(`
          *,
          player1:profiles!match_history_player1_id_fkey(username),
          player2:profiles!match_history_player2_id_fkey(username),
          winner:profiles!match_history_winner_id_fkey(username)
        `)
        .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
        .order('played_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentMatches(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar partidas:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="animate-pulse space-y-6">
            <div className="h-48 bg-card rounded-lg" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-card rounded-lg" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        {/* Profile Header */}
        <Card className="card-mystic mb-6 sm:mb-8">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-4 sm:gap-6">
              <AvatarUpload
                userId={profile?.user_id}
                currentAvatarUrl={profile?.avatar_url}
                username={profile?.username}
                onAvatarUpdated={(newUrl) => setProfile({ ...profile, avatar_url: newUrl })}
              />

              <div className="flex-1 text-center md:text-left">
                <h1 className="text-2xl sm:text-3xl font-bold text-gradient-mystic mb-2">
                  {profile?.username || 'Usuário'}
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground mb-4">
                  {profile?.bio || 'Duelista do Duelverse'}
                </p>
                
                <div className="flex flex-wrap gap-2 sm:gap-4 justify-center md:justify-start">
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-primary/10">
                    <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-secondary" />
                    <span className="text-sm sm:text-base font-semibold">Nível {profile?.level || 1}</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-primary/10">
                    <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    <span className="text-sm sm:text-base font-semibold">ELO: {profile?.elo_rating || 1500}</span>
                  </div>
                </div>
              </div>

              <Button onClick={() => navigate('/duels')} className="btn-mystic text-white w-full md:w-auto">
                <Swords className="mr-2 h-4 w-4" />
                Novo Duelo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <Card className="card-mystic">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm text-muted-foreground">Total de Jogos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-gradient-mystic">
                {stats?.totalGames || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm text-muted-foreground">Vitórias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-gradient-gold">
                {stats?.wins || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm text-muted-foreground">Derrotas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-destructive">
                {stats?.losses || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="card-mystic">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs sm:text-sm text-muted-foreground">Taxa de Vitória</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-bold text-primary">
                {stats?.winRate || 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Matches */}
        <Card className="card-mystic">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <span className="text-gradient-mystic">Partidas Recentes</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentMatches.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma partida jogada ainda
              </p>
            ) : (
              <div className="space-y-4">
                {recentMatches.map((match) => {
                  const isWinner = match.winner_id === profile?.user_id;
                  return (
                    <div
                      key={match.id}
                      className={`p-4 rounded-lg border ${
                        isWinner ? 'border-secondary/30 bg-secondary/5' : 'border-destructive/30 bg-destructive/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            isWinner ? 'bg-secondary/20 text-secondary' : 'bg-destructive/20 text-destructive'
                          }`}>
                            {isWinner ? 'VITÓRIA' : 'DERROTA'}
                          </div>
                          <span className="text-sm text-muted-foreground">
                            vs {match.player1?.username === profile?.username ? match.player2?.username : match.player1?.username}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(match.played_at).toLocaleDateString('pt-BR')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Profile;
