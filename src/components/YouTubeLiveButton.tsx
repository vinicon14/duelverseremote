/**
 * DuelVerse - Botão de Gravação de Duelo
 * Desenvolvido por Vinícius
 * 
 * Grava a tela do duelo e permite download do vídeo.
 * Para live no YouTube, instrui o usuário a usar OBS.
 */
import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Radio, Square, Loader2, Download, Monitor } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAccountType } from "@/hooks/useAccountType";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface YouTubeLiveButtonProps {
  duelId: string;
}

export const YouTubeLiveButton = ({ duelId }: YouTubeLiveButtonProps) => {
  const { toast } = useToast();
  const { isPro, loading: accountLoading } = useAccountType();

  const [isRecording, setIsRecording] = useState(false);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }

    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach(t => t.stop());
      displayStreamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  const startRecording = async () => {
    setIsConnecting(true);
    chunksRef.current = [];

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      });

      displayStreamRef.current = displayStream;

      displayStream.getVideoTracks()[0].addEventListener('ended', () => {
        stopRecording();
        toast({
          title: "Gravação encerrada",
          description: "O compartilhamento de tela foi interrompido.",
        });
      });

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm;codecs=vp8,opus';

      const mediaRecorder = new MediaRecorder(displayStream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setShowDownloadDialog(true);
        mediaRecorderRef.current = null;
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setShowSetupDialog(false);

      toast({
        title: "🔴 Gravação iniciada!",
        description: "Sua tela está sendo gravada. Clique em 'Parar' quando terminar.",
      });

    } catch (error: any) {
      console.error('Erro ao iniciar gravação:', error);
      let msg = "Não foi possível iniciar a gravação.";
      if (error?.name === 'NotAllowedError') {
        msg = "Você precisa permitir o compartilhamento de tela.";
      }
      toast({
        title: "Erro ao iniciar gravação",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const downloadRecording = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `duel-${duelId}-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Download iniciado!", description: "O vídeo está sendo baixado." });
  };

  if (accountLoading) return null;

  if (!isPro) {
    return (
      <Button variant="outline" size="sm" className="gap-2" disabled title="Recurso exclusivo para usuários PRO">
        <Radio className="w-4 h-4" />
        Gravar (PRO)
      </Button>
    );
  }

  return (
    <>
      {!isRecording ? (
        <Button onClick={() => setShowSetupDialog(true)} variant="outline" size="sm" className="gap-2 text-red-500 border-red-500/30 hover:bg-red-500/10">
          <Radio className="w-4 h-4" />
          Gravar Duelo
        </Button>
      ) : (
        <Button onClick={stopRecording} variant="destructive" size="sm" className="gap-2 animate-pulse">
          <Square className="w-4 h-4 fill-current" />
          Parar Gravação
        </Button>
      )}

      {/* Setup Dialog */}
      <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="w-5 h-5 text-red-500" />
              Gravar Duelo
            </DialogTitle>
            <DialogDescription>
              Grave seu duelo para assistir depois ou enviar ao YouTube.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm space-y-2">
              <p className="font-semibold">Como funciona:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>Clique em <strong>"Iniciar Gravação"</strong></li>
                <li>Selecione a aba/tela do duelo para compartilhar</li>
                <li>Quando terminar, clique em <strong>"Parar Gravação"</strong></li>
                <li>Baixe o vídeo e envie ao YouTube se quiser</li>
              </ol>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-2 border border-border">
              <p className="font-semibold flex items-center gap-2">
                <Monitor className="w-4 h-4" />
                Quer fazer live no YouTube?
              </p>
              <p className="text-muted-foreground">
                Para transmitir ao vivo, use o <strong>OBS Studio</strong> (gratuito). 
                Configure sua chave RTMP do YouTube Studio no OBS e capture a tela do duelo.
              </p>
              <a 
                href="https://obsproject.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary underline text-xs"
              >
                Baixar OBS Studio →
              </a>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetupDialog(false)} disabled={isConnecting}>
              Cancelar
            </Button>
            <Button onClick={startRecording} disabled={isConnecting} className="bg-red-600 hover:bg-red-700 text-white">
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Preparando...
                </>
              ) : (
                <>
                  <Radio className="w-4 h-4 mr-2" />
                  Iniciar Gravação
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Dialog */}
      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gravação finalizada! 🎉</DialogTitle>
            <DialogDescription>
              Seu duelo foi gravado com sucesso. Baixe o vídeo abaixo.
            </DialogDescription>
          </DialogHeader>

          {recordedBlob && (
            <p className="text-sm text-muted-foreground">
              Tamanho: {(recordedBlob.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>
              Fechar
            </Button>
            <Button onClick={downloadRecording} className="gap-2">
              <Download className="w-4 h-4" />
              Baixar Vídeo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
