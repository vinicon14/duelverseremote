import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { Loader2, Swords, Users, Clock } from "lucide-react";
import { toast } from "sonner";
import { useBanCheck } from "@/hooks/useBanCheck";

export default function Matchmaking() {
  useBanCheck(); // Proteger contra usuários banidos
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [playersInQueue, setPlayersInQueue] = useState(0);
  const currentUserId = useRef<string | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const queueChannel = useRef<any>(null);

  useEffect(() => {
    checkAuth();
    fetchQueueStats();
    setupRealtimeListeners();

    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (searching) {
      // Timer para mostrar tempo decorrido
      timerInterval.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);

      return () => {
        if (timerInterval.current) {
          clearInterval(timerInterval.current);
        }
      };
    } else {
      setElapsedTime(0);
    }
  }, [searching]);

  const setupRealtimeListeners = () => {
    // Listener para mudanças na fila (novo match criado)
    // Realtime listeners disabled for now (matchmaking not fully implemented)
  };

  const cleanup = async () => {
    // Limpar listeners
    if (queueChannel.current) {
      await supabase.removeChannel(queueChannel.current);
    }

    // Limpar timer
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    currentUserId.current = session.user.id;
  };

  const fetchQueueStats = async () => {
    // Matchmaking queue not yet implemented
    setPlayersInQueue(0);
  };

  const joinQueue = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      // Verificar se o usuário já está em algum duelo ativo
      const { data: existingDuels, error: duelsError } = await supabase
        .from("live_duels")
        .select("id, status")
        .or(`creator_id.eq.${session.user.id},opponent_id.eq.${session.user.id}`)
        .in("status", ["waiting", "in_progress"]);

      if (duelsError) {
        console.error("Error checking existing duels:", duelsError);
      }

      if (existingDuels && existingDuels.length > 0) {
        toast.error("Você já está em um duelo ativo");
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      // Matchmaking system not yet fully implemented
      toast.error("Matchmaking em desenvolvimento. Use 'Duelos' para criar uma partida manual.");
      navigate('/duels');
    } catch (error: any) {
      console.error("Unexpected error in joinQueue:", error);
      toast.error("Erro inesperado: " + error.message);
    }
  };

  const findMatch = async (playerId: string, playerElo: number) => {
    // Not implemented yet
  };

  const cancelSearch = async () => {
    setSearching(false);
    setQueueId(null);
    setElapsedTime(0);
    toast.info("Busca cancelada");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold gradient-text">Matchmaking</h1>
            <p className="text-muted-foreground">Find your next opponent</p>
          </div>

          <Card className="card-mystic p-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Players in queue: <span className="font-bold text-foreground">{playersInQueue}</span>
                  </span>
                </div>
              </div>

              {!searching ? (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <Swords className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse" />
                    <h3 className="text-xl font-semibold mb-2">Ready to Duel?</h3>
                    <p className="text-muted-foreground mb-6">
                      We'll match you with an opponent of similar skill level
                    </p>
                  </div>
                  
                  <Button 
                    onClick={joinQueue}
                    className="w-full btn-mystic"
                    size="lg"
                  >
                    <Swords className="mr-2 h-5 w-5" />
                    Find Match
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-8">
                    <Loader2 className="h-16 w-16 mx-auto mb-4 text-primary animate-spin" />
                    <h3 className="text-xl font-semibold mb-2">Procurando Oponente...</h3>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Tempo decorrido: {formatTime(elapsedTime)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-primary animate-pulse" style={{ width: "60%" }} />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Expandindo busca... (ELO ±{200 + (elapsedTime * 10)})
                    </p>
                  </div>

                  <Button 
                    onClick={cancelSearch}
                    variant="outline"
                    className="w-full"
                  >
                    Cancelar Busca
                  </Button>
                </div>
              )}
            </div>
          </Card>

          <Card className="card-mystic p-6">
            <h3 className="font-semibold mb-4">Como Funciona o Matchmaking</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Pareamos jogadores com ELO similar (inicialmente ±200 pontos)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>A busca expande gradualmente para encontrar oponentes mais rápido</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Notificação instantânea quando uma partida é encontrada</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Seu ELO será atualizado após cada partida</span>
              </li>
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}
