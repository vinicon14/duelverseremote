/**
 * DuelVerse - Sala de Duelo
 * Desenvolvido por Vinícius
 * 
 * Interface principal de duelo.
 * Gerencia videochamada (WebRTC nativo), LP, timer, chat e estado do duelo em tempo real.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { PhoneOff, Loader2, Scale, Layers, Sparkles, Zap, Clock, Coins } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Navbar } from "@/components/Navbar";
import { DuelChat } from "@/components/DuelChat";
import { FloatingCalculator } from "@/components/FloatingCalculator";
import { RecordMatchButton } from "@/components/RecordMatchButton";
import { ElectronRecordButton } from "@/components/ElectronRecordButton";
import { YouTubeLiveButton } from "@/components/YouTubeLiveButton";
import { HideElementsButton } from "@/components/HideElementsButton";
import { NoMonetagAds } from "@/components/NoMonetagAds";
import { useBanCheck } from "@/hooks/useBanCheck";
import { DuelDeckViewer } from "@/components/duel/DuelDeckViewer";
import { FloatingOpponentViewer } from "@/components/duel/FloatingOpponentViewer";
import { MagicDuelViewer } from "@/components/duel/MagicDuelViewer";
import { PokemonDuelViewer } from "@/components/duel/PokemonDuelViewer";
import { WebRTCVideoCall, type VideoLayout, type WebRTCVideoCallHandle } from "@/components/duel/WebRTCVideoCall";
import { useDuelDeck } from "@/hooks/useDuelDeck";
import { useDuelPresence, useDuelCleanup } from "@/hooks/useDuelPresence";
import { getDefaultLifePoints, isLegacyMagicTcg, isLegacyPokemonTcg, isYgoStyleTcg } from "@/utils/tcgRules";
import { DiscordVoiceRoster } from "@/components/duel/DiscordVoiceRoster";
import { BroadcastDuelToDiscordButton } from "@/components/duel/BroadcastDuelToDiscordButton";

const DuelRoom = () => {
  useBanCheck(); // Proteger contra usuários banidos
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [duel, setDuel] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [player1LP, setPlayer1LP] = useState(8000);
  const [player2LP, setPlayer2LP] = useState(8000);
  const [player3LP, setPlayer3LP] = useState(8000);
  const [player4LP, setPlayer4LP] = useState(8000);
  const [customCounters, setCustomCounters] = useState<{ id: string; name: string; value: number }[]>([]);
  const [showMagicViewer, setShowMagicViewer] = useState(false);
  const [showPokemonViewer, setShowPokemonViewer] = useState(false);
  const [opponentDeckOpen, setOpponentDeckOpen] = useState(false);
  // Per-opponent deck open states for 4-player mode (keyed by peerId)
  const [opponentDeckOpenMap, setOpponentDeckOpenMap] = useState<Record<string, boolean>>({});
  // Spectator: track each player's deck state independently
  const [creatorDeckOpen, setCreatorDeckOpen] = useState(false);
  const [opponentPlayerDeckOpen, setOpponentPlayerDeckOpen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [videoLayout, setVideoLayout] = useState<VideoLayout>("side-by-side");
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [judgeCalled, setJudgeCalled] = useState(false);
  const [elementsHidden, setElementsHidden] = useState(false);
  const isTimerPausedRef = useRef(false);
  const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerInitialized = useRef(false);
  const timeEndedShownRef = useRef(false);
  const timeWarningShownRef = useRef(false);
  const callDurationRef = useRef<number>(0);
  const webrtcRef = useRef<WebRTCVideoCallHandle>(null);
  const deckToggleChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  const isJudge = searchParams.get('role') === 'judge';
  const [hideControls, setHideControls] = useState(false);
  const [judgeTimerSeconds, setJudgeTimerSeconds] = useState<number | null>(null);
  const [judgeRewarded, setJudgeRewarded] = useState(false);
  const judgeLogIdRef = useRef<string | null>(null);
  const judgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const judgeRewardProcessingRef = useRef(false);
  
  // Deck viewer state
  const [showDeckViewer, setShowDeckViewer] = useState(false);
  const { mainDeck, extraDeck, sideDeck, tokensDeck, importDeckFromYDK, loadDeckFromSaved, isLoading: isDeckLoading } = useDuelDeck();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        toast({ title: t('duelRoom.toastRewardError'), description: error.message, variant: "destructive" });
        return;
      }

      if (rewarded) {
        await supabase.from('judge_logs').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', logId);
        setJudgeRewarded(true);
        judgeRewardProcessingRef.current = false;
        toast({ title: t('duelRoom.toastRewardEarnedTitle'), description: t('duelRoom.toastRewardEarnedDesc') });
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
              toast({ title: t('duelRoom.toastRewardError'), description: retryError.message, variant: "destructive" });
              judgeRewardProcessingRef.current = false;
              return;
            }

            if (retryResult) {
              await supabase.from('judge_logs').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', logId);
              setJudgeRewarded(true);
              toast({ title: t('duelRoom.toastRewardEarnedTitle'), description: t('duelRoom.toastRewardEarnedDesc') });
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
            const defaultLP = getDefaultLifePoints(payload.new.tcg_type);
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
            title: t('duelRoom.toastTimeUpTitle'),
            description: t('duelRoom.toastTimeUpDesc'),
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
          title: t('duelRoom.toastTimeWarnTitle'),
          description: t('duelRoom.toastTimeWarnDesc'),
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
          title: t('duelRoom.toastDuelNotFoundTitle'),
          description: t('duelRoom.toastDuelNotFoundDesc'),
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
      const entryRole = searchParams.get('role');
      const wantsToSpectate = entryRole === 'spectate' || entryRole === 'judge';

      if (!isAlreadyInDuel && !wantsToSpectate) {
        // Try to join an open slot only if user is not explicitly spectating
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
              toast({ title: t('duelRoom.toastJoinErrorTitle'), description: t('duelRoom.toastJoinErrorDesc'), variant: "destructive" });
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
            toast({ title: t('duelRoom.toastJoinErrorTitle'), description: t('duelRoom.toastJoinErrorGeneric'), variant: "destructive" });
            navigate('/duels');
            return;
          }
        } else {
          // All slots full, enter as spectator
          console.log('[DuelRoom] Sala lotada, entrando como espectador');
          toast({
            title: t('duelRoom.toastSpectatorTitle'),
            description: t('duelRoom.toastSpectatorDesc'),
          });
        }
      } else if (!isAlreadyInDuel && wantsToSpectate) {
        console.log('[DuelRoom] Entrando como espectador/juiz');
        if (!isJudge) {
          toast({
            title: t('duelRoom.toastSpectatorTitle'),
            description: t('duelRoom.toastSpectatorDesc'),
          });
        }
      }

      setDuel(data);
      const defaultLP = getDefaultLifePoints(data.tcg_type);
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

      // Videochamada WebRTC nativa — basta marcar como pronto
      setVideoReady(true);

      // Garantir que started_at existe - apenas participantes devem escrever
      const isAlreadyInDuelAfterJoin = data.creator_id === userId || data.opponent_id === userId || 
        (data as any).player3_id === userId || (data as any).player4_id === userId;
      let startedAt = data.started_at;
      if (!startedAt && isAlreadyInDuelAfterJoin) {
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
        title: t('duelRoom.toastLoadDuelError'),
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
      toast({ title: t('duelRoom.toastUpdateLpError'), description: error.message, variant: "destructive" });
    }
  };

  const setLP = async (player: 'player1' | 'player2' | 'player3' | 'player4', value: number) => {
    if (!id) return;
    const newLP = Math.max(0, value);
    try {
      const { error } = await supabase.from('live_duels').update({ [player + '_lp']: newLP }).eq('id', id);
      if (error) throw error;
    } catch (error: any) {
      toast({ title: t('duelRoom.toastUpdateLpError'), description: error.message, variant: "destructive" });
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
              title: t('duelRoom.toastReportResultError'),
              description: matchError.message,
              variant: "destructive",
            });
          } else {
            const resultMsg = finalWinnerId 
              ? t('duelRoom.toastResultSuccess')
              : t('duelRoom.toastResultDraw');
            toast({
              title: t('duelRoom.toastResultRecordedTitle'),
              description: resultMsg,
            });
          }
        } catch (error: any) {
          console.error('Erro ao registrar resultado:', error);
          toast({
            title: t('duelRoom.toastReportResultError'),
            description: error.message,
            variant: "destructive",
          });
        }
      } else if (!duel?.opponent_id) {
        toast({
          title: t('duelRoom.toastNotCountedTitle'),
          description: t('duelRoom.toastNotCountedDesc'),
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
        title: t('duelRoom.toastDuelEndedTitle'),
        description: finalWinnerId 
          ? t('duelRoom.toastWinnerLine', { name: winnerName, lp: finalWinnerId === duel?.creator_id ? player1LP : player2LP })
          : player1LP === player2LP 
          ? t('duelRoom.toastDrawLine')
          : t('duelRoom.toastDuelClosed'),
      });

      setTimeout(() => navigate('/duels'), 2000);
    } catch (error: any) {
      toast({
        title: t('duelRoom.toastEndDuelError'),
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
          title: t('duelRoom.toastRoomClosedTitle'),
          description: t('duelRoom.toastRoomClosedDesc'),
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
          title: t('duelRoom.toastYouLeftTitle'),
          description: t('duelRoom.toastYouLeftDesc'),
        });
      }

      navigate('/duels');
    } catch (error: any) {
      console.error('Erro ao sair:', error);
      toast({
        title: t('duelRoom.toastLeaveError'),
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
        title: newPauseState ? t('duelRoom.toastTimerPausedTitle') : t('duelRoom.toastTimerResumedTitle'),
        description: newPauseState ? t('duelRoom.toastTimerPausedDesc') : t('duelRoom.toastTimerResumedDesc'),
      });
    } catch (error: any) {
      toast({
        title: t('duelRoom.toastTimerError'),
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
        title: t('duelRoom.toastJudgeCalledTitle'),
        description: t('duelRoom.toastJudgeCalledDesc'),
      });
    } catch (error: any) {
      toast({
        title: t('duelRoom.toastCallJudgeError'),
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

  // Broadcast deck-open state to opponent & listen for opponent's deck state
  const myDeckIsOpen = showDeckViewer || showMagicViewer || showPokemonViewer;
  const myDeckIsOpenRef = useRef(myDeckIsOpen);
  myDeckIsOpenRef.current = myDeckIsOpen;
  
  useEffect(() => {
    if (!id || !currentUser) return;

    const channel = supabase.channel(`deck-open-${id}`, {
      config: { broadcast: { self: false } },
    });
    
    // Listen for opponent opening/closing their deck
    channel.on('broadcast', { event: 'deck-toggle' }, ({ payload }) => {
      if (payload.userId !== currentUser.id) {
        setOpponentDeckOpen(!!payload.isOpen);
        // Also track per-opponent state for 4-player
        setOpponentDeckOpenMap(prev => ({ ...prev, [payload.userId]: !!payload.isOpen }));
        // Spectator: track each player's deck state independently
        if (duel?.creator_id && payload.userId === duel.creator_id) {
          setCreatorDeckOpen(!!payload.isOpen);
        }
        if (duel?.opponent_id && payload.userId === duel.opponent_id) {
          setOpponentPlayerDeckOpen(!!payload.isOpen);
        }
      }
    })
    // Players respond to spectator requests with their current deck state
    .on('broadcast', { event: 'deck-state-request' }, () => {
      // Only players respond (not spectators)
      if (currentUser.id === duel?.creator_id || currentUser.id === duel?.opponent_id) {
        channel.send({
          type: 'broadcast',
          event: 'deck-toggle',
          payload: { userId: currentUser.id, isOpen: myDeckIsOpenRef.current },
        });
      }
    })
    .subscribe(() => {
      deckToggleChannelRef.current = channel;
      // Spectator: request current deck states from players already in the room
      const isSpec = currentUser.id !== duel?.creator_id && currentUser.id !== duel?.opponent_id;
      if (isSpec) {
        setTimeout(() => {
          channel.send({
            type: 'broadcast',
            event: 'deck-state-request',
            payload: {},
          });
        }, 500);
      }
    });

    return () => { 
      deckToggleChannelRef.current = null;
      supabase.removeChannel(channel); 
    };
  }, [id, currentUser, duel?.creator_id, duel?.opponent_id]);

  // Broadcast my deck state whenever it changes (uses the already-subscribed channel)
  useEffect(() => {
    if (!id || !currentUser) return;
    const ch = deckToggleChannelRef.current;
    if (ch) {
      ch.send({
        type: 'broadcast',
        event: 'deck-toggle',
        payload: { userId: currentUser.id, isOpen: myDeckIsOpen },
      });
    } else {
      // Channel not ready yet, retry after a short delay
      const timer = setTimeout(() => {
        deckToggleChannelRef.current?.send({
          type: 'broadcast',
          event: 'deck-toggle',
          payload: { userId: currentUser.id, isOpen: myDeckIsOpen },
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [id, currentUser, myDeckIsOpen]);

  // Auto-disable camera when deck opens, re-enable when it closes
  useEffect(() => {
    if (!webrtcRef.current) return;
    if (myDeckIsOpen) {
      webrtcRef.current.setVideoEnabled(false);
    } else {
      webrtcRef.current.setVideoEnabled(true);
    }
  }, [myDeckIsOpen]);

  return (
    <div className="min-h-screen bg-transparent">
      <NoMonetagAds />
      {!hideControls && <Navbar />}
      
      <main className="px-2 sm:px-4 pt-16 sm:pt-20 pb-2 sm:pb-4">
        <div className="h-[calc(100vh-80px)] sm:h-[calc(100vh-100px)] relative">
          {/* Video Call - WebRTC nativo com deck overlays integrados */}
          <div className="h-full w-full rounded-lg overflow-hidden bg-card shadow-2xl border border-primary/20 relative">
            {videoReady && currentUser && id ? (
              <WebRTCVideoCall
                ref={webrtcRef}
                duelId={id}
                userId={currentUser.id}
                isCreator={currentUser.id === duel?.creator_id}
                className="w-full h-full absolute inset-0"
                layout={videoLayout}
                maxPlayers={(duel as any)?.max_players || 2}
                isSpectator={!!isSpectator && !isJudge}
                creatorId={duel?.creator_id}
                onLayoutChange={setVideoLayout}
                spectatorLpOverlay={isSpectator && !isJudge ? {
                  localLabel: duel.creator?.username || 'Player 1',
                  localLp: player1LP,
                  remotePlayers: [
                    { label: duel.opponent?.username || 'Player 2', lp: player2LP },
                    ...((duel as any)?.max_players >= 3 ? [{ label: 'Player 3', lp: player3LP }] : []),
                    ...((duel as any)?.max_players >= 4 ? [{ label: 'Player 4', lp: player4LP }] : []),
                  ]
                } : undefined}
                localDeckOpen={
                  isSpectator && !isJudge
                    ? creatorDeckOpen
                    : myDeckIsOpen && isParticipant && !isJudge
                }
                remoteDeckOpen={
                  isSpectator && !isJudge
                    ? opponentPlayerDeckOpen
                    : opponentDeckOpen && isParticipant && !isJudge
                }
                localDeckContent={
                  isSpectator && !isJudge && currentUser && id && duel && ((duel as any)?.max_players || 2) <= 2 ? (
                    <FloatingOpponentViewer
                      duelId={id}
                      currentUserId={currentUser.id}
                      opponentUsername={duel.creator?.username || 'Jogador 1'}
                      filterOpponentId={duel.creator_id || undefined}
                      embedded
                    />
                  ) : myDeckIsOpen && isParticipant && !isJudge ? (
                    <>
                      {isYgoStyleTcg(duel?.tcg_type) && showDeckViewer && (
                        <>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".ydk"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) importDeckFromYDK(file);
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
                            embedded
                          />
                        </>
                      )}
                      {isLegacyMagicTcg(duel?.tcg_type) && showMagicViewer && (
                        <MagicDuelViewer
                          isOpen={showMagicViewer}
                          onClose={() => setShowMagicViewer(false)}
                          duelId={id}
                          currentUserId={currentUser?.id}
                          embedded
                        />
                      )}
                      {isLegacyPokemonTcg(duel?.tcg_type) && showPokemonViewer && currentUser && id && (
                        <PokemonDuelViewer
                          duelId={id}
                          currentUserId={currentUser.id}
                          embedded
                        />
                      )}
                    </>
                  ) : undefined
                }
                remoteDeckContent={
                  !isJudge && currentUser && id && duel && ((duel as any)?.max_players || 2) <= 2 ? (
                    <FloatingOpponentViewer
                      duelId={id}
                      currentUserId={currentUser.id}
                      opponentUsername={
                        isSpectator
                          ? (duel.opponent?.username || t('duelRoom.player2Default'))
                          : currentUser.id === duel.creator_id 
                            ? duel.opponent?.username 
                            : duel.creator?.username
                      }
                      filterOpponentId={isSpectator ? (duel.opponent_id || undefined) : undefined}
                      embedded
                    />
                  ) : undefined
                }
                // 4-player mode: per-slot opponent viewers
                remoteDeckContents={
                  ((duel as any)?.max_players || 2) >= 4 && !isJudge && currentUser && id && duel
                    ? [0, 1, 2].map((_slotIdx) => (
                        <FloatingOpponentViewer
                          key={`opponent-slot-${_slotIdx}`}
                          duelId={id}
                          currentUserId={currentUser.id}
                          embedded
                        />
                      ))
                    : undefined
                }
                remoteDeckOpenSlots={
                  ((duel as any)?.max_players || 2) >= 4
                    ? [0, 1, 2].map(() => Object.values(opponentDeckOpenMap).some(Boolean) && !isJudge)
                    : undefined
                }
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Loader2 className="w-12 h-12 mx-auto text-primary animate-spin" />
                  <div>
                    <p className="text-muted-foreground mb-2">{t('duelRoom.loadingVideoRoom')}</p>
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
                      {t('duelRoom.judgeBadge')}
                    </div>
                    {judgeTimerSeconds !== null && !judgeRewarded && (
                      <div className="px-2 py-1 rounded-lg backdrop-blur-sm bg-background/90 border border-border min-w-[140px]">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                          <Clock className="w-3 h-3" />
                          <span>{t('duelRoom.rewardIn', { time: `${String(Math.floor(judgeTimerSeconds / 60)).padStart(2, '0')}:${String(judgeTimerSeconds % 60).padStart(2, '0')}` })}</span>
                        </div>
                        <Progress value={((120 - judgeTimerSeconds) / 120) * 100} className="h-2" />
                      </div>
                    )}
                    {judgeRewarded && (
                      <div className="px-2 py-1 rounded-lg backdrop-blur-sm bg-green-500/90 text-white text-xs font-bold flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        {t('duelRoom.rewardEarned')}
                      </div>
                    )}
                  </div>
                )}

                {/* Badge de modo espectador */}
                {isSpectator && !isJudge && (
                  <div className="px-2 sm:px-3 py-1 sm:py-2 rounded-lg backdrop-blur-sm text-xs sm:text-sm font-bold bg-purple-500/95 text-white">
                    {t('duelRoom.spectatorBadge')}
                  </div>
                )}

                {/* Badge de Tipo de Partida */}
                {duel && (
                  <div className={`px-2 sm:px-3 py-1 sm:py-2 rounded-lg backdrop-blur-sm text-xs sm:text-sm font-bold ${
                    duel.is_ranked
                      ? 'bg-yellow-500/95 text-black'
                      : 'bg-blue-500/95 text-white'
                  }`}>
                    {duel.is_ranked ? t('duelRoom.rankedBadge') : t('duelRoom.casualBadge')}
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
              {/* Spectator: only Gravar and Sair */}
              {isSpectator && !isJudge ? (
                <>
                  <HideElementsButton onToggle={() => setHideControls(!hideControls)} isHidden={hideControls} />
                  {!(window as any).electronAPI?.isElectron && <RecordMatchButton duelId={id!} />}
                  <Button
                    onClick={handleLeave}
                    variant="destructive"
                    size="sm"
                    className="bg-destructive/95 backdrop-blur-sm text-xs sm:text-sm"
                  >
                    <PhoneOff className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t('duelRoom.leave')}</span>
                  </Button>
                </>
              ) : (
                <>
                  {/* O botão de Ocultar e Gravar ficam sempre visíveis */}
                  {!isJudge && (
                    <>
                      <HideElementsButton onToggle={() => setHideControls(!hideControls)} isHidden={hideControls} />
                      {!(window as any).electronAPI?.isElectron && <RecordMatchButton duelId={id!} />}
                      {isParticipant && (
                        <span className="hidden sm:inline-flex">
                          <YouTubeLiveButton duelId={id!} />
                        </span>
                      )}
                      {isParticipant && (
                        <BroadcastDuelToDiscordButton duelId={id!} />
                      )}
                    </>
                  )}

                  {/* Todos os outros botões são controlados por `hideControls` */}
                  {!hideControls && (
                    <>
                      {isParticipant && !isJudge && (
                        <>
                          {/* Botão do Deck */}
                          {isLegacyMagicTcg(duel?.tcg_type) ? (
                            <Button
                              onClick={() => setShowMagicViewer(!showMagicViewer)}
                              variant="outline"
                              size="sm"
                              className="bg-amber-600/95 hover:bg-amber-700 text-white backdrop-blur-sm text-xs sm:text-sm"
                              title={t('duelRoom.openMagicArena')}
                            >
                              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          ) : isLegacyPokemonTcg(duel?.tcg_type) ? (
                            <Button
                              onClick={() => setShowPokemonViewer(!showPokemonViewer)}
                              variant="outline"
                              size="sm"
                              className="bg-yellow-500/95 hover:bg-yellow-600 text-white backdrop-blur-sm text-xs sm:text-sm"
                              title={t('duelRoom.openPokemonArena')}
                            >
                              <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
                            </Button>
                          ) : (
                            <Button
                              onClick={() => setShowDeckViewer(!showDeckViewer)}
                              variant="outline"
                              size="sm"
                              className="bg-amber-600/95 hover:bg-amber-700 text-white backdrop-blur-sm text-xs sm:text-sm"
                              title={t('duelRoom.openDeck')}
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
                            title={t('duelRoom.callJudgeTitle')}
                          >
                            <Scale className="w-3 h-3 sm:w-4 sm:h-4" />
                            {judgeCalled && <span className="ml-1 hidden sm:inline">✓</span>}
                          </Button>
                          <Button
                            onClick={toggleTimerPause}
                            variant="outline"
                            size="sm"
                            className="bg-card/95 backdrop-blur-sm text-xs sm:text-sm"
                            title={isTimerPaused ? t('duelRoom.resumeTimerTitle') : t('duelRoom.pauseTimerTitle')}
                          >
                            {isTimerPaused ? '▶️' : '⏸️'}
                          </Button>
                          <Button
                            onClick={() => endDuel()}
                            variant="outline"
                            size="sm"
                            className="bg-green-600/95 hover:bg-green-700 text-white backdrop-blur-sm text-xs sm:text-sm"
                            title={t('duelRoom.endMatch')}
                          >
                            <span className="hidden sm:inline">{t('duelRoom.finish')}</span>
                            <span className="sm:hidden">{t('duelRoom.endShort')}</span>
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
                        <span className="hidden sm:inline">{t('duelRoom.leave')}</span>
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Calculadora Flutuante - Apenas participantes e juízes, não espectadores */}
      {duel && currentUser && !isSpectator && (
        <FloatingCalculator
          player1Name={duel.creator?.username || 'Player 1'}
          player2Name={duel.opponent?.username || 'Player 2'}
          player1LP={player1LP}
          player2LP={player2LP}
          player3Name={(duel as any).player3_id ? 'Player 3' : ((duel as any).max_players >= 3 ? t('duelRoom.playerWaiting', { n: 3 }) : undefined)}
          player4Name={(duel as any).player4_id ? 'Player 4' : ((duel as any).max_players >= 4 ? t('duelRoom.playerWaiting', { n: 4 }) : undefined)}
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

      {/* Roster do Discord (se a sala foi criada/sincronizada via call de voz) */}
      {duel?.id && <DiscordVoiceRoster duelId={duel.id} />}

    </div>
  );
};

export default DuelRoom;
