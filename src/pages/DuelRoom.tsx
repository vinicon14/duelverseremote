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

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

const DuelRoom = () => {
  useBanCheck(); // Proteger contra usuários banidos
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const jitsiContainer = useRef<HTMLDivElement>(null);
  const [jitsiApi, setJitsiApi] = useState<any>(null);
  const [duel, setDuel] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [player1LP, setPlayer1LP] = useState(8000);
  const [player2LP, setPlayer2LP] = useState(8000);
  const [callDuration, setCallDuration] = useState(0); // em segundos
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [isJitsiLoaded, setIsJitsiLoaded] = useState(false);
  const callStartTime = useRef<number | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  // Carrega o script do Jitsi primeiro
  useEffect(() => {
    const script = document.getElementById('jitsi-script') as HTMLScriptElement;
    
    if (script) {
      if (window.JitsiMeetExternalAPI) {
        setIsJitsiLoaded(true);
      }
      return;
    }

    const newScript = document.createElement('script');
    newScript.id = 'jitsi-script';
    newScript.src = 'https://meet.jit.si/external_api.js';
    newScript.async = true;
    newScript.onload = () => {
      console.log('Jitsi script loaded successfully');
      setIsJitsiLoaded(true);
    };
    newScript.onerror = () => {
      console.error('Failed to load Jitsi script');
      toast({
        title: "Erro ao carregar vídeo",
        description: "Não foi possível carregar a chamada de vídeo. Recarregue a página.",
        variant: "destructive",
      });
    };
    document.body.appendChild(newScript);
  }, []);

  // Inicializa o Jitsi quando script estiver carregado e container montado
  useEffect(() => {
    if (!isJitsiLoaded || !jitsiContainer.current || !id) return;

    const initJitsi = () => {
      console.log('Initializing Jitsi Meet...');
      
      try {
        const api = new window.JitsiMeetExternalAPI('meet.jit.si', {
          roomName: `duelverse_${id}`,
          parentNode: jitsiContainer.current,
          width: '100%',
          height: '100%',
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: false,
            enableWelcomePage: false,
            requireDisplayName: false,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'desktop',
              'fullscreen',
              'hangup',
              'chat',
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          },
          userInfo: {
            displayName: currentUser?.email?.split('@')[0] || 'Jogador',
          },
        });

        console.log('Jitsi initialized successfully');
        
        // Reinicializar automaticamente quando a conferência terminar (a cada 5 min)
        api.addEventListener('videoConferenceLeft', () => {
          console.log('Jitsi conference left, checking time remaining...');
          
          // Calcular tempo restante usando o ref ao invés do estado
          const MAX_DURATION = 3600; // 60 minutos em segundos
          const elapsed = callStartTime.current 
            ? Math.floor((Date.now() - callStartTime.current) / 1000)
            : 0;
          const remaining = Math.max(0, MAX_DURATION - elapsed);
          
          // Verificar se ainda há tempo restante
          if (remaining > 0) {
            console.log(`Time remaining: ${remaining}s, reinitializing Jitsi in 2 seconds...`);
            setTimeout(() => {
              if (jitsiContainer.current) {
                api.dispose();
                initJitsi();
              }
            }, 2000);
          } else {
            console.log('No time remaining, not reinitializing');
          }
        });

        setJitsiApi(api);
      } catch (error) {
        console.error('Error initializing Jitsi:', error);
        toast({
          title: "Erro ao inicializar vídeo",
          description: "Não foi possível iniciar a chamada de vídeo.",
          variant: "destructive",
        });
      }
    };

    initJitsi();
  }, [isJitsiLoaded, id]);

  // Carrega dados do duelo e inicia timer
  useEffect(() => {
    checkAuth();
    fetchDuel();
    startCallTimer();

    return () => {
      if (jitsiApi) {
        jitsiApi.dispose();
      }
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

      await supabase
        .from('live_duels')
        .update({
          status: 'finished',
          ended_at: new Date().toISOString(),
          winner_id: winnerId,
        })
        .eq('id', id);

      if (winnerId) {
        await supabase.from('match_history').insert({
          player1_id: duel?.creator_id,
          player2_id: duel?.opponent_id,
          winner_id: winnerId,
          bet_amount: duel?.bet_amount || 0,
          player1_score: winnerId === duel?.opponent_id ? 0 : player1LP,
          player2_score: winnerId === duel?.creator_id ? 0 : player2LP,
        });
      }

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
    if (jitsiApi) {
      jitsiApi.dispose();
    }
    navigate('/duels');
  };

  const isPlayer1 = currentUser?.id === duel?.creator_id;
  const isPlayer2 = currentUser?.id === duel?.opponent_id;
  const canControlLP = isPlayer1 || isPlayer2;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="px-4 pt-20 pb-4">
        <div className="h-[calc(100vh-100px)] relative">
          {/* Video Call - Quase tela inteira */}
          <div className="h-full w-full rounded-lg overflow-hidden bg-card shadow-2xl border border-primary/20">
            <div ref={jitsiContainer} className="w-full h-full" />
          </div>

          {/* Botão de Sair e Timer - Fixo no canto superior direito */}
          <div className="absolute top-4 right-4 z-50 flex gap-2 items-center">
            {/* Timer Display - Contagem Regressiva */}
            <div className={`px-4 py-2 rounded-lg backdrop-blur-sm font-mono text-sm font-bold ${
              callDuration <= 300 ? 'bg-destructive/95 text-destructive-foreground animate-pulse' : 
              callDuration <= 600 ? 'bg-yellow-500/95 text-black' : 
              'bg-card/95'
            }`}>
              ⏱️ {formatTime(callDuration)}
            </div>
            
            {canControlLP && (
              <Button
                onClick={() => endDuel()}
                variant="outline"
                className="bg-card/95 backdrop-blur-sm"
              >
                Finalizar Duelo
              </Button>
            )}
            <Button
              onClick={handleLeave}
              variant="destructive"
              className="bg-destructive/95 backdrop-blur-sm"
            >
              <PhoneOff className="w-4 h-4 mr-2" />
              Sair
            </Button>
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
          readOnly={!canControlLP}
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
