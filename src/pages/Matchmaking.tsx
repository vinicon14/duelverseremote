import { useState, useEffect, useRef, useCallback } from "react";
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
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const isRedirecting = useRef(false);

  const cleanup = useCallback(async () => {
    console.log('🧹 Cleaning up matchmaking...');
    
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
    
    // Remover da fila
    if (currentUserId.current) {
      await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', currentUserId.current);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      currentUserId.current = session.user.id;
      fetchQueueStats();
    };
    
    init();

    return () => {
      cleanup();
    };
  }, [cleanup, navigate]);

  useEffect(() => {
    if (searching) {
      timerInterval.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    
    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    };
  }, [searching]);

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

  const redirectToDuel = useCallback(async (duelId: string) => {
    if (isRedirecting.current) {
      console.log('⚠️ Already redirecting, skipping...');
      return;
    }
    
    isRedirecting.current = true;
    console.log('🎮 Redirecting to duel:', duelId);
    
    await cleanup();
    setSearching(false);
    
    toast.success("🎮 Match encontrado! Redirecionando...");
    navigate(`/duel/${duelId}`);
  }, [cleanup, navigate]);

  const checkForRedirect = useCallback(async () => {
    if (!currentUserId.current || isRedirecting.current) return;

    try {
      // Verificar tabela de redirects
      const { data: redirect } = await supabase
        .from('redirects')
        .select('duel_id')
        .eq('user_id', currentUserId.current)
        .not('duel_id', 'is', null)
        .maybeSingle();

      if (redirect?.duel_id) {
        console.log('🎮 Found redirect to duel:', redirect.duel_id);
        
        // Deletar redirect
        await supabase
          .from('redirects')
          .delete()
          .eq('user_id', currentUserId.current);
        
        await redirectToDuel(redirect.duel_id);
        return true;
      }

      // Verificar na fila se foi matched
      const { data: queueEntry } = await supabase
        .from('matchmaking_queue')
        .select('duel_id, status')
        .eq('user_id', currentUserId.current)
        .maybeSingle();

      if (queueEntry?.status === 'matched' && queueEntry?.duel_id) {
        console.log('🎮 Found match in queue:', queueEntry.duel_id);
        await redirectToDuel(queueEntry.duel_id);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking redirect:', error);
      return false;
    }
  }, [redirectToDuel]);

  const joinQueue = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Você precisa estar logado");
        navigate("/auth");
        return;
      }

      const userId = session.user.id;
      currentUserId.current = userId;
      isRedirecting.current = false;

      // Limpar qualquer entrada antiga do usuário
      await supabase
        .from('matchmaking_queue')
        .delete()
        .eq('user_id', userId);

      // Limpar redirects antigos
      await supabase
        .from('redirects')
        .delete()
        .eq('user_id', userId);

      // Verificar se já está em duelo
      const { data: existingDuels } = await supabase
        .from("live_duels")
        .select("id")
        .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
        .in("status", ["waiting", "in_progress"]);

      if (existingDuels && existingDuels.length > 0) {
        toast.error("Você já está em um duelo ativo");
        navigate(`/duel/${existingDuels[0].id}`);
        return;
      }

      setSearching(true);
      const matchType = isRanked ? 'ranked' : 'casual';

      console.log('🔍 Calling matchmake function...');
      
      // Usar a função RPC do banco de dados
      const { data: matchResult, error: matchError } = await supabase
        .rpc('matchmake', { 
          p_match_type: matchType, 
          p_user_id: userId 
        });

      if (matchError) {
        console.error('Matchmake error:', matchError);
        throw matchError;
      }

      console.log('📊 Matchmake result:', matchResult);

      if (matchResult && matchResult.length > 0) {
        const result = matchResult[0];
        
        if (result.player_role === 'matched' && result.duel_id) {
          // Match encontrado! Redirecionar imediatamente
          console.log('✅ Immediate match found:', result.duel_id);
          await redirectToDuel(result.duel_id);
          return;
        }
      }

      // Estamos na fila de espera - iniciar polling
      console.log('⏳ Waiting in queue, starting polling...');
      fetchQueueStats();

      // Polling a cada 2 segundos para verificar se foi matched
      pollingInterval.current = setInterval(async () => {
        const found = await checkForRedirect();
        if (found) {
          if (pollingInterval.current) {
            clearInterval(pollingInterval.current);
            pollingInterval.current = null;
          }
        }
      }, 2000);

      // Timeout de 60 segundos
      setTimeout(async () => {
        if (searching && !isRedirecting.current) {
          console.log('⏱️ Queue timeout');
          await cancelSearch();
          toast.error("Nenhum oponente encontrado. Tente novamente.");
        }
      }, 60000);

    } catch (error: any) {
      console.error("Error in joinQueue:", error);
      toast.error("Erro: " + error.message);
      setSearching(false);
    }
  };

  const cancelSearch = async () => {
    console.log('❌ Canceling search...');
    await cleanup();
    setSearching(false);
    setElapsedTime(0);
    isRedirecting.current = false;
    toast.info("Busca cancelada");
    fetchQueueStats();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const remainingTime = Math.max(0, 60 - elapsedTime);

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
                      <span>Tempo: {formatTime(elapsedTime)}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-primary transition-all duration-1000" 
                        style={{ width: `${(elapsedTime / 60) * 100}%` }} 
                      />
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      {remainingTime}s restantes
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
                <span>Você será pareado com jogadores buscando o mesmo tipo de partida</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>A busca expira em 60 segundos se nenhum oponente for encontrado</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Você será redirecionado automaticamente quando encontrar um match</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span>Partidas ranqueadas afetam seus pontos no ranking</span>
              </li>
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}