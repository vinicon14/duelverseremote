import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
        .select('*')
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
        <div className="flex items-center gap-3 mb-8">
          <Tv className="w-8 h-8 text-primary" />
          <h1 className="text-3xl md:text-4xl font-bold text-gradient-mystic">
            Transmissões ao Vivo
          </h1>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="card-mystic animate-pulse">
                <CardContent className="h-64" />
              </Card>
            ))}
          </div>
        ) : streams.length === 0 ? (
          <Card className="card-mystic text-center py-16">
            <Tv className="w-16 h-16 mx-auto text-primary/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma transmissão ao vivo</h3>
            <p className="text-muted-foreground">
              As transmissões aparecerão aqui quando estiverem ativas
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {streams.map(stream => (
              <Card 
                key={stream.id} 
                className={`card-mystic hover:scale-105 transition-transform cursor-pointer ${
                  stream.featured ? 'border-yellow-500/50' : ''
                }`}
                onClick={() => joinStream(stream.id)}
              >
                <CardContent className="p-6">
                  {stream.featured && (
                    <div className="flex items-center gap-2 mb-3">
                      <Crown className="w-4 h-4 text-yellow-500" />
                      <Badge variant="default" className="bg-yellow-500/20 text-yellow-500">
                        Em Destaque
                      </Badge>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 mb-4">
                    <Play className="w-5 h-5 text-red-500 animate-pulse" />
                    <span className="text-red-500 font-semibold">AO VIVO</span>
                  </div>

                  <h3 className="text-lg font-bold mb-2 truncate">
                    {stream.tournament_id ? 'Torneio' : 'Duelo'} #{stream.id.slice(0, 8)}
                  </h3>

                  <div className="flex items-center gap-2 text-muted-foreground mb-4">
                    <Users className="w-4 h-4" />
                    <span>{stream.viewers_count} espectadores</span>
                  </div>

                  {stream.recording_enabled && (
                    <Badge variant="secondary" className="mb-4">
                      📹 Gravando
                    </Badge>
                  )}

                  <Button className="btn-mystic text-white w-full">
                    Assistir Transmissão
                  </Button>
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