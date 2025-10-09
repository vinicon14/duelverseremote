import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { PhoneOff } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DuelChat } from "@/components/DuelChat";
import { FloatingCalculator } from "@/components/FloatingCalculator";
import { useBanCheck } from "@/hooks/useBanCheck";

const DuelRoom = () => {
  useBanCheck(); // Proteger contra usuários banidos
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [duel, setDuel] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [player1LP, setPlayer1LP] = useState(8000);
  const [player2LP, setPlayer2LP] = useState(8000);
  const [callDuration, setCallDuration] = useState(0);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const callStartTime = useRef<number | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  // Nenhuma inicialização necessária para Whereby - usa iframe direto

  // Carrega dados do duelo e inicia timer
  useEffect(() => {
    checkAuth();
    fetchDuel();

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, [id]);

  // Listener realtime para sincronizar LP entre usuários
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`duel-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_duels',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log('LP atualizado via realtime:', payload);
          if (payload.new) {
            setPlayer1LP(payload.new.player1_lp || 8000);
            setPlayer2LP(payload.new.player2_lp || 8000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const startCallTimer = () => {
    callStartTime.current = Date.now();
    const MAX_DURATION = 3600; // 60 minutos em segundos
    
    timerInterval.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (callStartTime.current || Date.now())) / 1000);
      const remaining = Math.max(0, MAX_DURATION - elapsed);
      setCallDuration(remaining);

      // Aviso quando restar 5 minutos (300 segundos)
      if (remaining === 300 && !showTimeWarning) {
        setShowTimeWarning(true);
        toast({
          title: "⏰ Atenção: Tempo de chamada",
          description: "Restam apenas 5 minutos. A chamada será encerrada automaticamente em 0:00.",
          duration: 10000,
        });
      }

      // Finalizar automaticamente quando chegar a 0:00
      if (remaining === 0) {
        if (timerInterval.current) {
          clearInterval(timerInterval.current);
        }
        toast({
          title: "⏱️ Tempo esgotado",
          description: "A chamada atingiu o limite de 60 minutos e será encerrada.",
          variant: "destructive",
        });
        endDuel();
      }
    }, 1000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };


  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    setCurrentUser(session.user);
  };

  const fetchDuel = async () => {
    try {
      const { data, error } = await supabase
        .from('live_duels')
        .select(`
          *,
          creator:profiles!live_duels_creator_id_fkey(username, avatar_url),
          opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Duelo não encontrado",
          description: "Este duelo não existe ou foi removido.",
          variant: "destructive",
        });
        navigate('/duels');
        return;
      }
      
      setDuel(data);
      setPlayer1LP(data.player1_lp || 8000);
      setPlayer2LP(data.player2_lp || 8000);

      // Iniciar duelo se ainda não foi iniciado
      if (!data.started_at) {
        const now = new Date().toISOString();
        await supabase
          .from('live_duels')
          .update({ 
            started_at: now,
            status: 'in_progress'
          })
          .eq('id', id);
        
        callStartTime.current = new Date(now).getTime();
      } else {
        callStartTime.current = new Date(data.started_at).getTime();
      }

      // Iniciar timer
      startCallTimer();

      // Verificar se já passou 60 minutos
      const elapsed = Math.floor((Date.now() - callStartTime.current) / 1000);
      if (elapsed >= 3600) {
        await endDuel();
      }
    } catch (error: any) {
      toast({
        title: "Erro ao carregar duelo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateLP = async (player: 'player1' | 'player2', amount: number) => {
    const isPlayer1 = player === 'player1';
    const currentLP = isPlayer1 ? player1LP : player2LP;
    const newLP = Math.max(0, currentLP + amount);

    if (isPlayer1) {
      setPlayer1LP(newLP);
    } else {
      setPlayer2LP(newLP);
    }

    try {
      await supabase
        .from('live_duels')
        .update({
          [`${player}_lp`]: newLP,
        })
        .eq('id', id);

      if (newLP === 0) {
        await endDuel(player === 'player1' ? duel?.opponent_id : duel?.creator_id);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar LP",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const setLP = async (player: 'player1' | 'player2', value: number) => {
    const newLP = Math.max(0, value);
    
    if (player === 'player1') {
      setPlayer1LP(newLP);
    } else {
      setPlayer2LP(newLP);
    }

    try {
      await supabase
        .from('live_duels')
        .update({
          [`${player}_lp`]: newLP,
        })
        .eq('id', id);

      if (newLP === 0) {
        await endDuel(player === 'player1' ? duel?.opponent_id : duel?.creator_id);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar LP",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const endDuel = async (winnerId?: string) => {
    try {
      const durationMinutes = callStartTime.current 
        ? Math.floor((Date.now() - callStartTime.current) / 60000) 
        : 0;

      // Atualizar status do duelo
      await supabase
        .from('live_duels')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
          winner_id: winnerId,
        })
        .eq('id', id);

      // Registrar histórico se houver vencedor
      if (winnerId) {
        await supabase.from('match_history').insert({
          player1_id: duel?.creator_id,
          player2_id: duel?.opponent_id,
          winner_id: winnerId,
          bet_amount: duel?.bet_amount || 0,
          player1_score: winnerId === duel?.opponent_id ? 0 : player1LP,
          player2_score: winnerId === duel?.creator_id ? 0 : player2LP,
        });

        // Atualizar vitórias e derrotas dos perfis
        const loserId = winnerId === duel?.creator_id ? duel?.opponent_id : duel?.creator_id;
        
        // Buscar perfis atuais
        const { data: winnerProfile } = await supabase
          .from('profiles')
          .select('wins, points')
          .eq('user_id', winnerId)
          .single();

        const { data: loserProfile } = await supabase
          .from('profiles')
          .select('losses, points')
          .eq('user_id', loserId)
          .single();

        // Atualizar vencedor
        if (winnerProfile) {
          await supabase
            .from('profiles')
            .update({ 
              wins: (winnerProfile.wins || 0) + 1,
              points: (winnerProfile.points || 0) + 100
            })
            .eq('user_id', winnerId);
        }
        
        // Atualizar perdedor
        if (loserProfile) {
          await supabase
            .from('profiles')
            .update({ 
              losses: (loserProfile.losses || 0) + 1
            })
            .eq('user_id', loserId);
        }
      }

      // Deletar o duelo após 60 minutos
      setTimeout(async () => {
        await supabase
          .from('live_duels')
          .delete()
          .eq('id', id);
      }, 60000); // 1 minuto após finalizar

      toast({
        title: "Duelo finalizado!",
        description: winnerId ? "Vencedor registrado" : "Duelo encerrado",
      });

      setTimeout(() => navigate('/duels'), 2000);
    } catch (error: any) {
      toast({
        title: "Erro ao finalizar duelo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleLeave = () => {
    navigate('/duels');
  };

  const isPlayer1 = currentUser?.id === duel?.creator_id;
  const isPlayer2 = currentUser?.id === duel?.opponent_id;
  const canControlLP = isPlayer1 || isPlayer2;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="px-2 sm:px-4 pt-16 sm:pt-20 pb-2 sm:pb-4">
        <div className="h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] relative">
          {/* Video Call - Whereby Embed */}
          <div className="h-full w-full rounded-lg overflow-hidden bg-card shadow-2xl border border-primary/20">
            <iframe
              src={`https://whereby.com/duelverse-${id}?minimal&embed`}
              allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
              className="w-full h-full"
            />
          </div>

          {/* Botão de Sair e Timer - Fixo no canto superior direito */}
          <div className="absolute top-2 sm:top-4 right-2 sm:right-4 z-50 flex flex-col sm:flex-row gap-2 items-end sm:items-center">
            {/* Timer Display - Contagem Regressiva */}
            <div className={`px-2 sm:px-4 py-1 sm:py-2 rounded-lg backdrop-blur-sm font-mono text-xs sm:text-sm font-bold ${
              callDuration <= 300 ? 'bg-destructive/95 text-destructive-foreground animate-pulse' : 
              callDuration <= 600 ? 'bg-yellow-500/95 text-black' : 
              'bg-card/95'
            }`}>
              ⏱️ {formatTime(callDuration)}
            </div>
            
            <div className="flex gap-2">
              {canControlLP && (
                <Button
                  onClick={() => endDuel()}
                  variant="outline"
                  size="sm"
                  className="bg-card/95 backdrop-blur-sm text-xs sm:text-sm"
                >
                  Finalizar
                </Button>
              )}
              <Button
                onClick={handleLeave}
                variant="destructive"
                size="sm"
                className="bg-destructive/95 backdrop-blur-sm text-xs sm:text-sm"
              >
                <PhoneOff className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Calculadora Flutuante - Visível para todos */}
      {duel && (
        <FloatingCalculator
          player1Name={duel.creator?.username || 'Jogador 1'}
          player2Name={duel.opponent?.username || 'Aguardando...'}
          player1LP={player1LP}
          player2LP={player2LP}
          onUpdateLP={updateLP}
          onSetLP={setLP}
          currentUserPlayer={isPlayer1 ? 'player1' : isPlayer2 ? 'player2' : null}
        />
      )}

      {/* Chat Component */}
      {currentUser && (
        <DuelChat duelId={id!} currentUserId={currentUser.id} />
      )}
    </div>
  );
};

export default DuelRoom;
