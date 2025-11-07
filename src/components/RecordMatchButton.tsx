import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Video, Square, Loader2, Lock, Globe } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
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

interface RecordMatchButtonProps {
  duelId: string;
  tournamentId?: string;
}

export const RecordMatchButton = ({ duelId, tournamentId }: RecordMatchButtonProps) => {
  const { toast } = useToast();
  const { isPro, loading: accountLoading } = useAccountType();
  const isMobile = useIsMobile();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoBlob = useRef<Blob | null>(null);

  // Cleanup ao desmontar componente
  useEffect(() => {
    return () => {
      // Remover classe e parar gravação ao desmontar
      document.body.classList.remove('recording-active');
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);

  const startRecording = async () => {
    if (!isPro) {
      toast({
        title: "Recurso PRO",
        description: "Apenas usuários PRO podem gravar partidas.",
        variant: "destructive",
      });
      return;
    }

    // Detectar se é mobile
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    // Verificar se a API de gravação está disponível
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      toast({
        title: "Não suportado",
        description: isMobile 
          ? "A gravação de tela não é suportada em dispositivos móveis. Use um computador para gravar suas partidas."
          : "Seu navegador não suporta gravação de tela.",
        variant: "destructive",
      });
      return;
    }

    try {
      
      const displayMediaOptions: any = {
        video: {
          displaySurface: "browser",
          width: { ideal: isMobile ? 720 : 1280 },
          height: { ideal: isMobile ? 1280 : 720 },
          frameRate: { ideal: isMobile ? 15 : 30 }
        },
        audio: true,
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      // Determinar melhor codec disponível
      let mimeType = 'video/webm;codecs=vp8,opus';
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
        mimeType = 'video/webm;codecs=vp9,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
        mimeType = 'video/webm;codecs=h264,opus';
      }

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: isMobile ? 1500000 : 2500000, // Menor bitrate para mobile
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        videoBlob.current = blob;
        
        // Parar todas as tracks do stream
        stream.getTracks().forEach(track => track.stop());
        
        setShowSaveDialog(true);
      };

      // Detectar se o usuário parou a gravação pelo navegador
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (isRecording) {
          stopRecording();
        }
      });

      mediaRecorder.start();
      setIsRecording(true);

      // Adicionar classe ao body para indicar gravação ativa
      document.body.classList.add('recording-active');

      toast({
        title: "🔴 Gravação iniciada",
        description: "Sua partida está sendo gravada.",
      });
    } catch (error: any) {
      console.error('Erro ao iniciar gravação:', error);
      
      let errorMessage = "Não foi possível iniciar a gravação da tela.";
      if (error.name === 'NotAllowedError') {
        errorMessage = "Você precisa permitir o compartilhamento de tela.";
      } else if (error.name === 'NotSupportedError') {
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
      setIsRecording(false);
      
      // Remover classe do body
      document.body.classList.remove('recording-active');
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

      // Salvar metadados no banco
      const { error: dbError } = await supabase
        .from('match_recordings')
        .insert({
          user_id: user.id,
          duel_id: duelId,
          tournament_id: tournamentId,
          title: title.trim(),
          description: description.trim() || null,
          video_url: publicUrl,
          file_size: videoBlob.current.size,
          is_public: isPublic,
        });

      if (dbError) throw dbError;

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
      toast({
        title: "Erro ao salvar",
        description: error.message || "Não foi possível salvar a gravação.",
        variant: "destructive",
      });
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
        <Button
          onClick={startRecording}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Video className="w-4 h-4" />
          Gravar Partida
        </Button>
      ) : (
        <Button
          onClick={stopRecording}
          variant="destructive"
          size="sm"
          className="gap-2 animate-pulse"
        >
          <Square className="w-4 h-4 fill-current" />
          Parar Gravação
        </Button>
      )}

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