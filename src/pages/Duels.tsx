import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Swords, Plus, Users, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useBanCheck } from "@/hooks/useBanCheck";
import { QueueWaiting } from "@/components/QueueWaiting";

const Duels = () => {
  useBanCheck(); // Proteger contra usuários banidos
  const navigate = useNavigate();
  const { toast } = useToast();
  const [duels, setDuels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [roomName, setRoomName] = useState("");
  const [isRanked, setIsRanked] = useState(true);
  const [waitingDuelId, setWaitingDuelId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    checkAuth();
    fetchDuels();

    const channel = supabase
      .channel('live_duels_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_duels'
        },
        () => {
          fetchDuels();
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

  const fetchDuels = async () => {
    try {
      const { data, error } = await supabase
        .from('live_duels')
        .select(`
          *,
          creator:profiles!live_duels_creator_id_fkey(username, avatar_url),
          opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url)
        `)
        .in('status', ['waiting', 'in_progress'])
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
    if (!roomName.trim()) {
      toast({
        title: "Nome obrigatório",
        description: "Digite um nome para a sala",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Verificar se o usuário já está em algum duelo ativo
      const { data: existingDuels } = await supabase
        .from('live_duels')
        .select('id, status')
        .or(`creator_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .in('status', ['waiting', 'in_progress']);

      if (existingDuels && existingDuels.length > 0) {
        toast({
          title: "Você já está em um duelo",
          description: "Termine ou saia do duelo atual antes de criar outro.",
          variant: "destructive",
        });
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      const { data, error } = await supabase
        .from('live_duels')
        .insert({
          creator_id: user.id,
          status: 'waiting',
          is_ranked: isRanked,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Sala criada!",
        description: "Aguardando oponente entrar na fila...",
      });

      // NÃO redirecionar, apenas mostrar popup de espera
      setWaitingDuelId(data.id);
      setShowCreateDialog(false);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Verificar se o duelo existe e pegar seus dados
      const { data: duelData } = await supabase
        .from('live_duels')
        .select('creator_id, opponent_id, status')
        .eq('id', duelId)
        .maybeSingle();

      if (!duelData) {
        toast({
          title: "Duelo não encontrado",
          description: "Este duelo não existe mais.",
          variant: "destructive",
        });
        return;
      }

      // Verificar se o usuário já é um dos jogadores deste duelo
      if (duelData.creator_id === user.id || duelData.opponent_id === user.id) {
        toast({
          title: "Você já está neste duelo",
          description: "Redirecionando...",
        });
        navigate(`/duel/${duelId}`);
        return;
      }

      // Verificar se o usuário já está em outro duelo ativo
      const { data: otherDuels } = await supabase
        .from('live_duels')
        .select('id')
        .or(`creator_id.eq.${user.id},opponent_id.eq.${user.id}`)
        .in('status', ['waiting', 'in_progress'])
        .neq('id', duelId);

      if (otherDuels && otherDuels.length > 0) {
        toast({
          title: "Você já está em outro duelo",
          description: "Termine ou saia do duelo atual antes de entrar em outro.",
          variant: "destructive",
        });
        navigate(`/duel/${otherDuels[0].id}`);
        return;
      }

      const { error } = await supabase
        .from('live_duels')
        .update({
          opponent_id: user.id,
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })
        .eq('id', duelId);

      if (error) throw error;

      toast({
        title: "Entrando na partida!",
        description: "Aguarde enquanto carregamos a chamada...",
      });

      // Aguardar para garantir que o banco foi atualizado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verificar se foi realmente atualizado antes de redirecionar
      const { data: updatedDuel } = await supabase
        .from('live_duels')
        .select('opponent_id')
        .eq('id', duelId)
        .single();
      
      if (updatedDuel?.opponent_id === user.id) {
        navigate(`/duel/${duelId}`);
      } else {
        toast({
          title: "Erro ao entrar",
          description: "Não foi possível confirmar sua entrada. Tente novamente.",
          variant: "destructive",
        });
      }
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
      <Navbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gradient-mystic mb-2">
              Arena de Duelos
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Crie ou entre em um duelo ao vivo
            </p>
          </div>

          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="btn-mystic text-white w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Criar Duelo
              </Button>
            </DialogTrigger>
            <DialogContent className="card-mystic">
              <DialogHeader>
                <DialogTitle className="text-gradient-mystic">Criar Nova Sala</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room-name">Nome da Sala</Label>
                  <Input
                    id="room-name"
                    placeholder="Ex: Duelo Épico"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Tipo de Partida</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={isRanked ? "default" : "outline"}
                      onClick={() => setIsRanked(true)}
                      className={isRanked ? "btn-mystic text-white" : ""}
                    >
                      🏆 Ranqueada
                    </Button>
                    <Button
                      type="button"
                      variant={!isRanked ? "default" : "outline"}
                      onClick={() => setIsRanked(false)}
                      className={!isRanked ? "btn-mystic text-white" : ""}
                    >
                      🎮 Casual
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isRanked 
                      ? "✅ Vale pontos no ranking" 
                      : "❌ Não vale pontos no ranking"}
                  </p>
                </div>
                
                <Button onClick={createDuel} className="w-full btn-mystic text-white">
                  Criar e Entrar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="card-mystic animate-pulse">
                <CardHeader className="h-32" />
              </Card>
            ))}
          </div>
        ) : duels.length === 0 ? (
          <Card className="card-mystic text-center py-12">
            <Swords className="w-16 h-16 mx-auto text-primary/50 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Nenhum duelo disponível</h3>
            <p className="text-muted-foreground">
              Seja o primeiro a criar uma sala!
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {duels.map((duel) => (
              <Card key={duel.id} className="card-mystic hover:border-primary/40 transition-all">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-gradient-mystic">{duel.room_name}</span>
                    <div className="flex gap-1">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        duel.is_ranked 
                          ? 'bg-yellow-500/20 text-yellow-500' 
                          : 'bg-blue-500/20 text-blue-500'
                      }`}>
                        {duel.is_ranked ? '🏆 Ranqueada' : '🎮 Casual'}
                      </span>
                      {duel.status === 'waiting' ? (
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary">
                          Aguardando
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full bg-accent/20 text-accent">
                          Em andamento
                        </span>
                      )}
                    </div>
                  </CardTitle>
                  <CardDescription>
                    Criado por {duel.creator?.username || 'Anônimo'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center text-muted-foreground">
                        <Users className="w-4 h-4 mr-2" />
                        {duel.opponent_id ? '2/2' : '1/2'} jogadores
                      </div>
                      <div className="flex items-center text-muted-foreground">
                        <Clock className="w-4 h-4 mr-2" />
                        {new Date(duel.created_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    {duel.status === 'waiting' && !duel.opponent_id && (
                      <Button
                        onClick={() => joinDuel(duel.id)}
                        className="w-full btn-mystic text-white"
                      >
                        <Swords className="mr-2 h-4 w-4" />
                        Entrar no Duelo
                      </Button>
                    )}

                    {duel.status === 'in_progress' && !duel.opponent_id && (
                      <Button
                        onClick={() => joinDuel(duel.id)}
                        className="w-full btn-mystic text-white"
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Entrar na Sala
                      </Button>
                    )}

                    {duel.status === 'in_progress' && duel.opponent_id && (
                      <Button
                        disabled
                        className="w-full"
                        variant="outline"
                      >
                        <Users className="mr-2 h-4 w-4" />
                        Sala Completa
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Popup de espera na fila */}
      {waitingDuelId && (
        <QueueWaiting
          duelId={waitingDuelId}
          onCancel={() => setWaitingDuelId(null)}
        />
      )}
    </div>
  );
};

export default Duels;
