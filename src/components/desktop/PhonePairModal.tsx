import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Smartphone, CheckCircle2, X } from "lucide-react";
import { useHostPairing } from "@/hooks/usePhonePairing";
import { usePhoneStream } from "@/contexts/PhoneStreamContext";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStream?: (stream: MediaStream | null) => void;
}

export const PhonePairModal = ({ open, onOpenChange, onStream }: Props) => {
  // Only initialize pairing when modal is open
  if (!open) return null;
  return <PhonePairModalInner open={open} onOpenChange={onOpenChange} onStream={onStream} />;
};

const PhonePairModalInner = ({ open, onOpenChange, onStream }: Props) => {
  const { sessionId, token, status, remoteStream, disconnect } = useHostPairing();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const pairUrl = `${window.location.origin}/phone-connect?s=${sessionId}&t=${token}`;

  useEffect(() => {
    QRCode.toDataURL(pairUrl, { width: 300, margin: 2 }).then(setQrDataUrl).catch(() => {});
  }, [pairUrl]);

  useEffect(() => {
    onStream?.(remoteStream);
  }, [remoteStream, onStream]);

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleClose = () => {
    disconnect();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? handleClose() : onOpenChange(v))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Conectar celular como câmera
          </DialogTitle>
          <DialogDescription>
            Abra o app Duelverse no seu celular, toque em <b>Conectar ao Computador</b> e escaneie o QR abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {status !== "connected" && (
            <>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR de pareamento" className="rounded-lg border bg-white p-2" />
              ) : (
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              )}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {status === "waiting" && "Aguardando celular..."}
                  {status === "connecting" && "Conectando..."}
                </div>
              </div>
              <details className="w-full text-xs text-muted-foreground">
                <summary className="cursor-pointer">Não consegue escanear? Abrir URL manualmente</summary>
                <p className="mt-2 break-all font-mono text-[10px]">{pairUrl}</p>
              </details>
            </>
          )}

          {status === "connected" && (
            <>
              <div className="flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Celular conectado!</span>
              </div>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full max-w-sm rounded-lg border bg-black aspect-video object-contain"
              />
              <p className="text-xs text-muted-foreground text-center">
                A câmera do celular está sendo transmitida. Mantenha o app aberto durante a partida.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            <X className="h-4 w-4 mr-1" />
            {status === "connected" ? "Desconectar" : "Fechar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhonePairModal;
