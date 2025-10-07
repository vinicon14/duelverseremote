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
    queueChannel.current = supabase
      .channel('matchmaking_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matchmaking_queues'
        },
        () => {
          fetchQueueStats();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_duels'
        },
        async (payload) => {
          // Verificar se sou um dos jogadores deste novo duelo
          if (currentUserId.current && 
              (payload.new.player1_id === currentUserId.current || 
               payload.new.player2_id === currentUserId.current)) {
            toast.success("🎮 Partida encontrada!");
            setSearching(false);
            navigate(`/duel/${payload.new.id}`);
          }
        }
      )
      .subscribe();
  };

  const cleanup = async () => {
    // Remover da fila ao sair
    if (queueId) {
      await supabase
        .from("matchmaking_queues")
        .delete()
        .eq("id", queueId);
    }

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
    try {
      const { count, error } = await supabase
        .from("matchmaking_queues")
        .select("*", { count: "exact", head: true })
        .eq("queue_status", "searching");
      
      if (error) {
        console.error("Error fetching queue stats:", error);
      } else {
        setPlayersInQueue(count || 0);
      }
    } catch (error) {
      console.error("Error:", error);
    }
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
        .or(`player1_id.eq.${session.user.id},player2_id.eq.${session.user.id}`)
        .in("status", ["waiting", "active"]);

      if (duelsError) {
        console.error("Error checking existing duels:", duelsError);
      }

      if (existingDuels && existingDuels.length > 0) {
        toast.error("Você já está em um duelo ativo");
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      // Verificar se o usuário já está na fila
      const { data: queueCheck, error: queueCheckError } = await supabase
        .from("matchmaking_queues")
        .select("id")
        .eq("player_id", session.user.id)
        .eq("queue_status", "searching");

      if (queueCheckError) {
        console.error("Error checking queue:", queueCheckError);
      }

      if (queueCheck && queueCheck.length > 0) {
        toast.error("Você já está na fila de matchmaking");
        return;
      }

      // Get user's ELO
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("elo_rating")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profileError) {
        toast.error("Erro ao carregar perfil: " + profileError.message);
        return;
      }

      if (!profile) {
        toast.error("Perfil não encontrado");
        return;
      }

      // Add to queue
      const { data: queueEntry, error } = await supabase
        .from("matchmaking_queues")
        .insert({
          player_id: session.user.id,
          elo_rating: profile.elo_rating || 1500,
          queue_status: "searching",
        })
        .select()
        .maybeSingle();

      if (error) {
        toast.error("Erro ao entrar na fila: " + error.message);
        console.error("Queue error:", error);
        return;
      }

      if (!queueEntry) {
        toast.error("Erro ao criar entrada na fila");
        return;
      }

      setQueueId(queueEntry.id);
      setSearching(true);
      setElapsedTime(0);
      toast.success("🔍 Procurando oponente...");
      
      // Try to find a match immediately
      await findMatch(session.user.id, profile.elo_rating || 1500);
    } catch (error: any) {
      console.error("Unexpected error in joinQueue:", error);
      toast.error("Erro inesperado: " + error.message);
    }
  };

  const findMatch = async (playerId: string, playerElo: number) => {
    try {
      // Expandir gradualmente o range de ELO conforme o tempo passa
      const eloRange = 200 + (elapsedTime * 10); // Aumenta 10 pontos por segundo
      
      // Look for opponents in queue with similar ELO
      const { data: opponents, error: opponentsError } = await supabase
        .from("matchmaking_queues")
        .select("*")
        .eq("queue_status", "searching")
        .neq("player_id", playerId)
        .gte("elo_rating", playerElo - eloRange)
        .lte("elo_rating", playerElo + eloRange)
        .order("queue_time", { ascending: true })
        .limit(1);

      if (opponentsError) {
        console.error("Error finding opponents:", opponentsError);
        return;
      }

      if (opponents && opponents.length > 0) {
        const opponent = opponents[0];
        
        // Tentar criar duelo atomicamente
        // Primeiro marcar ambos como "matched" para evitar race conditions
        const { error: updateError } = await supabase
          .from("matchmaking_queues")
          .update({ queue_status: "matched" })
          .in("id", [queueId!, opponent.id]);

        if (updateError) {
          console.error("Error updating queue status:", updateError);
          return;
        }

        // Create duel
        const { data: duel, error: duelError } = await supabase
          .from("live_duels")
          .insert({
            player1_id: playerId,
            player2_id: opponent.player_id,
            status: "active",
            room_name: `Ranked Match ${Date.now()}`,
            started_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (duelError) {
          console.error("Error creating duel:", duelError);
          // Reverter status se falhar
          await supabase
            .from("matchmaking_queues")
            .update({ queue_status: "searching" })
            .in("id", [queueId!, opponent.id]);
          return;
        }

        if (!duel) {
          console.error("No duel created");
          return;
        }

        // Remove both players from queue
        await supabase
          .from("matchmaking_queues")
          .delete()
          .in("id", [queueId!, opponent.id]);

        // A navegação será feita pelo listener realtime
        console.log("Match created successfully:", duel.id);
      }
    } catch (error) {
      console.error("Unexpected error in findMatch:", error);
    }
  };

  const cancelSearch = async () => {
    if (!queueId) return;

    try {
      await supabase
        .from("matchmaking_queues")
        .delete()
        .eq("id", queueId);

      setSearching(false);
      setQueueId(null);
      setElapsedTime(0);
      toast.info("Busca cancelada");
    } catch (error) {
      console.error("Error canceling search:", error);
    }
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
