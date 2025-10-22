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
  useBanCheck();
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [playersInQueue, setPlayersInQueue] = useState(0);
  const [isRanked, setIsRanked] = useState(true);
  const currentUserId = useRef<string | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const redirectsChannel = useRef<any>(null);
  const queueTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkAuth();
    fetchQueueStats();

    const cleanupOnUnload = () => {
      cancelSearch(false); // Don't show toast on page unload
    };

    window.addEventListener('beforeunload', cleanupOnUnload);

    return () => {
      window.removeEventListener('beforeunload', cleanupOnUnload);
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (searching) {
      timerInterval.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    }
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, [searching]);

  const cleanup = () => {
    if (redirectsChannel.current) {
      supabase.removeChannel(redirectsChannel.current);
      redirectsChannel.current = null;
    }
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    if (queueTimeout.current) {
      clearTimeout(queueTimeout.current);
    }
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    currentUserId.current = session.user.id;
    setupRedirectsListener(session.user.id);
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

  const setupRedirectsListener = (userId: string) => {
    if (redirectsChannel.current) return;

    redirectsChannel.current = supabase
      .channel(`redirects_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'redirects',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          const { duel_id } = payload.new;
          if (duel_id) {
            toast.success("🎮 Match encontrado! Redirecionando...");
            cleanup();
            navigate(`/duel/${duel_id}`);
          }
        }
      )
      .subscribe();
  };

  const joinQueue = async () => {
    if (!currentUserId.current) {
      toast.error("Autenticação não encontrada. Faça login novamente.");
      return;
    }

    setSearching(true);
    const matchType = isRanked ? 'ranked' : 'casual';

    try {
      const { data, error } = await supabase.rpc('matchmake', {
        p_user_id: currentUserId.current,
        p_match_type: matchType
      });

      if (error) {
        throw new Error(`RPC Error: ${error.message}`);
      }

      // If data is returned, a match was created instantly by the function.
      // The redirect listener will handle the navigation.
      if (data && data.length > 0) {
        console.log('Match made instantly:', data);
      } else {
        // No match found, user is in the queue. Set a timeout.
        console.log('Entered queue, waiting for opponent...');
        queueTimeout.current = setTimeout(() => {
          cancelSearch();
          toast.error("Nenhum oponente encontrado. Tente novamente.");
        }, 60000); // 60-second timeout
      }
    } catch (error: any) {
      console.error("Error in joinQueue:", error);
      toast.error("Erro inesperado ao buscar partida: " + error.message);
      setSearching(false);
    }
  };

  const cancelSearch = async (showToast = true) => {
    if (!currentUserId.current) return;

    try {
      await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', currentUserId.current);

      if (showToast) {
        toast.info("Busca cancelada");
      }
    } catch (error: any) {
      console.error('Error canceling search:', error);
      if (showToast) {
        toast.error("Erro ao cancelar a busca: " + error.message);
      }
    } finally {
      cleanup();
      setSearching(false);
      setElapsedTime(0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <Navbar />
      
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold gradient-text">Matchmaking</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Encontre seu próximo oponente</p>
          </div>

          <Card className="card-mystic p-4 sm:p-8">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Jogadores na fila: <span className="font-bold text-foreground">{playersInQueue}</span>
                  </span>
                </div>
              </div>

              {!searching ? (
                <div className="space-y-4">
                  <div className="text-center py-6 sm:py-8">
                    <Swords className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-primary animate-pulse" />
                    <h3 className="text-lg sm:text-xl font-semibold mb-2">Pronto para Duelar?</h3>
                    <p className="text-sm sm:text-base text-muted-foreground mb-6">
                      Vamos encontrar um oponente para você.
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
                        ? "Sua pontuação será afetada."
                        : "Apenas por diversão, sem alteração de pontos."}
                    </p>
                  </div>
                  
                  <Button 
                    onClick={joinQueue}
                    className="w-full btn-mystic"
                    size="lg"
                    disabled={searching}
                  >
                    <Swords className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    Buscar Partida
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center py-6 sm:py-8">
                    <Loader2 className="h-12 w-12 sm:h-16 sm:w-16 mx-auto mb-4 text-primary animate-spin" />
                    <h3 className="text-lg sm:text-xl font-semibold mb-2">Procurando Oponente...</h3>
                    <div className="flex items-center justify-center gap-2 text-sm sm:text-base text-muted-foreground">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>Tempo na fila: {formatTime(elapsedTime)}</span>
                    </div>
                  </div>

                  <Button 
                    onClick={() => cancelSearch(true)}
                    variant="outline"
                    className="w-full"
                  >
                    Cancelar Busca
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
