import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { PhoneOff } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DuelChat } from "@/components/DuelChat";
import { FloatingCalculator } from "@/components/FloatingCalculator";

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

const DuelRoom = () => {
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
  const callStartTime = useRef<number | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadJitsi();
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

  const startCallTimer = () => {
    callStartTime.current = Date.now();
    
    timerInterval.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (callStartTime.current || Date.now())) / 1000);
      setCallDuration(elapsed);

      // Aviso aos 55 minutos (3300 segundos)
      if (elapsed === 3300 && !showTimeWarning) {
        setShowTimeWarning(true);
        toast({
          title: "⏰ Tempo de chamada",
          description: "Restam 5 minutos. A chamada será encerrada em breve.",
          duration: 10000,
        });
      }

      // Finalizar automaticamente aos 60 minutos (3600 segundos)
      if (elapsed >= 3600) {
        toast({
          title: "Tempo esgotado",
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

  const loadJitsi = () => {
    if (document.getElementById('jitsi-script')) return;

    const script = document.createElement('script');
    script.id = 'jitsi-script';
    script.src = 'https://meet.jit.si/external_api.js';
    script.async = true;
    script.onload = () => initializeJitsi();
    document.body.appendChild(script);
  };

  const initializeJitsi = () => {
    if (!jitsiContainer.current || !id) return;

    const api = new window.JitsiMeetExternalAPI('meet.jit.si', {
      roomName: `duelverse_${id}`,
      parentNode: jitsiContainer.current,
      width: '100%',
      height: '100%',
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
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
      },
    });

    setJitsiApi(api);
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
          player1:profiles!live_duels_player1_id_fkey(username, avatar_url),
          player2:profiles!live_duels_player2_id_fkey(username, avatar_url)
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
        await endDuel(player === 'player1' ? duel?.player2_id : duel?.player1_id);
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
        await endDuel(player === 'player1' ? duel?.player2_id : duel?.player1_id);
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
          duel_id: id,
          player1_id: duel?.player1_id,
          player2_id: duel?.player2_id,
          winner_id: winnerId,
          duration_minutes: durationMinutes,
          player1_elo_before: 1500,
          player1_elo_after: winnerId === duel?.player1_id ? 1532 : 1468,
          player2_elo_before: 1500,
          player2_elo_after: winnerId === duel?.player2_id ? 1532 : 1468,
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

  const isPlayer1 = currentUser?.id === duel?.player1_id;
  const isPlayer2 = currentUser?.id === duel?.player2_id;
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
            {/* Timer Display */}
            <div className={`px-4 py-2 rounded-lg backdrop-blur-sm font-mono text-sm ${
              callDuration >= 3300 ? 'bg-destructive/95 text-destructive-foreground animate-pulse' : 'bg-card/95'
            }`}>
              ⏱️ {formatTime(callDuration)} / 60:00
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

      {/* Calculadora Flutuante */}
      {canControlLP && duel && (
        <FloatingCalculator
          player1Name={duel.player1?.username || 'Jogador 1'}
          player2Name={duel.player2?.username || 'Aguardando...'}
          player1LP={player1LP}
          player2LP={player2LP}
          onUpdateLP={updateLP}
          onSetLP={setLP}
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
