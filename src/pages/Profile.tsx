/**
 * DuelVerse - Perfil do Usuário
 * Desenvolvido por Vinícius
 * 
 * Exibe perfil do usuário com estatísticas, histórico de partidas,
 * upload de avatar e configurações de conta.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Trophy, Swords, Star, Calendar, Video, Eye, Play } from "lucide-react";
import { AvatarUpload } from "@/components/AvatarUpload";
import { BrowserNotificationTest } from "@/components/BrowserNotificationTest";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Recording {
  id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  views: number;
  is_public: boolean;
}

const Profile = () => {
  const navigate = useNavigate();
  const { userId: paramUserId } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  
  // Get initial tab from URL param
  const initialTab = searchParams.get('tab') || 'stats';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    checkAuth();
  }, [paramUserId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    
    setCurrentUser(session.user);
    
    // If viewing a specific user's profile
    const targetUserId = paramUserId || session.user.id;
    setIsOwnProfile(targetUserId === session.user.id);
    
    await fetchProfile(targetUserId);
    await fetchStats(targetUserId);
    await fetchRecentMatches(targetUserId);
    await fetchRecordings(targetUserId);
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
          description: "O usuário não existe.",
          variant: "destructive",
        });
        navigate('/');
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

  const fetchRecordings = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('match_recordings')
        .select('*')
        .eq('user_id', userId)
        .eq('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecordings(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar gravações:', error);
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
        {/* Push Notification Test - Only for own profile */}
        {isOwnProfile && <BrowserNotificationTest />}

        {/* Profile Header */}
        <Card className="card-mystic mb-6 sm:mb-8">
          <CardContent className="pt-4 sm:pt-6">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-4 sm:gap-6">
              {isOwnProfile ? (
                <AvatarUpload
                  userId={profile?.user_id}
                  currentAvatarUrl={profile?.avatar_url}
                  username={profile?.username}
                  onAvatarUpdated={(newUrl) => setProfile({ ...profile, avatar_url: newUrl })}
                />
              ) : (
                <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-primary/20">
                  <img 
                    src={profile?.avatar_url || '/placeholder.svg'} 
                    alt={profile?.username}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

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
                    <Star className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                    <span className="text-sm sm:text-base font-semibold">{profile?.points || 0} Pontos</span>
                  </div>
                </div>
              </div>

              {isOwnProfile && (
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                  <ChangePasswordForm />
                  <Button onClick={() => navigate('/duels')} className="btn-mystic text-white">
                    <Swords className="mr-2 h-4 w-4" />
                    Novo Duelo
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stats" className="gap-2">
              <Trophy className="h-4 w-4" />
              Estatísticas
            </TabsTrigger>
            <TabsTrigger value="gallery" className="gap-2">
              <Video className="h-4 w-4" />
              Galeria
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
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
          </TabsContent>

          <TabsContent value="gallery">
            <Card className="card-mystic">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Video className="w-5 h-5 text-primary" />
                  <span className="text-gradient-mystic">Galeria de Vídeos</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recordings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma gravação pública disponível
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recordings.map((recording) => (
                      <Card 
                        key={recording.id} 
                        className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                        onClick={() => navigate(`/video/${recording.id}`)}
                      >
                        <div className="relative aspect-video bg-muted">
                          {recording.thumbnail_url ? (
                            <img 
                              src={recording.thumbnail_url} 
                              alt={recording.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20">
                              <Video className="w-12 h-12 text-muted-foreground" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play className="w-12 h-12 text-white" />
                          </div>
                        </div>
                        <CardContent className="p-3">
                          <h3 className="font-semibold text-sm truncate">{recording.title}</h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {recording.views}
                            </span>
                            <span>
                              {formatDistanceToNow(new Date(recording.created_at), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Profile;
