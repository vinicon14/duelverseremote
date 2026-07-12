import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Mic, MicOff, SwitchCamera, X, Wifi, WifiOff, Battery } from "lucide-react";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const wakeLockRef = useRef<any>(null);

  const { status, localStream, error } = usePhoneClientPairing({
    sessionId,
    token,
    facingMode,
    cameraOn,
    micOn,
  });

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

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
        {cameraOn ? (
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
          title="Ligar/desligar câmera"
        >
          {cameraOn ? <Camera className="h-6 w-6" /> : <CameraOff className="h-6 w-6" />}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="rounded-full h-14 w-14 p-0"
          onClick={() => setFacingMode((f) => (f === "user" ? "environment" : "user"))}
          disabled={!cameraOn}
          title="Alternar câmera"
        >
          <SwitchCamera className="h-6 w-6" />
        </Button>
        <Button
          variant={micOn ? "default" : "secondary"}
          size="lg"
          className="rounded-full h-14 w-14 p-0"
          onClick={() => setMicOn((v) => !v)}
          title="Ligar/desligar microfone"
        >
          {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </Button>
      </div>
    </div>
  );
};

export default PhoneCameraMode;
