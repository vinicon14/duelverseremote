import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Users, Send, Share2 } from "lucide-react";
import DailyIframe from '@daily-co/daily-js';
import { FloatingCalculator } from "@/components/FloatingCalculator";

const StreamViewer = () => {
  const { streamId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stream, setStream] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [viewersCount, setViewersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [duel, setDuel] = useState<any>(null);
  const [player1LP, setPlayer1LP] = useState(8000);
  const [player2LP, setPlayer2LP] = useState(8000);
  const [showCalculator, setShowCalculator] = useState(true);
  const callFrameRef = useRef<any>(null);
  const iframeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();
    fetchStream();

    return () => {
      if (callFrameRef.current) {
        callFrameRef.current.destroy();
      }
    };
  }, [streamId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
    }
  };

  const fetchStream = async () => {
    try {
      const { data, error } = await supabase
        .from('live_streams')
        .select('*')
        .eq('id', streamId)
        .single();

      if (error) throw error;
      
      if (data.status !== 'active') {
        toast({
          title: "Transmissão encerrada",
          description: "Esta transmissão não está mais ativa",
          variant: "destructive",
        });
        navigate('/live-streams');
        return;
      }

      setStream(data);
      await initializeDailyCall(data);
      
      // Se a stream for de um duelo, buscar dados do duelo
      if (data.duel_id) {
        await fetchDuelData(data.duel_id);
      }

      // Atualizar contador de viewers
      await supabase
        .from('live_streams')
        .update({ viewers_count: data.viewers_count + 1 })
        .eq('id', streamId);

    } catch (error: any) {
      toast({
        title: "Erro ao carregar transmissão",
        description: error.message,
        variant: "destructive",
      });
      navigate('/live-streams');
    } finally {
      setLoading(false);
    }
  };

  const fetchDuelData = async (duelId: string) => {
    try {
      const { data, error } = await supabase
        .from('live_duels')
        .select(`
          *,
          creator:profiles!live_duels_creator_id_fkey(username),
          opponent:profiles!live_duels_opponent_id_fkey(username)
        `)
        .eq('id', duelId)
        .single();

      if (error) throw error;

      setDuel(data);
      setPlayer1LP(data.player1_lp);
      setPlayer2LP(data.player2_lp);

      // Setup realtime para LPs e status do duelo
      const channel = supabase
        .channel(`duel-lp-update-${duelId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'live_duels',
            filter: `id=eq.${duelId}`
          },
          (payload) => {
            setPlayer1LP(payload.new.player1_lp);
            setPlayer2LP(payload.new.player2_lp);
            
            // Se o duelo terminou, encerrar stream
            if (payload.new.status === 'finished') {
              toast({
                title: "Duelo finalizado",
                description: "A transmissão será encerrada",
              });
              setTimeout(() => {
                navigate('/live-streams');
              }, 3000);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };

    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados do duelo",
        description: error.message,
      });
    }
  };

  const initializeDailyCall = async (streamData: any) => {
    try {
      // Obter token de viewer
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.functions.invoke('get-stream-token', {
        body: { stream_id: streamId, role: 'viewer' }
      });

      if (error) throw error;

      // Criar call frame no container
      if (iframeRef.current) {
        callFrameRef.current = DailyIframe.createFrame(iframeRef.current, {
          showLeaveButton: false,
          showFullscreenButton: true,
          showParticipantsBar: true,
          iframeStyle: {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            border: 'none',
            borderRadius: '12px',
          },
        });

        // Join na sala com o token - viewer não transmite mas recebe vídeo/áudio
        await callFrameRef.current.join({
          url: streamData.daily_room_url,
          token: data.token,
          userName: user?.email?.split('@')[0] || 'Espectador',
        });

        console.log('✅ Conectado à live como espectador');

        // Event listeners
        callFrameRef.current.on('participant-joined', (event: any) => {
          console.log('👤 Participante entrou:', event.participant.user_name);
          updateViewersCount();
        });

        callFrameRef.current.on('participant-left', (event: any) => {
          console.log('👤 Participante saiu:', event.participant.user_name);
          updateViewersCount();
        });

        callFrameRef.current.on('left-meeting', () => {
          navigate('/live-streams');
        });

        // Atualizar contador inicial
        updateViewersCount();
      }
    } catch (error: any) {
      console.error('Erro ao inicializar Daily:', error);
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const updateViewersCount = () => {
    if (callFrameRef.current) {
      const participants = callFrameRef.current.participants();
      setViewersCount(Object.keys(participants).length);
    }
  };

  const sendMessage = async () => {
    if (!messageInput.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newMessage = {
      user_name: user.email?.split('@')[0] || 'Usuário',
      message: messageInput,
      timestamp: new Date().toISOString(),
    };

    setChatMessages([...chatMessages, newMessage]);
    setMessageInput("");
  };

  const leaveStream = async () => {
    if (callFrameRef.current) {
      await callFrameRef.current.leave();
    }
    
    // Decrementar viewers
    if (stream) {
      await supabase
        .from('live_streams')
        .update({ viewers_count: Math.max(0, stream.viewers_count - 1) })
        .eq('id', streamId);
    }

    navigate('/live-streams');
  };

  const shareStream = async () => {
    const streamUrl = `${window.location.origin}/stream/${streamId}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Assista esta live no DuelVerse!',
          text: 'Venha assistir esta transmissão ao vivo!',
          url: streamUrl,
        });
      } catch (error) {
        // Usuário cancelou ou erro
        console.log('Compartilhamento cancelado');
      }
    } else {
      // Fallback: copiar para clipboard
      try {
        await navigator.clipboard.writeText(streamUrl);
        toast({
          title: "Link copiado!",
          description: "O link da live foi copiado para a área de transferência",
        });
      } catch (error) {
        toast({
          title: "Erro ao copiar",
          description: "Não foi possível copiar o link",
          variant: "destructive",
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando transmissão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <Button onClick={leaveStream} variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="w-5 h-5" />
            <span className="font-semibold">{viewersCount} espectadores</span>
          </div>
          <div className="flex items-center gap-2 text-red-500">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="font-semibold">AO VIVO</span>
          </div>
          <Button onClick={shareStream} variant="secondary" size="sm">
            <Share2 className="w-4 h-4 mr-2" />
            Compartilhar
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
              <div 
                ref={iframeRef} 
                className="absolute inset-0 w-full h-full"
              />
            </div>
            {duel && showCalculator && (
              <div className="mt-4">
                <FloatingCalculator
                  player1Name={duel.creator?.username || 'Player 1'}
                  player2Name={duel.opponent?.username || 'Player 2'}
                  player1LP={player1LP}
                  player2LP={player2LP}
                  onUpdateLP={() => {}} // Read-only
                  onSetLP={() => {}} // Read-only
                  currentUserPlayer={null} // Viewer
                  onClose={() => setShowCalculator(false)}
                />
              </div>
            )}
          </div>

          <Card className="card-mystic lg:col-span-1">
            <CardContent className="p-4 flex flex-col h-[500px]">
              <h3 className="text-lg font-bold mb-4">Chat ao Vivo</h3>
              
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {chatMessages.map((msg, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-semibold text-primary">{msg.user_name}:</span>{' '}
                    <span className="text-muted-foreground">{msg.message}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Envie uma mensagem..."
                  className="flex-1"
                />
                <Button onClick={sendMessage} size="icon">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StreamViewer;