import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { PhoneOff, Loader2, Scale, Layers } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DuelChat } from "@/components/DuelChat";
import { FloatingCalculator } from "@/components/FloatingCalculator";
import { RecordMatchButton } from "@/components/RecordMatchButton";
import { HideElementsButton } from "@/components/HideElementsButton";
import { useBanCheck } from "@/hooks/useBanCheck";
import { DuelDeckViewer } from "@/components/duel/DuelDeckViewer";
import { FloatingOpponentViewer } from "@/components/duel/FloatingOpponentViewer";
import { useDuelDeck } from "@/hooks/useDuelDeck";
import { useDuelPresence, useDuelCleanup } from "@/hooks/useDuelPresence";

const DuelRoom = () => {
  useBanCheck(); // Proteger contra usuários banidos
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [duel, setDuel] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [player1LP, setPlayer1LP] = useState(8000);
  const [player2LP, setPlayer2LP] = useState(8000);
  const [callDuration, setCallDuration] = useState(0);
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [roomUrl, setRoomUrl] = useState<string>('');
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [judgeCalled, setJudgeCalled] = useState(false);
  const [elementsHidden, setElementsHidden] = useState(false);
  const isTimerPausedRef = useRef(false);
  const callStartTime = useRef<number | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const pausedTime = useRef<number>(0);
  const lastPauseTime = useRef<number>(0);
  
  const isJudge = searchParams.get('role') === 'judge';
  const [hideControls, setHideControls] = useState(true);
  
  // Deck viewer state
  const [showDeckViewer, setShowDeckViewer] = useState(false);
  const { mainDeck, extraDeck, sideDeck, tokensDeck, importDeckFromYDK, loadDeckFromSaved, isLoading: isDeckLoading } = useDuelDeck();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega dados do duelo e inicia timer
  useEffect(() => {
    const init = async () => {
      const user = await checkAuth();
      if (user) {
        setCurrentUser(user);
        await fetchDuel(user.id);

        // Tentar carregar deck do localStorage (salvo no DeckBuilder)
        try {
          const savedDeckData = localStorage.getItem('currentDeckForDuel');
          if (savedDeckData) {
            const deckData = JSON.parse(savedDeckData);
            loadDeckFromSaved(
              deckData.main || [],
              deckData.extra || [],
              deckData.tokens || [],
              deckData.side || []
            );
          } else {
            // Fallback: tentar carregar o último deck salvo do usuário no Supabase
            try {
              const { data: saved, error } = await supabase
                .from('saved_decks')
                .select('*')
                .eq('user_id', user.id)
                .order('updated_at', { ascending: false })
                .limit(1);

              if (!error && saved && saved.length > 0) {
                const deck = saved[0] as any;
                loadDeckFromSaved(
                  deck.main_deck || [],
                  deck.extra_deck || [],
                  deck.tokens_deck || [],
                  deck.side_deck || []
                );
              }
            } catch (err) {
              console.error('Erro ao buscar deck salvo do usuário:', err);
            }
          }
        } catch (error) {
          console.error('Erro ao carregar deck do localStorage:', error);
        }
      }
    };
    
    init();

    return () => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
    };
  }, [id, loadDeckFromSaved]);

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
            
            // Atualizar estado de pausa do timer
            if (payload.new.is_timer_paused !== undefined) {
              const wasPaused = isTimerPausedRef.current;
              const nowPaused = payload.new.is_timer_paused;
              
              setIsTimerPaused(nowPaused);
              isTimerPausedRef.current = nowPaused;
              
              // Se acabou de pausar, registrar o momento
              if (!wasPaused && nowPaused) {
                lastPauseTime.current = Date.now();
              }
              // Se acabou de despausar, acumular tempo pausado
              else if (wasPaused && !nowPaused) {
                pausedTime.current += Date.now() - lastPauseTime.current;
              }
            }
            
            // SEMPRE atualizar countdown quando remaining_seconds mudar (para sincronizar todos os players)
            if (payload.new.remaining_seconds !== undefined) {
              const durationMins = payload.new.duration_minutes || 50;
              const maxSeconds = durationMins * 60;
              // Validar valor recebido
              const validRemaining = Math.min(Math.max(0, payload.new.remaining_seconds), maxSeconds);
              console.log('🔴 [REALTIME] Atualizando countdown para:', validRemaining);
              setCallDuration(validRemaining);
            }
            
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

  const startCallTimer = (startedAt: string, durationMinutes: number = 50, remainingSecs?: number) => {
    const startTime = new Date(startedAt).getTime();
    callStartTime.current = startTime;
    const MAX_DURATION = durationMinutes * 60;
    
    // Validar e definir remaining_seconds inicial
    if (remainingSecs !== undefined) {
      // Proteger contra valores corrompidos - o tempo restante não pode ser maior que a duração máxima
      const validRemaining = Math.min(Math.max(0, remainingSecs), MAX_DURATION);
      setCallDuration(validRemaining);
      
      // Se o valor estava corrompido, resetar no banco
      if (remainingSecs > MAX_DURATION || remainingSecs < 0) {
        console.warn('⚠️ Timer corrompido detectado. Resetando...', { remainingSecs, MAX_DURATION });
        supabase
          .from('live_duels')
          .update({ remaining_seconds: validRemaining })
          .eq('id', id)
          .then(() => console.log('✅ Timer resetado com sucesso'));
      }
    }
    
    // Limpar intervalo anterior se existir
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    
    const isCreator = currentUser?.id === duel?.creator_id;
    let lastDbUpdate = 0;
    
    // Todos os participantes rodam o timer localmente para evitar travamentos
    timerInterval.current = setInterval(() => {
      if (isTimerPausedRef.current) return;

      const now = Date.now();
      const elapsedRaw = Math.floor((now - startTime - pausedTime.current) / 1000);
      const remaining = Math.max(0, MAX_DURATION - elapsedRaw);
      
      // Atualizar UI local
      setCallDuration(remaining);
      
      // Apenas o criador atualiza o banco a cada 3 segundos (reduz carga)
      if (isCreator && now - lastDbUpdate > 3000) {
        lastDbUpdate = now;
        supabase
          .from('live_duels')
          .update({ remaining_seconds: remaining })
          .eq('id', id)
          .then(() => {});
      }

      // Aviso quando restar 5 minutos (300 segundos)
      if (remaining === 300 && !showTimeWarning) {
        setShowTimeWarning(true);
        toast({
          title: "⏰ Atenção: Tempo de chamada",
          description: "Restam apenas 5 minutos. A chamada será encerrada automaticamente em 0:00.",
          duration: 10000,
        });
      }

      // Tempo chegou a zero - apenas mostrar aviso, NÃO finalizar automaticamente
      if (remaining === 0) {
        if (!showTimeWarning) {
          setShowTimeWarning(true);
          toast({
            title: "⏱️ Tempo de partida esgotado",
            description: "O tempo acabou! A partida continua até ser finalizada manualmente.",
            duration: 5000,
          });
        }
        // Não finaliza automaticamente - apenas quando clicar no botão Finalizar
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
        // Sala já tem opponent
        // Se o usuário não é participante, permitir como espectador
        if (!isCreator && !isOpponent) {
          console.log('[DuelRoom] Usuário entrando como espectador');
          toast({
            title: "👁️ Modo Espectador",
            description: "Você está assistindo esta partida.",
          });
        }
      }

      setDuel(data);
      setPlayer1LP(data.player1_lp || 8000);
      setPlayer2LP(data.player2_lp || 8000);
      const isPaused = data.is_timer_paused || false;
      setIsTimerPaused(isPaused);
      isTimerPausedRef.current = isPaused;

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
        const durationMins = data.duration_minutes || 50;
        const maxDurationSeconds = durationMins * 60;
        
        // Verificar se já passou o tempo - apenas iniciar timer, NÃO finalizar
        // A partida só termina quando os jogadores clicarem em "Finalizar"
        
        // Validar remaining_seconds do banco - não pode exceder a duração máxima
        let remainingSecs = data.remaining_seconds !== null ? data.remaining_seconds : Math.max(0, maxDurationSeconds - elapsed);
        
        // Proteger contra valores corrompidos
        if (remainingSecs > maxDurationSeconds || remainingSecs < 0) {
          console.warn('⚠️ Valor corrompido no banco. Recalculando...', { remainingSecs, maxDurationSeconds });
          remainingSecs = Math.max(0, maxDurationSeconds - elapsed);
        }
        
        startCallTimer(startedAt, durationMins, remainingSecs);
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

    try {
      const updateData = { [player + '_lp']: newLP };
      
      const { error } = await supabase
        .from('live_duels')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    } catch (error: any) {
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
    
    try {
      const updateData = { [player + '_lp']: newLP };
      
      const { error } = await supabase
        .from('live_duels')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
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

      // Determinar vencedor baseado nos Life Points se não foi especificado
      let finalWinnerId = winnerId;
      if (!finalWinnerId && duel?.creator_id && duel?.opponent_id) {
        if (player1LP > player2LP) {
          finalWinnerId = duel.creator_id;
        } else if (player2LP > player1LP) {
          finalWinnerId = duel.opponent_id;
        }
        // Se empate (player1LP === player2LP), finalWinnerId fica undefined (empate)
      }

      // Atualizar status do duelo
      await supabase
        .from('live_duels')
        .update({
          status: 'finished',
          finished_at: new Date().toISOString(),
          winner_id: finalWinnerId,
        })
        .eq('id', id);

      // Código de encerramento de stream removido (sistema de lives foi desativado)

      // SEMPRE registrar histórico se houver ambos os jogadores (mesmo empate)
      if (duel?.id && duel?.creator_id && duel?.opponent_id) {
        try {
          const { error: matchError } = await supabase.rpc('record_match_result', {
            p_duel_id: duel.id,
            p_player1_id: duel.creator_id,
            p_player2_id: duel.opponent_id,
            p_winner_id: finalWinnerId || null, // Aceita null para empates
            p_player1_score: player1LP,
            p_player2_score: player2LP,
            p_bet_amount: duel.bet_amount || 0
          });

          if (matchError) {
            console.error('Erro ao registrar resultado:', matchError);
            toast({
              title: "Erro ao registrar resultado",
              description: matchError.message,
              variant: "destructive",
            });
          } else {
            const resultMsg = finalWinnerId 
              ? "A partida foi contabilizada com sucesso" 
              : "Empate registrado no histórico";
            toast({
              title: "Resultado registrado!",
              description: resultMsg,
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
      } else if (!duel?.opponent_id) {
        toast({
          title: "Partida não contabilizada",
          description: "É necessário dois jogadores para registrar o resultado",
          variant: "destructive",
        });
      }

      // Deletar o duelo após 1 minuto
      setTimeout(async () => {
        await supabase
          .from('live_duels')
          .delete()
          .eq('id', id);
      }, 60000);

      const winnerName = finalWinnerId === duel?.creator_id 
        ? duel?.creator?.username 
        : finalWinnerId === duel?.opponent_id 
        ? duel?.opponent?.username 
        : null;

      toast({
        title: "Duelo finalizado!",
        description: finalWinnerId 
          ? `🏆 Vencedor: ${winnerName} (${finalWinnerId === duel?.creator_id ? player1LP : player2LP} LP)` 
          : player1LP === player2LP 
          ? "⚖️ Empate!" 
          : "Duelo encerrado",
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

  const handleLeave = async () => {
    if (!id || !currentUser) {
      navigate('/duels');
      return;
    }

    try {
      const isCreator = currentUser.id === duel?.creator_id;
      const isOpponent = currentUser.id === duel?.opponent_id;
      const isSpectator = !isCreator && !isOpponent;

      // Se for espectador, apenas sair (não encerrar partida)
      if (isSpectator) {
        console.log('[DuelRoom] Espectador saindo, partida continua');
        navigate('/duels');
        return;
      }

      // Se for o criador, deletar a sala
      if (isCreator) {
        await supabase
          .from('live_duels')
          .delete()
          .eq('id', id);
        
        toast({
          title: "Sala encerrada",
          description: "Você saiu e a sala foi removida",
        });
      } 
      // Se for o oponente, remover ele da sala
      else if (isOpponent) {
        await supabase
          .from('live_duels')
          .update({ 
            opponent_id: null,
            status: 'waiting'
          })
          .eq('id', id);
        
        toast({
          title: "Você saiu do duelo",
          description: "A sala voltou para modo de espera",
        });
      }

      navigate('/duels');
    } catch (error: any) {
      console.error('Erro ao sair:', error);
      toast({
        title: "Erro ao sair",
        description: error.message,
        variant: "destructive",
      });
      navigate('/duels');
    }
  };

  const toggleTimerPause = async () => {
    if (!id || !duel) return;
    
    // Apenas participantes podem pausar/despausar
    const isParticipant = currentUser?.id === duel.creator_id || currentUser?.id === duel.opponent_id;
    if (!isParticipant) return;

    const newPauseState = !isTimerPaused;
    
    try {
      const { error } = await supabase
        .from('live_duels')
        .update({ 
          is_timer_paused: newPauseState,
          remaining_seconds: callDuration 
        })
        .eq('id', id);

      if (error) throw error;

      setIsTimerPaused(newPauseState);
      isTimerPausedRef.current = newPauseState;
      
      // Registrar tempo de pausa/despausa
      if (newPauseState) {
        lastPauseTime.current = Date.now();
      } else {
        pausedTime.current += Date.now() - lastPauseTime.current;
      }
      
      toast({
        title: newPauseState ? "⏸️ Timer pausado" : "▶️ Timer retomado",
        description: newPauseState ? "O tempo foi pausado para ambos os jogadores" : "O tempo foi retomado",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao pausar/despausar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const callJudge = async () => {
    if (!id || !currentUser || judgeCalled) return;

    try {
      const { error } = await supabase
        .from('judge_logs')
        .insert({
          match_id: id,
          player_id: currentUser.id
        });

      if (error) throw error;

      setJudgeCalled(true);
      toast({
        title: "⚖️ Juiz chamado!",
        description: "Um juiz será notificado e entrará na sala em breve",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao chamar juiz",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Verificar se já existe chamada de juiz para esta partida
  useEffect(() => {
    if (!id || !currentUser) return;

    const checkJudgeCall = async () => {
      const { data } = await supabase
        .from('judge_logs')
        .select('*')
        .eq('match_id', id)
        .in('status', ['pending', 'in_room'])
        .maybeSingle();

      if (data) {
        setJudgeCalled(true);
      }
    };

    checkJudgeCall();

    // Realtime para chamadas de juiz
    const channel = supabase
      .channel(`judge-calls-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'judge_logs',
          filter: `match_id=eq.${id}`
        },
        (payload) => {
          if (payload.new && (payload.new as any).status !== 'resolved') {
            setJudgeCalled(true);
          } else if ((payload.new as any)?.status === 'resolved') {
            setJudgeCalled(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, currentUser]);

  // Identificar quem é cada player
  const isPlayer1 = currentUser?.id === duel?.creator_id;
  const isPlayer2 = currentUser?.id === duel?.opponent_id;
  const isParticipant = isPlayer1 || isPlayer2;
  const isSpectator = currentUser && !isParticipant;
  
  // Determinar o player atual de forma clara
  const currentUserPlayer: 'player1' | 'player2' | null = isPlayer1 ? 'player1' : (isPlayer2 ? 'player2' : null);

  // Hook para gerenciar presença e detecção de desconexão
  useDuelPresence(id, currentUser?.id, isParticipant);
  
  // Hook para limpeza automática de salas vazias
  useDuelCleanup(id);

  return (
    <div className="min-h-screen bg-background">
      {!hideControls && <Navbar />}
      
      <main className="px-2 sm:px-4 pt-16 sm:pt-20 pb-2 sm:pb-4">
        <div className="h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] relative">
          {/* Video Call - Daily.co - SEMPRE VISÍVEL */}
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
            {!hideControls && (
              <>
                {/* Badge de juiz */}
                {isJudge && (
                  <div className="px-2 sm:px-3 py-1 sm:py-2 rounded-lg backdrop-blur-sm text-xs sm:text-sm font-bold bg-purple-500/95 text-white flex items-center gap-1">
                    <Scale className="w-3 h-3 sm:w-4 sm:h-4" />
                    Juiz
                  </div>
                )}

                {/* Badge de modo espectador */}
                {isSpectator && !isJudge && (
                  <div className="px-2 sm:px-3 py-1 sm:py-2 rounded-lg backdrop-blur-sm text-xs sm:text-sm font-bold bg-purple-500/95 text-white">
                    👁️ Espectador
                  </div>
                )}

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
                } ${isTimerPaused ? 'opacity-60' : ''}`}>
                  {isTimerPaused ? '⏸️' : '⏱️'} {formatTime(callDuration)}
                </div>
              </>
            )}
            
            <div className="flex gap-1 sm:gap-2">
              {/* O botão de Ocultar e Gravar ficam sempre visíveis para participantes */}
              {isParticipant && !isJudge && (
                <>
                  <HideElementsButton onToggle={() => setHideControls(!hideControls)} isHidden={hideControls} />
                  <RecordMatchButton duelId={id!} />
                </>
              )}

              {/* Todos os outros botões são controlados por `hideControls` */}
              {!hideControls && (
                <>
                  {isParticipant && !isJudge && (
                    <>
                      {/* Botão do Deck */}
                      <Button
                        onClick={() => setShowDeckViewer(!showDeckViewer)}
                        variant="outline"
                        size="sm"
                        className="bg-amber-600/95 hover:bg-amber-700 text-white backdrop-blur-sm text-xs sm:text-sm"
                        title="Abrir Deck"
                      >
                        <Layers className="w-3 h-3 sm:w-4 sm:h-4" />
                      </Button>
                      <Button
                        onClick={callJudge}
                        disabled={judgeCalled}
                        variant="outline"
                        size="sm"
                        className="bg-purple-600/95 hover:bg-purple-700 text-white backdrop-blur-sm text-xs sm:text-sm"
                        title="Chamar Juiz"
                      >
                        <Scale className="w-3 h-3 sm:w-4 sm:h-4" />
                        {judgeCalled && <span className="ml-1 hidden sm:inline">✓</span>}
                      </Button>
                      <Button
                        onClick={toggleTimerPause}
                        variant="outline"
                        size="sm"
                        className="bg-card/95 backdrop-blur-sm text-xs sm:text-sm"
                        title={isTimerPaused ? "Retomar timer" : "Pausar timer"}
                      >
                        {isTimerPaused ? '▶️' : '⏸️'}
                      </Button>
                      <Button
                        onClick={() => endDuel()}
                        variant="outline"
                        size="sm"
                        className="bg-green-600/95 hover:bg-green-700 text-white backdrop-blur-sm text-xs sm:text-sm"
                        title="Finalizar partida"
                      >
                        <span className="hidden sm:inline">Finalizar</span>
                        <span className="sm:hidden">Fim</span>
                      </Button>
                    </>
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
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Calculadora Flutuante - Apenas participantes podem editar */}
      {duel && currentUser && (
        <FloatingCalculator
          player1Name={duel.creator?.username || 'Player 1'}
          player2Name={duel.opponent?.username || 'Player 2'}
          player1LP={player1LP}
          player2LP={player2LP}
          onUpdateLP={updateLP}
          onSetLP={setLP}
          currentUserPlayer={isSpectator ? null : currentUserPlayer}
        />
      )}

      {/* Deck Viewer Component */}
      {isParticipant && !isJudge && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ydk"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                importDeckFromYDK(file);
              }
              e.target.value = '';
            }}
          />
          <DuelDeckViewer
            isOpen={showDeckViewer}
            onClose={() => setShowDeckViewer(false)}
            deck={mainDeck}
            extraDeck={extraDeck}
            sideDeck={sideDeck}
            onLoadDeck={() => fileInputRef.current?.click()}
            duelId={id}
            currentUserId={currentUser?.id}
            opponentUsername={
              currentUser?.id === duel?.creator_id 
                ? duel?.opponent?.username 
                : duel?.creator?.username
            }
          />
        </>
      )}

      {/* Floating Opponent Viewer - Always visible for participants */}
      {isParticipant && !isJudge && currentUser && id && duel && (
        <FloatingOpponentViewer
          duelId={id}
          currentUserId={currentUser.id}
          opponentUsername={
            currentUser.id === duel.creator_id 
              ? duel.opponent?.username 
              : duel.creator?.username
          }
        />
      )}

      {/* Chat Component */}
      {!hideControls && currentUser && (
        <DuelChat duelId={id!} currentUserId={currentUser.id} />
      )}
    </div>
  );
};

export default DuelRoom;
