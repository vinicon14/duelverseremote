/**
 * DuelVerse - Sala de Duelo
 * Desenvolvido por Vinícius
 * 
 * Interface principal de duelo.
 * Gerencia videochamada (Daily.co), LP, timer, chat e estado do duelo em tempo real.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { PhoneOff, Loader2, Scale, Layers, Sparkles, Zap, Clock, Coins } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Navbar } from "@/components/Navbar";
import { DuelChat } from "@/components/DuelChat";
import { FloatingCalculator } from "@/components/FloatingCalculator";
import { HideElementsButton } from "@/components/HideElementsButton";
import { useBanCheck } from "@/hooks/useBanCheck";
import { DuelDeckViewer } from "@/components/duel/DuelDeckViewer";
import { FloatingOpponentViewer } from "@/components/duel/FloatingOpponentViewer";
import { MagicDuelViewer } from "@/components/duel/MagicDuelViewer";
import { PokemonDuelViewer } from "@/components/duel/PokemonDuelViewer";
import { useDuelDeck } from "@/hooks/useDuelDeck";
import { useDuelPresence, useDuelCleanup } from "@/hooks/useDuelPresence";
import { useAiDuel } from "@/hooks/useAiDuel";
import { AiDeckSelectModal } from "@/components/duel/AiDeckSelectModal";
import { AiDuelChat } from "@/components/duel/AiDuelChat";

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
  const [player3LP, setPlayer3LP] = useState(8000);
  const [player4LP, setPlayer4LP] = useState(8000);
  const [customCounters, setCustomCounters] = useState<{ id: string; name: string; value: number }[]>([]);
  const [showMagicViewer, setShowMagicViewer] = useState(false);
  const [showPokemonViewer, setShowPokemonViewer] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [roomUrl, setRoomUrl] = useState<string>('');
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [judgeCalled, setJudgeCalled] = useState(false);
  const [elementsHidden, setElementsHidden] = useState(false);
  const isTimerPausedRef = useRef(false);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerInitialized = useRef(false);
  const timeEndedShownRef = useRef(false);
  const timeWarningShownRef = useRef(false);
  const callDurationRef = useRef<number>(0);
  
  const isJudge = searchParams.get('role') === 'judge';
  const [hideControls, setHideControls] = useState(true);
  const [judgeTimerSeconds, setJudgeTimerSeconds] = useState<number | null>(null);
  const [judgeRewarded, setJudgeRewarded] = useState(false);
  const judgeLogIdRef = useRef<string | null>(null);
  const judgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const judgeRewardProcessingRef = useRef(false);
  
  // Deck viewer state
  const [showDeckViewer, setShowDeckViewer] = useState(false);
  const { mainDeck, extraDeck, sideDeck, tokensDeck, importDeckFromYDK, loadDeckFromSaved, isLoading: isDeckLoading } = useDuelDeck();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Solo Mode
  const aiDuel = useAiDuel();
  const [showAiDeckModal, setShowAiDeckModal] = useState(false);

  // Judge reward timer - fetch judge_log and countdown
  const handleJudgeReward = useCallback(async (logId: string) => {
    if (judgeRewardProcessingRef.current || judgeRewarded) return;
    judgeRewardProcessingRef.current = true;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        judgeRewardProcessingRef.current = false;
        return;
      }

      // Try with a small delay to ensure server-side time has passed
      await new Promise(resolve => setTimeout(resolve, 3000));

      const { data: rewarded, error } = await supabase.rpc('reward_judge_resolution', {
        p_judge_id: user.id,
        p_log_id: logId
      });

      console.log('Judge reward result:', { rewarded, error, logId });

      if (error) {
        console.error('Judge reward RPC error:', error);
        judgeRewardProcessingRef.current = false;
        toast({ title: "Erro na recompensa", description: error.message, variant: "destructive" });
        return;
      }

      if (rewarded) {
        await supabase.from('judge_logs').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', logId);
        setJudgeRewarded(true);
        judgeRewardProcessingRef.current = false;
        toast({ title: "✅ +2 DuelCoins!", description: "Recompensa recebida por permanecer 2 minutos na chamada" });
      } else {
        // Retry once more after 5s
        setTimeout(async () => {
          try {
            const { data: retryResult, error: retryError } = await supabase.rpc('reward_judge_resolution', {
              p_judge_id: user.id,
              p_log_id: logId
            });

            if (retryError) {
              console.error('Judge reward retry error:', retryError);
              toast({ title: "Erro na recompensa", description: retryError.message, variant: "destructive" });
              judgeRewardProcessingRef.current = false;
              return;
            }

            if (retryResult) {
              await supabase.from('judge_logs').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', logId);
              setJudgeRewarded(true);
              toast({ title: "✅ +2 DuelCoins!", description: "Recompensa recebida por permanecer 2 minutos na chamada" });
            }
          } finally {
            judgeRewardProcessingRef.current = false;
          }
        }, 5000);
      }
    } catch (e) {
      console.error('Judge reward error:', e);
      judgeRewardProcessingRef.current = false;
    }
  }, [judgeRewarded, toast]);

  useEffect(() => {
    if (!isJudge || !id || !currentUser) return;

    const fetchJudgeLog = async () => {
      const { data } = await supabase
        .from('judge_logs')
        .select('id, judge_entered_at, status')
        .eq('match_id', id)
        .eq('judge_id', currentUser.id)
        .eq('status', 'in_room')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.judge_entered_at) {
        judgeLogIdRef.current = data.id;
        const elapsed = Math.floor((Date.now() - new Date(data.judge_entered_at).getTime()) / 1000);
        const remaining = Math.max(0, 120 - elapsed);
        setJudgeTimerSeconds(remaining);

        if (remaining <= 0) {
          handleJudgeReward(data.id);
          return;
        }

        judgeTimerRef.current = setInterval(() => {
          setJudgeTimerSeconds(prev => {
            if (prev === null || prev <= 1) {
              if (judgeTimerRef.current) clearInterval(judgeTimerRef.current);
              if (judgeLogIdRef.current) handleJudgeReward(judgeLogIdRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    };

    fetchJudgeLog();
    return () => { if (judgeTimerRef.current) clearInterval(judgeTimerRef.current); };
  }, [isJudge, id, currentUser, handleJudgeReward]);

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
            // Filtra pelo tcg_type do duelo para garantir que só decks compatíveis sejam carregados
            try {
              const duelData = await supabase
                .from('live_duels')
                .select('tcg_type')
                .eq('id', id)
                .maybeSingle();
              const duelTcgType = duelData?.data?.tcg_type || 'yugioh';
              
              const { data: saved, error } = await supabase
                .from('saved_decks')
                .select('*')
                .eq('user_id', user.id)
                .eq('tcg_type', duelTcgType)
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
          
          if (payload.new) {
            const defaultLP = payload.new.tcg_type === 'magic' ? 40 : payload.new.tcg_type === 'pokemon' ? 6 : 8000;
            const newP1LP = payload.new.player1_lp ?? defaultLP;
            const newP2LP = payload.new.player2_lp ?? defaultLP;
            const newP3LP = (payload.new as any).player3_lp ?? defaultLP;
            const newP4LP = (payload.new as any).player4_lp ?? defaultLP;
            
            setPlayer1LP(newP1LP);
            setPlayer2LP(newP2LP);
            setPlayer3LP(newP3LP);
            setPlayer4LP(newP4LP);
            
            // Sync custom counters
            if ((payload.new as any).custom_counters) {
              try {
                const counters = typeof (payload.new as any).custom_counters === 'string' 
                  ? JSON.parse((payload.new as any).custom_counters) 
                  : (payload.new as any).custom_counters;
                if (Array.isArray(counters)) setCustomCounters(counters);
              } catch {}
            }
            
            // Atualizar estado de pausa do timer
            if (payload.new.is_timer_paused !== undefined) {
              setIsTimerPaused(payload.new.is_timer_paused);
              isTimerPausedRef.current = payload.new.is_timer_paused;
            }
            
            // Sincronizar countdown apenas se o timer não iniciou ainda ou se a diferença for grande
            if (payload.new.remaining_seconds !== undefined && payload.new.remaining_seconds !== null) {
              const durationMins = payload.new.duration_minutes || 50;
              const maxSeconds = durationMins * 60;
              const validRemaining = Math.min(Math.max(0, payload.new.remaining_seconds), maxSeconds);
              
              // Só sincronizar se o timer ainda não iniciou ou se a diferença for > 2 segundos
              // Isso evita que o realtime sobrescreva a contagem regressiva local
              const diff = Math.abs(validRemaining - callDurationRef.current);
              if (!timerInitialized.current || diff > 2) {
                console.log('🔴 [REALTIME] Sincronizando countdown para:', validRemaining);
                setCallDuration(validRemaining);
                callDurationRef.current = validRemaining;
              }
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

  const startCallTimer = (durationMinutes: number = 50, initialRemaining: number, isPaused: boolean = false, isCreatorUser: boolean = false) => {
    // Evitar iniciar timer múltiplas vezes
    if (timerInitialized.current) {
      console.log('⚠️ Timer já inicializado, ignorando...');
      return;
    }
    timerInitialized.current = true;
    
    const MAX_DURATION = durationMinutes * 60;
    
    // Usar remaining_seconds do banco como ponto de partida
    const startValue = Math.min(Math.max(0, initialRemaining), MAX_DURATION);
    
    setCallDuration(startValue);
    callDurationRef.current = startValue;
    
    // Resetar flags de aviso
    timeEndedShownRef.current = startValue <= 0;
    timeWarningShownRef.current = startValue <= 300;
    
    // Limpar intervalo anterior se existir
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }
    
    let lastDbUpdate = 0;
    
    // Timer simples: decrementa 1 segundo por tick usando o ref como fonte de verdade
    timerInterval.current = setInterval(() => {
      if (isTimerPausedRef.current) return;

      const currentVal = callDurationRef.current;
      
      if (currentVal <= 0) {
        // Mostrar aviso apenas uma vez
        if (!timeEndedShownRef.current) {
          timeEndedShownRef.current = true;
          toast({
            title: "⏱️ Tempo de partida esgotado",
            description: "O tempo acabou! A partida continua até ser finalizada manualmente.",
            duration: 5000,
          });
        }
        return; // Não decrementar abaixo de 0
      }

      const newRemaining = currentVal - 1;
      callDurationRef.current = newRemaining;
      setCallDuration(newRemaining);
      
      // Aviso quando restar 5 minutos (300 segundos)
      if (newRemaining <= 300 && !timeWarningShownRef.current) {
        timeWarningShownRef.current = true;
        toast({
          title: "⏰ Atenção: Tempo de chamada",
          description: "Restam apenas 5 minutos!",
          duration: 10000,
        });
      }

      // Apenas o criador atualiza o banco a cada 5 segundos
      const now = Date.now();
      if (isCreatorUser && now - lastDbUpdate > 5000) {
        lastDbUpdate = now;
        supabase
          .from('live_duels')
          .update({ remaining_seconds: newRemaining })
          .eq('id', id)
          .then(() => {});
      }
    }, 1000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDailyRoomUrl = (duelId: string) => `https://duelverse.daily.co/duelverse-${duelId}`;


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

      const isCreator = data.creator_id === userId;
      const isOpponent = data.opponent_id === userId;
      const isPlayer3 = (data as any).player3_id === userId;
      const isPlayer4 = (data as any).player4_id === userId;
      const maxPlayers = (data as any).max_players || 2;

      // Se o usuário é o creator, notificar o opponent que está na fila
      if (isCreator && !data.opponent_id) {
        try {
          const { data: queueData } = await supabase
            .from('matchmaking_queue')
            .select('user_id')
            .eq('duel_id', id)
            .neq('user_id', userId)
            .single();

          if (queueData?.user_id) {
            await supabase
              .from('redirects')
              .upsert({
                user_id: queueData.user_id,
                duel_id: id,
                created_at: new Date().toISOString()
              }, { onConflict: 'user_id' });
          }
        } catch (err) {
          console.error('[DuelRoom] Erro ao criar redirect:', err);
        }
      }

      // Se a sala tem slots abertos para o jogador entrar
      const isAlreadyInDuel = isCreator || isOpponent || isPlayer3 || isPlayer4;
      if (!isAlreadyInDuel) {
        // Try to join an open slot
        let joinedSlot: string | null = null;
        if (!data.opponent_id) {
          joinedSlot = 'opponent_id';
        } else if (maxPlayers >= 3 && !(data as any).player3_id) {
          joinedSlot = 'player3_id';
        } else if (maxPlayers >= 4 && !(data as any).player4_id) {
          joinedSlot = 'player4_id';
        }

        if (joinedSlot) {
          try {
            const updateData: any = { [joinedSlot]: userId };
            // Check if all slots are now filled
            const filledAfter = [data.creator_id, data.opponent_id, (data as any).player3_id, (data as any).player4_id]
              .filter(Boolean).length + 1;
            if (filledAfter >= maxPlayers) {
              updateData.status = 'in_progress';
            }

            const { error: updateError } = await supabase
              .from('live_duels')
              .update(updateData)
              .eq('id', id);

            if (updateError) {
              toast({ title: "Erro ao entrar", description: "Não foi possível entrar nesta sala.", variant: "destructive" });
              navigate('/duels');
              return;
            }

            // Reload duel data
            const { data: updatedData } = await supabase
              .from('live_duels')
              .select(`
                *,
                creator:profiles!live_duels_creator_id_fkey(username, avatar_url, user_id),
                opponent:profiles!live_duels_opponent_id_fkey(username, avatar_url, user_id)
              `)
              .eq('id', id)
              .maybeSingle();

            if (updatedData) data = updatedData;
          } catch (error) {
            toast({ title: "Erro ao entrar", description: "Ocorreu um erro ao tentar entrar na sala.", variant: "destructive" });
            navigate('/duels');
            return;
          }
        } else {
          console.log('[DuelRoom] Usuário entrando como espectador');
          toast({
            title: "👁️ Modo Espectador",
            description: "Você está assistindo esta partida.",
          });
        }
      }

      setDuel(data);
      const defaultLP = data.tcg_type === 'magic' ? 40 : data.tcg_type === 'pokemon' ? 6 : 8000;
      setPlayer1LP(data.player1_lp || defaultLP);
      setPlayer2LP(data.player2_lp || defaultLP);
      setPlayer3LP((data as any).player3_lp || defaultLP);
      setPlayer4LP((data as any).player4_lp || defaultLP);
      if ((data as any).custom_counters && Array.isArray((data as any).custom_counters)) {
        setCustomCounters((data as any).custom_counters);
      }
      const isPaused = data.is_timer_paused || false;
      setIsTimerPaused(isPaused);
      isTimerPausedRef.current = isPaused;

      // Criar sala Daily.co
      const fallbackRoomUrl = id ? getDailyRoomUrl(id) : '';
      if (fallbackRoomUrl) {
        setRoomUrl(fallbackRoomUrl);
      }

      try {
        const { data: roomData, error: roomError } = await supabase.functions.invoke('create-daily-room', {
          body: { roomName: `duelverse-${id}` }
        });

        if (roomError) {
          throw roomError;
        }

        const resolvedRoomUrl = roomData?.url || (roomData?.name ? `https://duelverse.daily.co/${roomData.name}` : fallbackRoomUrl);

        if (resolvedRoomUrl) {
          setRoomUrl(resolvedRoomUrl);
        } else {
          throw new Error('Resposta da sala sem URL');
        }
      } catch (error) {
        console.error('[DuelRoom] Erro ao iniciar videochamada:', error);

        if (!fallbackRoomUrl) {
          toast({
            title: "Erro ao iniciar videochamada",
            description: "Erro ao conectar com o servidor de vídeo.",
            variant: "destructive",
          });
        }
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
        const durationMins = data.duration_minutes || 50;
        const maxSeconds = durationMins * 60;
        // Usar remaining_seconds do banco se existir; senão calcular baseado em started_at
        let initialRemaining: number;
        if (data.remaining_seconds !== null && data.remaining_seconds !== undefined) {
          initialRemaining = Math.min(Math.max(0, data.remaining_seconds), maxSeconds);
        } else {
          // Primeira vez - calcular baseado em quanto tempo já passou
          const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
          initialRemaining = Math.max(0, maxSeconds - elapsed);
        }
        const isCreatorUser = data.creator_id === userId;
        startCallTimer(durationMins, initialRemaining, isPaused, isCreatorUser);
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

  const updateLP = async (player: 'player1' | 'player2' | 'player3' | 'player4', amount: number) => {
    if (!id) return;
    const lpMap = { player1: player1LP, player2: player2LP, player3: player3LP, player4: player4LP };
    const newLP = Math.max(0, lpMap[player] + amount);
    try {
      const { error } = await supabase.from('live_duels').update({ [player + '_lp']: newLP }).eq('id', id);
      if (error) throw error;
    } catch (error: any) {
      toast({ title: "Erro ao atualizar LP", description: error.message, variant: "destructive" });
    }
  };

  const setLP = async (player: 'player1' | 'player2' | 'player3' | 'player4', value: number) => {
    if (!id) return;
    const newLP = Math.max(0, value);
    try {
      const { error } = await supabase.from('live_duels').update({ [player + '_lp']: newLP }).eq('id', id);
      if (error) throw error;
    } catch (error: any) {
      toast({ title: "Erro ao atualizar LP", description: error.message, variant: "destructive" });
    }
  };

  const updateCustomCounter = async (counterId: string, newValue: number) => {
    if (!id) return;
    const updated = customCounters.map(c => c.id === counterId ? { ...c, value: newValue } : c);
    setCustomCounters(updated);
    await supabase.from('live_duels').update({ custom_counters: updated } as any).eq('id', id);
  };

  const addCustomCounter = async (name: string, startValue: number) => {
    if (!id) return;
    const newCounter = { id: `cc-${Date.now()}-${Math.random().toString(36).slice(2)}`, name, value: startValue };
    const updated = [...customCounters, newCounter];
    setCustomCounters(updated);
    await supabase.from('live_duels').update({ custom_counters: updated } as any).eq('id', id);
  };

  const removeCustomCounter = async (counterId: string) => {
    if (!id) return;
    const updated = customCounters.filter(c => c.id !== counterId);
    setCustomCounters(updated);
    await supabase.from('live_duels').update({ custom_counters: updated } as any).eq('id', id);
  };

  // Old setLP removed - replaced by the one above that supports 4 players

  const endDuel = async (winnerId?: string) => {
    try {
      // Determinar vencedor baseado nos Life Points se não foi especificado
      let finalWinnerId = winnerId;
      if (!finalWinnerId && duel?.creator_id && duel?.opponent_id) {
        if (player1LP > player2LP) {
          finalWinnerId = duel.creator_id;
        } else if (player2LP > player1LP) {
          finalWinnerId = duel.opponent_id;
        }
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

      // SEMPRE registrar histórico se houver ambos os jogadores (mesmo empate)
      if (duel?.id && duel?.creator_id && duel?.opponent_id) {
        try {
          const { error: matchError } = await supabase.rpc('record_match_result', {
            p_duel_id: duel.id,
            p_player1_id: duel.creator_id,
            p_player2_id: duel.opponent_id,
            p_winner_id: finalWinnerId || null,
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

      if (isSpectator) {
        console.log('[DuelRoom] Espectador saindo, partida continua');
        navigate('/duels');
        return;
      }

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
          remaining_seconds: callDurationRef.current 
        })
        .eq('id', id);

      if (error) throw error;

      setIsTimerPaused(newPauseState);
      isTimerPausedRef.current = newPauseState;
      
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
        description: "Todos os juízes foram notificados e entrarão na sala em breve",
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
  const isPlayer3 = currentUser?.id === (duel as any)?.player3_id;
  const isPlayer4 = currentUser?.id === (duel as any)?.player4_id;
  const isParticipant = isPlayer1 || isPlayer2 || isPlayer3 || isPlayer4;
  const isSpectator = currentUser && !isParticipant;
  
  const currentUserPlayer: 'player1' | 'player2' | 'player3' | 'player4' | null = 
    isPlayer1 ? 'player1' : isPlayer2 ? 'player2' : isPlayer3 ? 'player3' : isPlayer4 ? 'player4' : null;

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
                {/* Badge de juiz + Timer */}
                {isJudge && (
                  <div className="flex flex-col gap-1 items-end">
                    <div className="px-2 sm:px-3 py-1 sm:py-2 rounded-lg backdrop-blur-sm text-xs sm:text-sm font-bold bg-purple-500/95 text-white flex items-center gap-1">
                      <Scale className="w-3 h-3 sm:w-4 sm:h-4" />
                      Juiz
                    </div>
                    {judgeTimerSeconds !== null && !judgeRewarded && (
                      <div className="px-2 py-1 rounded-lg backdrop-blur-sm bg-background/90 border border-border min-w-[140px]">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <Clock className="w-3 h-3" />
                          <span>Recompensa em {String(Math.floor(judgeTimerSeconds / 60)).padStart(2, '0')}:{String(judgeTimerSeconds % 60).padStart(2, '0')}</span>
                        </div>
                        <Progress value={((120 - judgeTimerSeconds) / 120) * 100} className="h-2" />
                      </div>
                    )}
                    {judgeRewarded && (
                      <div className="px-2 py-1 rounded-lg backdrop-blur-sm bg-green-500/90 text-white text-xs font-bold flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        +2 DuelCoins!
                      </div>
                    )}
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
            
            <div className="flex flex-wrap gap-1 sm:gap-2 justify-end">
              {/* O botão de Ocultar e Gravar ficam sempre visíveis para participantes */}
              {isParticipant && !isJudge && (
                <>
                  <HideElementsButton onToggle={() => setHideControls(!hideControls)} isHidden={hideControls} />
                </>
              )}

              {/* Todos os outros botões são controlados por `hideControls` */}
              {!hideControls && (
                <>
                  {isParticipant && !isJudge && (
                    <>
                      {/* Botão do Deck - YGO ou Magic */}
                      {duel?.tcg_type === 'magic' ? (
                        <Button
                          onClick={() => setShowMagicViewer(!showMagicViewer)}
                          variant="outline"
                          size="sm"
                          className="bg-amber-600/95 hover:bg-amber-700 text-white backdrop-blur-sm text-xs sm:text-sm"
                          title="Abrir Arena Magic"
                        >
                          <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      ) : duel?.tcg_type === 'pokemon' ? (
                        <Button
                          onClick={() => setShowPokemonViewer(!showPokemonViewer)}
                          variant="outline"
                          size="sm"
                          className="bg-yellow-500/95 hover:bg-yellow-600 text-white backdrop-blur-sm text-xs sm:text-sm"
                          title="Abrir Arena Pokémon"
                        >
                          <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      ) : (
                        <Button
                          onClick={() => setShowDeckViewer(!showDeckViewer)}
                          variant="outline"
                          size="sm"
                          className="bg-amber-600/95 hover:bg-amber-700 text-white backdrop-blur-sm text-xs sm:text-sm"
                          title="Abrir Deck"
                        >
                          <Layers className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      )}
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
          player3Name={(duel as any).player3_id ? 'Player 3' : ((duel as any).max_players >= 3 ? 'Player 3 (aguardando)' : undefined)}
          player4Name={(duel as any).player4_id ? 'Player 4' : ((duel as any).max_players >= 4 ? 'Player 4 (aguardando)' : undefined)}
          player3LP={player3LP}
          player4LP={player4LP}
          maxPlayers={(duel as any).max_players || 2}
          onUpdateLP={updateLP}
          onSetLP={setLP}
          currentUserPlayer={isSpectator ? null : currentUserPlayer}
          tcgType={duel.tcg_type}
          customCounters={customCounters}
          onUpdateCustomCounter={updateCustomCounter}
          onAddCustomCounter={addCustomCounter}
          onRemoveCustomCounter={removeCustomCounter}
        />
      )}

      {/* Deck Viewer Component - YGO */}
      {isParticipant && !isJudge && duel?.tcg_type === 'yugioh' && (
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

      {/* Pokemon Arena Viewer */}
      {isParticipant && !isJudge && duel?.tcg_type === 'pokemon' && showPokemonViewer && currentUser && id && (
        <PokemonDuelViewer
          duelId={id}
          currentUserId={currentUser.id}
        />
      )}

      {/* Magic Arena Viewer */}
      {isParticipant && !isJudge && duel?.tcg_type === 'magic' && (
        <MagicDuelViewer
          isOpen={showMagicViewer}
          onClose={() => setShowMagicViewer(false)}
          duelId={id}
          currentUserId={currentUser?.id}
        />
      )}

      {/* Floating Opponent Viewer - Always visible for participants */}
      {isParticipant && !isJudge && currentUser && id && duel && (
        <FloatingOpponentViewer
          duelId={id}
          currentUserId={currentUser.id}
          opponentUsername={
            aiDuel.aiMode ? 'IA' : currentUser.id === duel.creator_id 
              ? duel.opponent?.username 
              : duel.creator?.username
          }
          hasOpponent={!!duel.opponent_id}
          aiMode={aiDuel.aiMode}
          onActivateAi={() => setShowAiDeckModal(true)}
        />
      )}

      {/* Chat Component */}
      {!hideControls && currentUser && (
        <DuelChat duelId={id!} currentUserId={currentUser.id} />
      )}

      {/* AI Deck Selection Modal */}
      <AiDeckSelectModal
        open={showAiDeckModal}
        onClose={() => setShowAiDeckModal(false)}
        onSelectDeck={(cards) => aiDuel.startAiMode(cards)}
      />

      {/* AI Chat - Only visible when AI mode is active */}
      {aiDuel.aiMode && (
        <AiDuelChat
          messages={aiDuel.chatMessages}
          isAiThinking={aiDuel.isAiThinking}
          isAiTurn={aiDuel.isAiTurn}
          isListening={aiDuel.isListening}
          onSendMessage={aiDuel.sendChatToAi}
          onStartListening={aiDuel.startListening}
          onStopListening={aiDuel.stopListening}
          onStartAiTurn={aiDuel.startAiTurn}
          onStopAiMode={aiDuel.stopAiMode}
          fieldState={{
            monster1: null, monster2: null, monster3: null, monster4: null, monster5: null,
            spell1: null, spell2: null, spell3: null, spell4: null, spell5: null,
            extraMonster1: null, extraMonster2: null, fieldSpell: null,
            graveyard: [], banished: [], extraDeck: [], deck: [], sideDeck: [], hand: [],
          }}
          playerLP={isPlayer1 ? player1LP : player2LP}
        />
      )}
    </div>
  );
};

export default DuelRoom;
