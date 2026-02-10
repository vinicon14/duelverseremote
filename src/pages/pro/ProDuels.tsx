import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProNavbar } from "@/components/ProNavbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, Clock, Trophy, Swords, Crown } from "lucide-react";

export default function ProDuels() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [duels, setDuels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
    fetchDuels();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setCurrentUser(session.user);
  };

  const fetchDuels = async () => {
    try {
      const { data, error } = await supabase
        .from('live_duels')
        .select(`
          *,
          creator:profiles!creator_id(username, avatar_url, points),
          opponent:profiles!opponent_id(username, avatar_url, points)
        `)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDuels(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar duelos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const createDuel = async () => {
    try {
      const roomName = `Duel-${Date.now()}`;
      const { data, error } = await supabase
        .from('live_duels')
        .insert({
          creator_id: currentUser.id,
          room_name: roomName,
          status: 'waiting',
          is_ranked: true,
        })
        .select()
        .single();

      if (error) throw error;

      navigate(`/duel/${data.id}`);
    } catch (error: any) {
      toast({
        title: "Erro ao criar duelo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const joinDuel = async (duelId: string) => {
    try {
      const { error } = await supabase
        .from('live_duels')
        .update({
          opponent_id: currentUser.id,
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', duelId)
        .eq('status', 'waiting')
        .is('opponent_id', null);

      if (error) throw error;

      navigate(`/duel/${duelId}`);
    } catch (error: any) {
      toast({
        title: "Erro ao entrar no duelo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <ProNavbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        {/* PRO Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="w-8 h-8 text-yellow-500" />
            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient-pro bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600">
                Duelos PRO
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Crie ou entre em salas de duelo
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-yellow-500 font-medium">Zero Anúncios</span>
            <Crown className="w-5 h-5 text-yellow-500" />
          </div>
        </div>

        {/* Create Duel Button */}
        <Card className="card-mystic mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-1">Criar Novo Duelo</h3>
                <p className="text-sm text-muted-foreground">
                  Crie uma sala e convide um oponente
                </p>
              </div>
              <Button onClick={createDuel} className="btn-mystic text-white w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Criar Duelo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Available Duels */}
        <h2 className="text-xl font-semibold mb-4">Salas Disponíveis</h2>
        
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <Card key={i} className="card-mystic animate-pulse">
                <CardContent className="h-40" />
              </Card>
            ))}
          </div>
        ) : duels.length === 0 ? (
          <Card className="card-mystic text-center py-12">
            <Swords className="w-16 h-16 mx-auto text-primary/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhuma sala disponível</h3>
            <p className="text-muted-foreground mb-4">
              Seja o primeiro a criar um duelo!
            </p>
            <Button onClick={createDuel} className="btn-mystic text-white">
              <Plus className="mr-2 h-4 w-4" />
              Criar Duelo
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {duels.map(duel => (
              <Card key={duel.id} className="card-mystic hover:border-primary/60 transition-all">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      Sala: {duel.room_name || duel.id.slice(0, 8)}
                    </CardTitle>
                    {duel.is_ranked && (
                      <div className="px-2 py-1 bg-primary/20 text-primary rounded text-xs">
                        Ranked
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{duel.creator?.username || 'Desconhecido'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{duel.creator?.points || 0} pts</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>{new Date(duel.created_at).toLocaleString()}</span>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => navigate(`/duel/${duel.id}`)}
                    >
                      Observar
                    </Button>
                    <Button 
                      className="flex-1 btn-mystic text-white"
                      onClick={() => joinDuel(duel.id)}
                      disabled={duel.opponent_id !== null}
                    >
                      Entrar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
