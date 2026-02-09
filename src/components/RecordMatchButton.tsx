import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Video, Square, Loader2, Lock, Globe, Mic, MicOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAccountType } from "@/hooks/useAccountType";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface RecordMatchButtonProps {
  duelId: string;
  tournamentId?: string;
}

type RecordingAudioSource = "system" | "mic" | "both";

export const RecordMatchButton = ({ duelId, tournamentId }: RecordMatchButtonProps) => {
  const { toast } = useToast();
  const { isPro, loading: accountLoading } = useAccountType();
  const isMobile = useIsMobile();

  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [audioSource, setAudioSource] = useState<RecordingAudioSource>("both");

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const [micLevel, setMicLevel] = useState(0);
  const [hasMic, setHasMic] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoBlob = useRef<Blob | null>(null);

  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Função para monitorar nível do microfone
  const startMicMonitoring = useCallback((micStream: MediaStream) => {
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    
    const analyser = audioContext.createAnalyser();
    analyserRef.current = analyser;
    analyser.fftSize = 256;
    
    const source = audioContext.createMediaStreamSource(micStream);
    source.connect(analyser);
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const updateLevel = () => {
      if (!analyserRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const normalizedLevel = Math.min(100, (average / 128) * 100);
      setMicLevel(normalizedLevel);
      
      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
  }, []);

  const stopMicMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    analyserRef.current = null;

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

    setMicLevel(0);
    setHasMic(false);
  }, []);

  // Cleanup ao desmontar componente (apenas unmount)
  useEffect(() => {
    return () => {
      // Remover classe e parar gravação ao desmontar
      document.body.classList.remove('recording-active');

      if (mediaRecorderRef.current?.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }

      // Parar stream do microfone
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
      }

      stopMicMonitoring();
    };
  }, [stopMicMonitoring]);

  const startRecording = async (source: RecordingAudioSource) => {
    if (!isPro) {
      toast({
        title: "Recurso PRO",
        description: "Apenas usuários PRO podem gravar partidas.",
        variant: "destructive",
      });
      return;
    }

    // Detectar se é mobile (fallback; o botão já é ocultado no mobile)
    const isDeviceMobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    // Verificar se a API de gravação está disponível
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      toast({
        title: "Não suportado",
        description: isDeviceMobileUA
          ? "A gravação de tela não é suportada em dispositivos móveis. Use um computador para gravar suas partidas."
          : "Seu navegador não suporta gravação de tela.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Segurança: limpar qualquer estado anterior de mic/monitoramento
      stopMicMonitoring();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }

      const displayMediaOptions: any = {
        video: {
          displaySurface: "browser",
          width: { ideal: isDeviceMobileUA ? 720 : 1280 },
          height: { ideal: isDeviceMobileUA ? 1280 : 720 },
          frameRate: { ideal: isDeviceMobileUA ? 15 : 30 },
        },
        audio: source !== "mic", // "som do jogo" somente se o usuário escolher
      };

      const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      // Capturar áudio do microfone (se necessário)
      let micStream: MediaStream | null = null;
      if (source === "mic" || source === "both") {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          micStreamRef.current = micStream;
        } catch (micError) {
          console.log("Microfone não disponível:", micError);

          if (source === "mic") {
            // Se o usuário escolheu "microfone", aborta para não gravar sem áudio.
            displayStream.getTracks().forEach((t) => t.stop());
            toast({
              title: "Microfone bloqueado",
              description: "Permita o acesso ao microfone para gravar com áudio.",
              variant: "destructive",
            });
            return;
          }

          toast({
            title: "Aviso",
            description: "Não foi possível acessar o microfone. Gravando sem áudio do microfone.",
          });
        }
      }

      // Criar trilha única de áudio (mix) para melhorar compatibilidade do MediaRecorder
      const mixContext = new AudioContext();

      if (mixContext.state === "suspended") {
        await mixContext.resume();
      }

      const destination = mixContext.createMediaStreamDestination();

      // Áudio do jogo (sistema/aba)
      const displayAudioTracks = displayStream.getAudioTracks();
      if (source !== "mic") {
        if (displayAudioTracks.length > 0) {
          const displayAudioStream = new MediaStream(displayAudioTracks);
          const displayAudioSource = mixContext.createMediaStreamSource(displayAudioStream);
          displayAudioSource.connect(destination);
        } else {
          // Importante: em muitos navegadores só grava áudio se compartilhar uma ABA e marcar "Compartilhar áudio".
          toast({
            title: "Sem áudio do jogo",
            description:
              "Para gravar o som do jogo, compartilhe uma aba e ative a opção de compartilhar áudio na janela do navegador.",
          });
        }
      }

      // Áudio do microfone
      const micTrack = micStream?.getAudioTracks?.()?.[0];
      if (micTrack && micTrack.readyState === "live") {
        const micAudioSource = mixContext.createMediaStreamSource(micStream as MediaStream);
        micAudioSource.connect(destination);

        // Indicador visual
        setHasMic(true);
        startMicMonitoring(micStream as MediaStream);
      } else {
        setHasMic(false);
      }

      const combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);

      // Determinar melhor codec disponível
      let mimeType = "video/webm;codecs=vp8,opus";
      if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
        mimeType = "video/webm;codecs=vp9,opus";
      } else if (MediaRecorder.isTypeSupported("video/webm;codecs=h264,opus")) {
        mimeType = "video/webm;codecs=h264,opus";
      }

      const mediaRecorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: isDeviceMobileUA ? 1500000 : 2500000,
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        videoBlob.current = blob;

        // Parar todas as tracks do stream
        combinedStream.getTracks().forEach((track) => track.stop());
        displayStream.getTracks().forEach((track) => track.stop());

        if (micStreamRef.current) {
          micStreamRef.current.getTracks().forEach((track) => track.stop());
          micStreamRef.current = null;
        }

        try {
          await mixContext.close();
        } catch {
          // ignore
        }

        // Parar monitoramento do microfone
        stopMicMonitoring();

        setShowSaveDialog(true);
      };

      // Detectar se o usuário parou a gravação pelo navegador
      displayStream.getVideoTracks()[0].addEventListener("ended", () => {
        if (isRecordingRef.current) {
          stopRecording();
        }
      });

      mediaRecorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);

      // Adicionar classe ao body para indicar gravação ativa
      document.body.classList.add("recording-active");

      toast({
        title: "🔴 Gravação iniciada",
        description: "Sua partida está sendo gravada.",
      });
    } catch (error: any) {
      console.error("Erro ao iniciar gravação:", error);

      let errorMessage = "Não foi possível iniciar a gravação da tela.";
      if (error?.name === "NotAllowedError") {
        errorMessage = "Você precisa permitir o compartilhamento de tela.";
      } else if (error?.name === "NotSupportedError") {
        errorMessage = "Seu navegador não suporta gravação de tela.";
      }

      toast({
        title: "Erro ao gravar",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setIsRecording(false);

      // Remover classe do body
      document.body.classList.remove("recording-active");

      // Parar monitoramento
      stopMicMonitoring();
    }
  };

  const saveRecording = async () => {
    if (!videoBlob.current || !title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Por favor, insira um título para a gravação.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const fileName = `${user.id}/${Date.now()}.webm`;
      const fileSize = videoBlob.current.size;
      
      // Upload do vídeo
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('match-recordings')
        .upload(fileName, videoBlob.current, {
          contentType: 'video/webm',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Obter URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('match-recordings')
        .getPublicUrl(fileName);

      // Salvar metadados no banco IMEDIATAMENTE
      const { error: dbError } = await supabase
        .from('match_recordings')
        .insert({
          user_id: user.id,
          duel_id: duelId,
          tournament_id: tournamentId,
          title: title.trim(),
          description: description.trim() || null,
          video_url: publicUrl,
          file_size: fileSize,
          is_public: isPublic,
        });

      if (dbError) {
        console.error('Erro ao salvar no banco, tentando sincronização:', dbError);
        // Se falhar, executar sincronização como fallback
        await supabase.rpc('sync_storage_recordings');
      }

      toast({
        title: "✅ Gravação salva",
        description: "Sua gravação foi salva na galeria com sucesso!",
      });

      setShowSaveDialog(false);
      setTitle("");
      setDescription("");
      setIsPublic(false);
      videoBlob.current = null;
    } catch (error: any) {
      console.error('Erro ao salvar gravação:', error);
      
      // Tentar sincronização como último recurso
      try {
        await supabase.rpc('sync_storage_recordings');
        toast({
          title: "✅ Gravação recuperada",
          description: "Sua gravação foi sincronizada automaticamente.",
        });
        setShowSaveDialog(false);
        setTitle("");
        setDescription("");
        setIsPublic(false);
        videoBlob.current = null;
      } catch (syncError) {
        toast({
          title: "Erro ao salvar",
          description: error.message || "Não foi possível salvar a gravação.",
          variant: "destructive",
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const discardRecording = () => {
    videoBlob.current = null;
    setShowSaveDialog(false);
    setTitle("");
    setDescription("");
    setIsPublic(false);
    
    // Remover classe do body caso ainda esteja
    document.body.classList.remove('recording-active');
    
    toast({
      title: "Gravação descartada",
      description: "A gravação foi descartada.",
    });
  };

  if (accountLoading) {
    return null;
  }

  // Não mostrar o botão em dispositivos móveis
  if (isMobile) {
    return null;
  }

  if (!isPro) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        disabled
        title="Recurso exclusivo para usuários PRO"
      >
        <Video className="w-4 h-4" />
        Gravar Partida (PRO)
      </Button>
    );
  }

  return (
    <>
      {!isRecording ? (
        <Button onClick={() => setShowSetupDialog(true)} variant="outline" size="sm" className="gap-2">
          <Video className="w-4 h-4" />
          Gravar Partida
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          {/* Indicador de nível do microfone */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-background/80 rounded-md border">
            {hasMic ? (
              <>
                <Mic className="w-3.5 h-3.5 text-primary" />
                <div className="flex items-end gap-0.5 h-4">
                  {[...Array(5)].map((_, i) => {
                    const threshold = (i + 1) * 20;
                    const isActive = micLevel >= threshold;
                    return (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          isActive
                            ? micLevel > 70
                              ? "bg-destructive"
                              : micLevel > 35
                                ? "bg-accent"
                                : "bg-primary"
                            : "bg-muted-foreground/30"
                        }`}
                        style={{
                          height: `${(i + 1) * 3 + 4}px`,
                        }}
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Sem mic</span>
              </>
            )}
          </div>

          <Button onClick={stopRecording} variant="destructive" size="sm" className="gap-2 animate-pulse">
            <Square className="w-4 h-4 fill-current" />
            Parar Gravação
          </Button>
        </div>
      )}

      {/* Dialog de configuração (fonte de áudio) */}
      <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar gravação</DialogTitle>
            <DialogDescription>
              Escolha o áudio que será gravado. (Dica: para “som do jogo”, compartilhe uma aba e ative “compartilhar áudio”.)
            </DialogDescription>
          </DialogHeader>

          <RadioGroup value={audioSource} onValueChange={(v) => setAudioSource(v as RecordingAudioSource)}>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem id="audio-system" value="system" className="mt-1" />
              <div className="grid gap-1">
                <Label htmlFor="audio-system">Som do jogo (aba)</Label>
                <p className="text-xs text-muted-foreground">Grava apenas o áudio do compartilhamento (quando disponível).</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem id="audio-mic" value="mic" className="mt-1" />
              <div className="grid gap-1">
                <Label htmlFor="audio-mic">Microfone</Label>
                <p className="text-xs text-muted-foreground">Grava sua voz pelo microfone.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem id="audio-both" value="both" className="mt-1" />
              <div className="grid gap-1">
                <Label htmlFor="audio-both">Ambos</Label>
                <p className="text-xs text-muted-foreground">Mistura áudio do jogo + microfone em uma única faixa.</p>
              </div>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetupDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setShowSetupDialog(false);
                startRecording(audioSource);
              }}
            >
              Iniciar gravação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salvar Gravação</DialogTitle>
            <DialogDescription>
              Adicione informações sobre sua partida gravada
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                placeholder="Ex: Duelo épico - Final do torneio"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div>
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Adicione detalhes sobre a partida..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isProcessing}
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                {isPublic ? (
                  <Globe className="w-4 h-4 text-primary" />
                ) : (
                  <Lock className="w-4 h-4 text-muted-foreground" />
                )}
                <div>
                  <Label htmlFor="public-toggle" className="cursor-pointer">
                    Gravação pública
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isPublic ? "Todos podem assistir" : "Apenas você pode assistir"}
                  </p>
                </div>
              </div>
              <Switch
                id="public-toggle"
                checked={isPublic}
                onCheckedChange={setIsPublic}
                disabled={isProcessing}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={discardRecording}
              disabled={isProcessing}
            >
              Descartar
            </Button>
            <Button
              onClick={saveRecording}
              disabled={isProcessing || !title.trim()}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};