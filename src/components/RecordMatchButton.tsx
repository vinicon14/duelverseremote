import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Video, Square, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
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

interface RecordMatchButtonProps {
  duelId: string;
  tournamentId?: string;
}

export const RecordMatchButton = ({ duelId, tournamentId }: RecordMatchButtonProps) => {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoBlob = useRef<Blob | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8,opus',
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

      mediaRecorder.start();
      setIsRecording(true);

      toast({
        title: "🔴 Gravação iniciada",
        description: "Sua partida está sendo gravada.",
      });
    } catch (error: any) {
      console.error('Erro ao iniciar gravação:', error);
      toast({
        title: "Erro ao gravar",
        description: "Não foi possível iniciar a gravação da tela.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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
        });

      if (dbError) throw dbError;

      toast({
        title: "✅ Gravação salva",
        description: "Sua gravação foi salva na galeria com sucesso!",
      });

      setShowSaveDialog(false);
      setTitle("");
      setDescription("");
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
    toast({
      title: "Gravação descartada",
      description: "A gravação foi descartada.",
    });
  };

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