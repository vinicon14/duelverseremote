import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tv, Users, Play, Crown } from "lucide-react";
import { useBanCheck } from "@/hooks/useBanCheck";

const LiveStreams = () => {
  useBanCheck();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [streams, setStreams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    fetchStreams();
    
    // Realtime para streams
    const channel = supabase
      .channel('live-streams-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_streams',
        },
        () => {
          fetchStreams();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
    }
  };

  const fetchStreams = async () => {
    try {
      const { data, error } = await supabase
        .from('live_streams')
        .select(`
          *,
          profile:profiles(username, avatar_url)
        `)
        .eq('status', 'active')
        .order('featured', { ascending: false })
        .order('viewers_count', { ascending: false });

      if (error) throw error;
      setStreams(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar transmissões",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const joinStream = (streamId: string) => {
    navigate(`/stream/${streamId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <Tv className="w-8 h-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-bold text-gradient-mystic">
              Transmissões ao Vivo
            </h1>
          </div>
          <p className="text-muted-foreground mt-2 sm:mt-0">
            Assista duelos e torneios da comunidade
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="card-mystic animate-pulse">
                <div className="aspect-video bg-muted rounded-t-lg" />
                <CardContent className="p-4">
                  <div className="h-6 w-3/4 bg-muted rounded mb-2" />
                  <div className="h-4 w-1/2 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : streams.length === 0 ? (
          <Card className="card-mystic text-center py-16">
            <Tv className="w-16 h-16 mx-auto text-primary/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma transmissão ao vivo</h3>
            <p className="text-muted-foreground">
              Volte mais tarde para assistir as partidas da comunidade
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {streams.map(stream => (
              <Card 
                key={stream.id} 
                className="card-mystic overflow-hidden group cursor-pointer"
                onClick={() => joinStream(stream.id)}
              >
                <div className="relative aspect-video">
                  <div className="absolute top-2 left-2 flex items-center gap-2">
                    <Badge variant="destructive" className="flex items-center gap-1 z-10">
                      <Play className="w-3 h-3" />
                      AO VIVO
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1 z-10">
                      <Users className="w-3 h-3" />
                      {stream.viewers_count}
                    </Badge>
                  </div>

                  {stream.featured && (
                    <Badge className="absolute top-2 right-2 bg-yellow-500/90 text-black z-10">
                      <Crown className="w-3 h-3 mr-1" /> Destaque
                    </Badge>
                  )}

                  <div className="bg-gradient-to-t from-black/50 to-transparent absolute inset-0 z-0" />

                  <img
                    src={stream.profile?.avatar_url || '/placeholder.png'}
                    alt={`Avatar de ${stream.profile?.username}`}
                    className="w-10 h-10 rounded-full border-2 border-primary absolute bottom-2 left-2 z-10"
                  />
                </div>

                <CardContent className="p-4">
                  <h3 className="font-bold truncate group-hover:text-primary transition-colors">
                    Duelo de {stream.profile?.username || 'um duelista'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {stream.tournament_id ? 'Torneio Oficial' : 'Duelo Ranqueado'}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default LiveStreams;
