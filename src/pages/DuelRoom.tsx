import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { PhoneOff, Loader2 } from "lucide-react";
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
    const init = async () => {
      const user = await checkAuth();
      if (user) {
        await fetchDuel(user.id);
      }
    };
    
    init();

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, [id]);

  // Listener realtime para sincronizar LP entre usuários e atualização de opponent
  useEffect(() => {
    if (!id || !currentUser) return;

    console.log('🔴 [REALTIME] Configurando listener para duel:', id);
    console.log('🔴 [REALTIME] User ID:', currentUser.id);

    const channel = supabase
      .channel(`duel-realtime-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_duels',
          filter: `id=eq.${id}`,
        },
        async (payload) => {
          console.log('🔴 [REALTIME] ===== UPDATE RECEBIDO =====');
          console.log('🔴 [REALTIME] NEW:', payload.new);
          console.log('🔴 [REALTIME] OLD:', payload.old);
          
          if (payload.new) {
            const newP1LP = payload.new.player1_lp ?? 8000;
            const newP2LP = payload.new.player2_lp ?? 8000;
            
            console.log('🔴 [REALTIME] Atualizando para:', { 
              player1_lp: newP1LP, 
              player2_lp: newP2LP 
            });
            
            setPlayer1LP(newP1LP);
            setPlayer2LP(newP2LP);
            
            // Se opponent_id foi atualizado, recarregar dados completos do duel
            if (payload.new.opponent_id && payload.old?.opponent_id !== payload.new.opponent_id) {
              console.log('🔴 [REALTIME] Opponent adicionado, recarregando dados do duel...');
              const { data: updatedDuel, error } = await supabase
                .from('live_duels')
                .select(`
                  *,
                  creator:profiles!live_duels_creator_id_fkey(username, avatar_url, user_id),
                  opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url, user_id)
                `)
                .eq('id', id)
                .maybeSingle();
              
              if (!error && updatedDuel) {
                console.log('🔴 [REALTIME] Duel atualizado com opponent:', updatedDuel);
                setDuel(updatedDuel);
              }
            }
            
            console.log('🔴 [REALTIME] ✅ Estados atualizados!');
          }
        }
      )
      .subscribe((status) => {
        console.log('🔴 [REALTIME] Status da subscrição:', status);
      });

    return () => {
      console.log('🔴 [REALTIME] Removendo canal');
      supabase.removeChannel(channel);
    };
  }, [id, currentUser]);

  const startCallTimer = (startedAt: string, durationMinutes: number = 60) => {
    const startTime = new Date(startedAt).getTime();
    callStartTime.current = startTime;
    const MAX_DURATION = durationMinutes * 60; // Converter minutos para segundos
    
    timerInterval.current = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
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
      return null;
    }
    setCurrentUser(session.user);
    return session.user;
  };

  const fetchDuel = async (userId: string) => {
    try {
      let { data, error } = await supabase
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
        toast({
          title: "Duelo não encontrado",
          description: "Este duelo não existe ou foi removido.",
          variant: "destructive",
        });
        navigate('/duels');
        return;
      }

      // Verificar se o usuário é participante
      const isCreator = data.creator_id === userId;
      const isOpponent = data.opponent_id === userId;

      // Se a sala não tem opponent ainda
      if (!data.opponent_id) {
        // Se o usuário NÃO é o criador, adicionar como opponent (player 2)
        if (!isCreator) {
          try {
            // NÃO sobrescrever started_at, apenas adicionar opponent
            const { error: updateError } = await supabase
              .from('live_duels')
              .update({
                opponent_id: userId,
                status: 'in_progress'
              })
              .eq('id', id)
              .is('opponent_id', null);

            if (updateError) {
              toast({
                title: "Erro ao entrar",
                description: "Não foi possível entrar nesta sala.",
                variant: "destructive",
              });
              navigate('/duels');
              return;
            }

            // Recarregar dados do duelo
            const { data: updatedData, error: reloadError } = await supabase
              .from('live_duels')
              .select(`
                *,
                creator:profiles!live_duels_creator_id_fkey(username, avatar_url, user_id),
                opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url, user_id)
              `)
              .eq('id', id)
              .maybeSingle();

            if (reloadError) {
              console.error('[DuelRoom] Erro ao recarregar:', reloadError);
            }

            if (updatedData) {
              data = updatedData;
            }
          } catch (error) {
            toast({
              title: "Erro ao entrar",
              description: "Ocorreu um erro ao tentar entrar na sala.",
              variant: "destructive",
            });
            navigate('/duels');
            return;
          }
        }
      } else {
        // Sala já tem opponent - verificar se o usuário é um dos participantes
        if (!isCreator && !isOpponent) {
          toast({
            title: "Acesso negado",
            description: "Esta sala já está completa.",
            variant: "destructive",
          });
          navigate('/duels');
          return;
        }
      }

      setDuel(data);
      setPlayer1LP(data.player1_lp || 8000);
      setPlayer2LP(data.player2_lp || 8000);

      // Criar sala Daily.co
      try {
        const { data: roomData, error: roomError } = await supabase.functions.invoke('create-daily-room', {
          body: { roomName: `duelverse-${id}` }
        });

        if (roomError || !roomData?.url) {
          toast({
            title: "Erro ao iniciar videochamada",
            description: "Não foi possível criar a sala de vídeo.",
            variant: "destructive",
          });
        } else {
          setRoomUrl(roomData.url);
        }
      } catch (error) {
        toast({
          title: "Erro ao iniciar videochamada",
          description: "Erro ao conectar com o servidor de vídeo.",
          variant: "destructive",
        });
      }

      // Garantir que started_at existe SEMPRE (timer inicia na criação)
      let startedAt = data.started_at;
      if (!startedAt) {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('live_duels')
          .update({ 
            started_at: now,
            status: data.opponent_id ? 'in_progress' : 'waiting'
          })
          .eq('id', id);
        
        if (!updateError) {
          startedAt = now;
        }
      }

      // Iniciar timer SEMPRE que houver started_at
      if (startedAt) {
        const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
        const durationMins = data.duration_minutes || 60;
        const maxDurationSeconds = durationMins * 60;
        
        // Verificar se já passou o tempo
        if (elapsed >= maxDurationSeconds) {
          await endDuel();
        } else {
          startCallTimer(startedAt, durationMins);
        }
      }
    } catch (error: any) {
      console.error('[DuelRoom] Erro em fetchDuel:', error);
      toast({
        title: "Erro ao carregar duelo",
        description: error.message,
        variant: "destructive",
      });
      navigate('/duels');
    }
  };

  const updateLP = async (player: 'player1' | 'player2', amount: number) => {
    if (!id) return;
    
    const isPlayer1 = player === 'player1';
    const currentLP = isPlayer1 ? player1LP : player2LP;
    const newLP = Math.max(0, currentLP + amount);

    console.log('💾 [UPDATE LP] ========================================');
    console.log('💾 [UPDATE LP] Player solicitado:', player);
    console.log('💾 [UPDATE LP] Amount:', amount);
    console.log('💾 [UPDATE LP] Current User ID:', currentUser?.id);
    console.log('💾 [UPDATE LP] Creator ID:', duel?.creator_id);
    console.log('💾 [UPDATE LP] Opponent ID:', duel?.opponent_id);
    console.log('💾 [UPDATE LP] Current LP:', currentLP);
    console.log('💾 [UPDATE LP] New LP:', newLP);
    console.log('💾 [UPDATE LP] Estado atual:', { player1LP, player2LP });

    try {
      // Atualizar APENAS o campo específico do jogador
      const updateData = { [player + '_lp']: newLP };
      console.log('💾 [UPDATE LP] Atualizando com:', updateData);
      
      const { error } = await supabase
        .from('live_duels')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('💾 [UPDATE LP] ❌ Erro no banco:', error);
        throw error;
      }

      console.log('💾 [UPDATE LP] ✅ Atualizado no banco!');
      console.log('💾 [UPDATE LP] ========================================');

      if (newLP === 0) {
        await endDuel(player === 'player1' ? duel?.opponent_id : duel?.creator_id);
      }
    } catch (error: any) {
      console.error('💾 [UPDATE LP] ❌ Erro:', error);
      toast({
        title: "Erro ao atualizar LP",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const setLP = async (player: 'player1' | 'player2', value: number) => {
    if (!id) return;
    
    const newLP = Math.max(0, value);
    
    console.log('💾 [SET LP] ========================================');
    console.log('💾 [SET LP] Player solicitado:', player);
    console.log('💾 [SET LP] New value:', newLP);
    console.log('💾 [SET LP] Current User ID:', currentUser?.id);
    console.log('💾 [SET LP] Creator ID:', duel?.creator_id);
    console.log('💾 [SET LP] Opponent ID:', duel?.opponent_id);
    console.log('💾 [SET LP] Estado atual:', { player1LP, player2LP });
    
    try {
      // Atualizar APENAS o campo específico do jogador
      const updateData = { [player + '_lp']: newLP };
      console.log('💾 [SET LP] Atualizando com:', updateData);
      
      const { error } = await supabase
        .from('live_duels')
        .update(updateData)
        .eq('id', id);

      if (error) {
        console.error('💾 [SET LP] ❌ Erro no banco:', error);
        throw error;
      }

      console.log('💾 [SET LP] ✅ Atualizado no banco!');
      console.log('💾 [SET LP] ========================================');

      if (newLP === 0) {
        await endDuel(player === 'player1' ? duel?.opponent_id : duel?.creator_id);
      }
    } catch (error: any) {
      console.error('💾 [SET LP] ❌ Erro:', error);
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

  // Identificar quem é cada player - LÓGICA CORRIGIDA
  const isPlayer1 = currentUser?.id === duel?.creator_id;
  // Player 2: É reconhecido como opponent OU como qualquer usuário que entrou e não é o criador
  const isPlayer2 = currentUser?.id === duel?.opponent_id || (currentUser?.id && !isPlayer1 && duel?.opponent_id);
  const isParticipant = isPlayer1 || isPlayer2;
  
  // Determinar o player atual de forma mais explícita
  let currentUserPlayer: 'player1' | 'player2' | null = null;
  if (isPlayer1) {
    currentUserPlayer = 'player1';
  } else if (duel?.opponent_id === currentUser?.id) {
    currentUserPlayer = 'player2';
  }
  
  // Debug logs detalhados
  useEffect(() => {
    console.log('🎮 [PLAYER IDENTIFICATION] ========================================');
    console.log('🎮 [PLAYER] Current User ID:', currentUser?.id);
    console.log('🎮 [PLAYER] Creator ID:', duel?.creator_id);
    console.log('🎮 [PLAYER] Opponent ID:', duel?.opponent_id);
    console.log('🎮 [PLAYER] isPlayer1:', isPlayer1);
    console.log('🎮 [PLAYER] isPlayer2:', isPlayer2);
    console.log('🎮 [PLAYER] currentUserPlayer:', currentUserPlayer);
    console.log('🎮 [PLAYER] isParticipant:', isParticipant);
    console.log('🎮 [PLAYER] =========================================================');
  }, [currentUser?.id, duel?.creator_id, duel?.opponent_id, isPlayer1, isPlayer2, currentUserPlayer, isParticipant]);

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
                <div className="text-center space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
                  <div>
                    <p className="text-muted-foreground mb-2">Carregando sala de vídeo...</p>
                    <p className="text-xs text-muted-foreground">ID: {id}</p>
                  </div>
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

      {/* Calculadora Flutuante - Cada participante controla apenas seu LP */}
      {duel && currentUser && (
        <FloatingCalculator
          player1Name={duel.creator?.username || 'Player 1'}
          player2Name={duel.opponent?.username || 'Player 2'}
          player1LP={player1LP}
          player2LP={player2LP}
          onUpdateLP={updateLP}
          onSetLP={setLP}
          currentUserPlayer={currentUserPlayer}
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
