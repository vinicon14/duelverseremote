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
  const [roomUrl, setRoomUrl] = useState<string>('');
  const callStartTime = useRef<number | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

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

  // Listener realtime para sincronizar LP entre usuários e atualização de opponent
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
        async (payload) => {
          console.log('Realtime update recebido:', payload.new);
          if (payload.new) {
            // Sempre atualizar LP quando receber update
            setPlayer1LP(payload.new.player1_lp || 8000);
            setPlayer2LP(payload.new.player2_lp || 8000);
            
            // Se opponent_id mudou, buscar dados completos com profiles
            if (payload.new.opponent_id && payload.new.opponent_id !== duel?.opponent_id) {
              console.log('Opponent mudou, buscando dados atualizados');
              const { data: updatedDuel } = await supabase
                .from('live_duels')
                .select(`
                  *,
                  creator:profiles!live_duels_creator_id_fkey(username, avatar_url, user_id),
                  opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url, user_id)
                `)
                .eq('id', id)
                .maybeSingle();
              
              if (updatedDuel) {
                console.log('Dados atualizados do duelo:', updatedDuel);
                setDuel(updatedDuel);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, duel?.opponent_id]);

  const startCallTimer = (startedAt: string) => {
    callStartTime.current = new Date(startedAt).getTime();
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
          creator:profiles!live_duels_creator_id_fkey(username, avatar_url, user_id),
          opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url, user_id)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        console.log('[DuelRoom] Duelo não encontrado');
        toast({
          title: "Duelo não encontrado",
          description: "Este duelo não existe ou foi removido.",
          variant: "destructive",
        });
        navigate('/duels');
        return;
      }
      
      console.log('[DuelRoom] Duelo carregado:', {
        id: data.id,
        creator_id: data.creator_id,
        opponent_id: data.opponent_id,
        status: data.status
      });

      const { data: { session } } = await supabase.auth.getSession();
      console.log('[DuelRoom] Current user:', session?.user?.id);
      
      // Se está aguardando opponent E o usuário é o criador, redirecionar de volta
      if (session?.user && session.user.id === data.creator_id && !data.opponent_id) {
        console.log('[DuelRoom] Criador aguardando opponent, redirecionando para /duels');
        toast({
          title: "Aguardando oponente",
          description: "Você será redirecionado automaticamente quando alguém entrar.",
        });
        navigate('/duels');
        return;
      }

      // Se a sala já tem 2 jogadores completos e o usuário atual não é participante, bloquear
      if (session?.user && data.opponent_id && 
          data.creator_id !== session.user.id && 
          data.opponent_id !== session.user.id) {
        console.log('[DuelRoom] Acesso negado - sala completa e usuário não é participante');
        toast({
          title: "Acesso negado",
          description: "Esta sala já está completa com 2 jogadores.",
          variant: "destructive",
        });
        navigate('/duels');
        return;
      }

      console.log('[DuelRoom] Acesso permitido, carregando sala');
      setDuel(data);
      setPlayer1LP(data.player1_lp || 8000);
      setPlayer2LP(data.player2_lp || 8000);

      // Criar sala Daily.co somente se ambos players estiverem presentes
      if (data.opponent_id && data.creator_id) {
        console.log('[DuelRoom] Ambos jogadores presentes, criando sala Daily.co');
        const { data: roomData, error: roomError } = await supabase.functions.invoke('create-daily-room', {
          body: { roomName: `duelverse-${id}` }
        });

        console.log('Daily.co response:', { roomData, roomError });

        if (roomError || !roomData?.url) {
          console.error('Erro ao criar sala:', roomError);
          toast({
            title: "Erro ao iniciar videochamada",
            description: "Não foi possível criar a sala de vídeo.",
            variant: "destructive",
          });
        } else {
          console.log('Setting room URL:', roomData.url);
          setRoomUrl(roomData.url);
        }
      } else {
        console.log('[DuelRoom] Aguardando segundo jogador para criar sala Daily.co');
      }

      // Garantir que started_at existe (criar se não existir)
      let startedAt = data.started_at;
      if (!startedAt && data.opponent_id) {
        console.log('[DuelRoom] Definindo started_at');
        const now = new Date().toISOString();
        await supabase
          .from('live_duels')
          .update({ 
            started_at: now,
            status: 'in_progress'
          })
          .eq('id', id);
        startedAt = now;
      }

      // Iniciar timer baseado no started_at do banco
      if (startedAt) {
        startCallTimer(startedAt);

        // Verificar se já passou 60 minutos
        const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
        if (elapsed >= 3600) {
          console.log('[DuelRoom] Tempo esgotado (60 minutos)');
          await endDuel();
        }
      }
    } catch (error: any) {
      console.error('[DuelRoom] Error in fetchDuel:', error);
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

      // Registrar histórico se houver vencedor usando função segura
      if (winnerId && duel?.id) {
        try {
          const { error: matchError } = await supabase.rpc('record_match_result', {
            p_duel_id: duel.id,
            p_player1_id: duel.creator_id,
            p_player2_id: duel.opponent_id,
            p_winner_id: winnerId,
            p_player1_score: winnerId === duel.opponent_id ? 0 : player1LP,
            p_player2_score: winnerId === duel.creator_id ? 0 : player2LP,
            p_bet_amount: duel.bet_amount || 0
          });

          if (matchError) {
            console.error('Erro ao registrar resultado:', matchError);
            toast({
              title: "Erro ao registrar resultado",
              description: matchError.message,
              variant: "destructive",
            });
          }
        } catch (error: any) {
          console.error('Erro ao registrar resultado:', error);
          toast({
            title: "Erro ao registrar resultado",
            description: error.message,
            variant: "destructive",
          });
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

  // Ambos participantes têm controle total
  const isParticipant = currentUser?.id === duel?.creator_id || currentUser?.id === duel?.opponent_id;
  const isPlayer1 = currentUser?.id === duel?.creator_id;
  const isPlayer2 = currentUser?.id === duel?.opponent_id;

  console.log('Control Status:', { 
    currentUserId: currentUser?.id, 
    creatorId: duel?.creator_id, 
    opponentId: duel?.opponent_id,
    creatorName: duel?.creator?.username,
    opponentName: duel?.opponent?.username,
    isPlayer1, 
    isPlayer2,
    isParticipant
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="px-2 sm:px-4 pt-16 sm:pt-20 pb-2 sm:pb-4">
        <div className="h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] relative">
          {/* Video Call - Daily.co */}
          <div className="h-full w-full rounded-lg overflow-hidden bg-card shadow-2xl border border-primary/20">
            {roomUrl ? (
              <iframe
                src={roomUrl}
                allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
                className="w-full h-full"
                title="Daily.co Video Call"
                onLoad={() => console.log('Iframe loaded')}
                onError={(e) => console.error('Iframe error:', e)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-muted-foreground mb-2">Carregando sala de vídeo...</p>
                  <p className="text-xs text-muted-foreground">ID: {id}</p>
                </div>
              </div>
            )}
          </div>

          {/* Botão de Sair e Timer - Fixo no canto superior direito */}
          <div className="absolute top-2 sm:top-4 right-2 sm:right-4 z-50 flex flex-col sm:flex-row gap-2 items-end sm:items-center">
            {/* Badge de Tipo de Partida */}
            {duel && (
              <div className={`px-2 sm:px-3 py-1 sm:py-2 rounded-lg backdrop-blur-sm text-xs sm:text-sm font-bold ${
                duel.is_ranked 
                  ? 'bg-yellow-500/95 text-black' 
                  : 'bg-blue-500/95 text-white'
              }`}>
                {duel.is_ranked ? '🏆 Ranqueada' : '🎮 Casual'}
              </div>
            )}
            
            {/* Timer Display - Contagem Regressiva */}
            <div className={`px-2 sm:px-4 py-1 sm:py-2 rounded-lg backdrop-blur-sm font-mono text-xs sm:text-sm font-bold ${
              callDuration <= 300 ? 'bg-destructive/95 text-destructive-foreground animate-pulse' : 
              callDuration <= 600 ? 'bg-yellow-500/95 text-black' : 
              'bg-card/95'
            }`}>
              ⏱️ {formatTime(callDuration)}
            </div>
            
            <div className="flex gap-2">
              {isParticipant && (
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

      {/* Calculadora Flutuante - Ambos participantes podem controlar */}
      {duel && currentUser && (
        <FloatingCalculator
          player1Name={duel.creator?.username || 'Jogador 1'}
          player2Name={duel.opponent?.username || (duel.opponent_id ? 'Carregando...' : 'Aguardando...')}
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
