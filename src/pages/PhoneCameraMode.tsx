import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Mic, MicOff, SwitchCamera, X, Wifi, WifiOff, Battery, AlertCircle } from "lucide-react";
import { usePhoneClientPairing } from "@/hooks/usePhonePairing";

/**
 * Fullscreen "phone as webcam" mode.
 * No game UI at all — pure capture device.
 */
const PhoneCameraMode = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("s");
  const token = params.get("t");

  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [battery, setBattery] = useState<number | null>(null);
  const [initialStream, setInitialStream] = useState<MediaStream | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wakeLockRef = useRef<any>(null);

  const { status, localStream, error } = usePhoneClientPairing({
    sessionId: initialStream ? sessionId : null,
    token: initialStream ? token : null,
    facingMode,
    cameraOn,
    micOn,
    initialStream,
  });

  useEffect(() => {
    const stream = localStream || initialStream;
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [localStream, initialStream]);

  useEffect(() => {
    return () => {
      initialStream?.getTracks().forEach((track) => track.stop());
    };
  }, [initialStream]);

  // Wake lock so screen stays on
  useEffect(() => {
    const nav: any = navigator;
    if (nav?.wakeLock?.request) {
      nav.wakeLock
        .request("screen")
        .then((lock: any) => {
          wakeLockRef.current = lock;
        })
        .catch(() => {});
    }
    return () => {
      wakeLockRef.current?.release?.().catch(() => {});
    };
  }, []);

  // Battery indicator
  useEffect(() => {
    const nav: any = navigator;
    if (!nav?.getBattery) return;
    let bat: any;
    let handler: any;
    nav.getBattery().then((b: any) => {
      bat = b;
      handler = () => setBattery(Math.round(b.level * 100));
      handler();
      b.addEventListener("levelchange", handler);
    });
    return () => bat?.removeEventListener?.("levelchange", handler);
  }, []);

  const startTransmission = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setInitialStream(stream);
      setCameraOn(stream.getVideoTracks().length > 0);
      setMicOn(stream.getAudioTracks().length > 0);
    } catch (e: any) {
      const name = e?.name;
      const message =
        name === "NotAllowedError"
          ? "Permita o acesso à câmera e ao microfone para conectar ao PC."
          : name === "NotFoundError"
            ? "Nenhuma câmera ou microfone foi encontrado neste celular."
            : e?.message || "Falha ao iniciar câmera/microfone.";
      setStartError(message);
    } finally {
      setStarting(false);
    }
  };

  const handleExit = () => navigate("/", { replace: true });

  if (!sessionId || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="mb-4">Sessão de pareamento inválida.</p>
          <Button onClick={() => navigate("/phone-connect")}>Escanear novamente</Button>
        </div>
      </div>
    );
  }

  const statusColor =
    status === "connected"
      ? "bg-emerald-500"
      : status === "connecting" || status === "waiting"
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col z-[100]">
      {/* Top status bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-black/60 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
          <span className="capitalize">
            {status === "waiting" && "Aguardando PC"}
            {status === "connecting" && "Conectando..."}
            {status === "connected" && "Conectado"}
            {status === "disconnected" && "Desconectado"}
            {status === "idle" && "Inicializando"}
            {status === "error" && "Erro"}
          </span>
          {status === "connected" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {battery !== null && (
            <span className="flex items-center gap-1">
              <Battery className="h-3.5 w-3.5" />
              {battery}%
            </span>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-white hover:bg-white/10"
            onClick={handleExit}
            title="Desconectar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Video preview */}
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {!initialStream ? (
          <div className="px-6 text-center flex flex-col items-center gap-4">
            <Camera className="h-16 w-16 text-white/70" />
            <div className="space-y-2">
              <h1 className="text-xl font-bold">Celular pronto para conectar</h1>
              <p className="text-sm text-white/70">
                Toque no botão abaixo para liberar câmera e microfone e iniciar a transmissão para o PC.
              </p>
            </div>
            <Button onClick={startTransmission} size="lg" disabled={starting} className="rounded-full px-6">
              {starting ? "Iniciando..." : "Iniciar transmissão"}
            </Button>
            {startError && (
              <div className="flex items-start gap-2 rounded bg-rose-600/90 p-3 text-left text-sm text-white">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{startError}</span>
              </div>
            )}
          </div>
        ) : cameraOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-white/60 flex flex-col items-center gap-2">
            <CameraOff className="h-14 w-14" />
            <span>Câmera desligada</span>
          </div>
        )}
        {error && (
          <div className="absolute bottom-20 left-4 right-4 bg-rose-600/90 text-white text-sm p-3 rounded">
            {error}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="px-4 py-4 bg-black/70 backdrop-blur-sm flex items-center justify-around">
        <Button
          variant={cameraOn ? "default" : "secondary"}
          size="lg"
          className="rounded-full h-14 w-14 p-0"
          onClick={() => setCameraOn((v) => !v)}
          disabled={!initialStream}
          title="Ligar/desligar câmera"
        >
          {cameraOn ? <Camera className="h-6 w-6" /> : <CameraOff className="h-6 w-6" />}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="rounded-full h-14 w-14 p-0"
          onClick={() => setFacingMode((f) => (f === "user" ? "environment" : "user"))}
          disabled={!initialStream || !cameraOn}
          title="Alternar câmera"
        >
          <SwitchCamera className="h-6 w-6" />
        </Button>
        <Button
          variant={micOn ? "default" : "secondary"}
          size="lg"
          className="rounded-full h-14 w-14 p-0"
          onClick={() => setMicOn((v) => !v)}
          disabled={!initialStream}
          title="Ligar/desligar microfone"
        >
          {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </Button>
      </div>
    </div>
  );
};

export default PhoneCameraMode;
