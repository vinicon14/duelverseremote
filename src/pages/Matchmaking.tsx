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
  const [isRanked, setIsRanked] = useState(true);
  const currentUserId = useRef<string | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const queueChannel = useRef<any>(null);
  const queueTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkAuth();
    fetchQueueStats();

    // Limpar entrada da fila ao desmontar ou recarregar página
    const cleanupOnUnload = async () => {
      if (currentUserId.current) {
        await supabase
          .from('matchmaking_queue')
          .delete()
          .eq('user_id', currentUserId.current)
          .eq('status', 'waiting');
      }
    };

    window.addEventListener('beforeunload', cleanupOnUnload);
    window.addEventListener('pagehide', cleanupOnUnload);

    return () => {
      window.removeEventListener('beforeunload', cleanupOnUnload);
      window.removeEventListener('pagehide', cleanupOnUnload);
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (searching) {
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

  const cleanup = async () => {
    if (queueChannel.current) {
      await supabase.removeChannel(queueChannel.current);
    }
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    if (queueTimeout.current) {
      clearTimeout(queueTimeout.current);
    }
    if (queueId) {
      await supabase.from('matchmaking_queue').delete().eq('id', queueId);
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
      const { count } = await supabase
        .from('matchmaking_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting');
      setPlayersInQueue(count || 0);
    } catch (error) {
      console.error('Error fetching queue stats:', error);
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

      // Limpar qualquer entrada antiga do usuário primeiro
      await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', session.user.id);

      // Verificar se já está em duelo
      const { data: existingDuels } = await supabase
        .from("live_duels")
        .select("id")
        .or(`creator_id.eq.${session.user.id},opponent_id.eq.${session.user.id}`)
        .in("status", ["waiting", "in_progress"]);

      if (existingDuels && existingDuels.length > 0) {
        toast.error("Você já está em um duelo ativo");
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      setSearching(true);
      const matchType = isRanked ? 'ranked' : 'casual';

      // Primeiro, verificar se há alguém esperando
      const { data: waitingPlayers } = await supabase
        .from('matchmaking_queue')
        .select('id, user_id')
        .eq('match_type', matchType)
        .eq('status', 'waiting')
        .neq('user_id', session.user.id)
        .gt('expires_at', new Date().toISOString())
        .limit(1)
        .maybeSingle();

      if (waitingPlayers) {
        // Match encontrado imediatamente!
        // Eu sou o segundo jogador (player2), o outro estava esperando (player1)
        await createMatchAndRedirect(waitingPlayers.user_id, session.user.id, waitingPlayers.id, isRanked);
        return;
      }

      // Ninguém esperando, entrar na fila
      const expiresAt = new Date(Date.now() + 30000).toISOString(); // 30 segundos
      const { data: queueEntry, error: queueError } = await supabase
        .from('matchmaking_queue')
        .insert({
          user_id: session.user.id,
          match_type: matchType,
          expires_at: expiresAt,
          status: 'waiting'
        })
        .select()
        .single();

      if (queueError) {
        console.error('Error joining queue:', queueError);
        toast.error("Erro ao entrar na fila");
        setSearching(false);
        return;
      }

      console.log('✅ Joined queue:', queueEntry);
      setQueueId(queueEntry.id);
      fetchQueueStats();

      // Setup realtime listener para:
      // 1. Novos jogadores entrando na fila
      // 2. Updates na própria entrada (quando matched)
      queueChannel.current = supabase
        .channel(`matchmaking_${session.user.id}_${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'matchmaking_queue',
            filter: `match_type=eq.${matchType}`
          },
          async (payload) => {
            const newPlayer = payload.new as any;
            console.log('👤 New player joined queue:', newPlayer);
            if (newPlayer.user_id !== session.user.id && newPlayer.status === 'waiting') {
              // Alguém novo entrou! Eu estava esperando (player1), ele é o player2
              console.log('🎮 Match found! Creating match...');
              await createMatchAndRedirect(session.user.id, newPlayer.user_id, newPlayer.id, isRanked);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'matchmaking_queue',
            filter: `id=eq.${queueEntry.id}`
          },
          async (payload) => {
            const updated = payload.new as any;
            console.log('📝 My queue entry updated:', updated);
            
            // Se minha entrada foi marcada como matched por outro jogador
            if (updated.status === 'matched') {
              console.log('🎮 I was matched! Looking for duel...');
              
              // Tentar buscar o duelo algumas vezes (pode não estar criado ainda)
              let attempts = 0;
              const maxAttempts = 5;
              let myDuel = null;

              while (attempts < maxAttempts && !myDuel) {
                const { data } = await supabase
                  .from('live_duels')
                  .select('id')
                  .or(`opponent_id.eq.${session.user.id},creator_id.eq.${session.user.id}`)
                  .eq('status', 'in_progress')
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (data) {
                  myDuel = data;
                  console.log('✅ Found my duel:', myDuel.id);
                } else {
                  attempts++;
                  console.log(`🔍 Attempt ${attempts}/${maxAttempts} - Duel not found yet, retrying...`);
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }

              if (myDuel) {
                await cleanup();
                toast.success("🎮 Match encontrado! Redirecionando...");
                navigate(`/duel/${myDuel.id}`);
              } else {
                console.error('❌ Could not find duel after all attempts');
                toast.error("Erro ao encontrar partida");
                await cancelSearch();
              }
            }
          }
        )
        .subscribe();

      // Timeout de 30 segundos
      queueTimeout.current = setTimeout(async () => {
        console.log('⏱️ Queue timeout reached');
        await cancelSearch();
        toast.error("Nenhum oponente encontrado. Tente novamente ou crie uma sala.");
      }, 30000);

    } catch (error: any) {
      console.error("Error in joinQueue:", error);
      toast.error("Erro inesperado: " + error.message);
      setSearching(false);
    }
  };

  const createMatchAndRedirect = async (player1Id: string, player2Id: string, myQueueId: string, ranked: boolean) => {
    try {
      console.log('🎮 Creating match between', player1Id, 'and', player2Id);
      
      // Obter IDs das entradas da fila de ambos jogadores
      const { data: queueEntries } = await supabase
        .from('matchmaking_queue')
        .select('id')
        .in('user_id', [player1Id, player2Id])
        .eq('status', 'waiting');

      const queueIdsToDelete = queueEntries?.map(entry => entry.id) || [myQueueId];

      console.log('📋 Queue IDs to process:', queueIdsToDelete);

      // Criar duelo PRIMEIRO
      const { data: duel, error } = await supabase
        .from('live_duels')
        .insert({
          creator_id: player1Id,
          opponent_id: player2Id,
          room_name: `Match ${ranked ? 'Ranqueado' : 'Casual'}`,
          status: 'in_progress',
          is_ranked: ranked,
          duration_minutes: 50,
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      console.log('🎯 Match created, duel ID:', duel.id);

      // DEPOIS: Atualizar status para 'matched' para notificar o outro jogador
      await supabase
        .from('matchmaking_queue')
        .update({ status: 'matched' })
        .in('id', queueIdsToDelete);

      console.log('✅ Updated queue entries to matched');

      // Aguardar para dar tempo do outro usuário receber o evento e encontrar o duelo
      await new Promise(resolve => setTimeout(resolve, 500));

      // Limpar fila
      await supabase
        .from('matchmaking_queue')
        .delete()
        .in('id', queueIdsToDelete);

      await cleanup();
      
      toast.success("🎮 Match encontrado! Redirecionando...");
      
      // Navegar imediatamente
      navigate(`/duel/${duel.id}`);
    } catch (error: any) {
      console.error('❌ Error creating match:', error);
      toast.error("Erro ao criar partida");
      await cleanup();
      setSearching(false);
    }
  };

  const cancelSearch = async () => {
    try {
      if (queueId) {
        await supabase.from('matchmaking_queue').delete().eq('id', queueId);
      }
      await cleanup();
      setSearching(false);
      setQueueId(null);
      setElapsedTime(0);
      toast.info("Busca cancelada");
    } catch (error) {
      console.error('Error canceling search:', error);
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
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold gradient-text">Matchmaking</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Find your next opponent</p>
          </div>

          <Card className="card-mystic p-4 sm:p-8">
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
                  <div className="text-center py-6 sm:py-8">
                    <Swords className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-primary animate-pulse" />
                    <h3 className="text-lg sm:text-xl font-semibold mb-2">Pronto para Duelar?</h3>
                    <p className="text-sm sm:text-base text-muted-foreground mb-6">
                      Vamos encontrar um oponente para você
                    </p>
                  </div>
                  
                  <div className="space-y-3 mb-4">
                    <label className="text-sm font-medium">Tipo de Partida</label>
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
                    <p className="text-xs text-muted-foreground text-center">
                      {isRanked 
                        ? "✅ Vale pontos no ranking" 
                        : "❌ Não vale pontos no ranking"}
                    </p>
                  </div>
                  
                  <Button 
                    onClick={joinQueue}
                    className="w-full btn-mystic"
                    size="lg"
                  >
                    <Swords className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    Buscar Partida {isRanked ? 'Ranqueada' : 'Casual'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-6 sm:py-8">
                    <Loader2 className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-primary animate-spin" />
                    <h3 className="text-lg sm:text-xl font-semibold mb-2">Procurando Oponente...</h3>
                    <div className="flex items-center justify-center gap-2 text-sm sm:text-base text-muted-foreground">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>Tempo decorrido: {formatTime(elapsedTime)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-primary animate-pulse" style={{ width: "60%" }} />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Procurando oponente... {30 - elapsedTime}s restantes
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
