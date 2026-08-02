import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff, Mic, MicOff, SwitchCamera, X, Wifi, WifiOff, Battery, AlertCircle, MessageCircle, RotateCw } from "lucide-react";
import { usePhoneClientPairing } from "@/hooks/usePhonePairing";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GlobalChat } from "@/components/GlobalChat";

/**
 * Fullscreen "phone as webcam" mode.
 * No game UI at all — pure capture device.
 * Supports software rotation (0/90/180/270) so the PC always sees a landscape
 * feed even if the phone is held vertically. Rotation is applied at capture
 * time via canvas.captureStream() so peers receive the rotated video too.
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
  const [rawStream, setRawStream] = useState<MediaStream | null>(null);
  const [outboundStream, setOutboundStream] = useState<MediaStream | null>(null);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wakeLockRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rotateVideoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  // Try to lock screen orientation to landscape when rotation != 0
  useEffect(() => {
    const scr: any = window.screen;
    if (rotation !== 0 && scr?.orientation?.lock) {
      scr.orientation.lock("landscape").catch(() => {});
    }
    return () => {
      scr?.orientation?.unlock?.();
    };
  }, [rotation]);

  const { status, localStream, error } = usePhoneClientPairing({
    sessionId: outboundStream ? sessionId : null,
    token: outboundStream ? token : null,
    facingMode,
    cameraOn,
    micOn,
    initialStream: outboundStream,
  });

  useEffect(() => {
    const stream = localStream || outboundStream;
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [localStream, outboundStream]);

  useEffect(() => {
    return () => {
      rawStream?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [rawStream]);

  // Wake lock
  useEffect(() => {
    const nav: any = navigator;
    if (nav?.wakeLock?.request) {
      nav.wakeLock.request("screen").then((lock: any) => { wakeLockRef.current = lock; }).catch(() => {});
    }
    return () => { wakeLockRef.current?.release?.().catch(() => {}); };
  }, []);

  useEffect(() => {
    const nav: any = navigator;
    if (!nav?.getBattery) return;
    let bat: any; let handler: any;
    nav.getBattery().then((b: any) => {
      bat = b;
      handler = () => setBattery(Math.round(b.level * 100));
      handler();
      b.addEventListener("levelchange", handler);
    });
    return () => bat?.removeEventListener?.("levelchange", handler);
  }, []);

  // Keep the raw camera track in sync with the on/off toggle so the rotated
  // canvas output also goes dark when the camera is turned off.
  useEffect(() => {
    rawStream?.getVideoTracks().forEach((t) => { t.enabled = cameraOn; });
    rawStream?.getAudioTracks().forEach((t) => { t.enabled = micOn; });
  }, [rawStream, cameraOn, micOn]);

  // Build a rotated MediaStream from rawStream using a canvas render loop.
  const buildRotatedStream = useCallback(async (raw: MediaStream, rot: number): Promise<MediaStream> => {
    if (rot === 0) return raw;
    const videoTrack = raw.getVideoTracks()[0];
    if (!videoTrack) return raw;

    // Hidden <video> playing the raw camera feed
    const vEl = document.createElement("video");
    vEl.autoplay = true;
    vEl.playsInline = true;
    vEl.muted = true;
    vEl.srcObject = new MediaStream([videoTrack]);
    await vEl.play().catch(() => {});
    await new Promise<void>((resolve) => {
      if (vEl.videoWidth > 0) return resolve();
      vEl.onloadedmetadata = () => resolve();
    });

    const sw = vEl.videoWidth || 720;
    const sh = vEl.videoHeight || 1280;
    const swap = rot === 90 || rot === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swap ? sh : sw;
    canvas.height = swap ? sw : sh;
    const ctx = canvas.getContext("2d")!;

    const draw = () => {
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(vEl, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    rotateVideoRef.current = vEl;
    canvasRef.current = canvas;

    const rotated = (canvas as any).captureStream(30) as MediaStream;
    // Attach audio from raw
    raw.getAudioTracks().forEach((t) => rotated.addTrack(t));
    return rotated;
  }, []);

  // Whenever rotation or rawStream changes, rebuild the outbound stream.
  useEffect(() => {
    if (!rawStream) return;
    let cancelled = false;
    // stop existing rotation loop
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    rotateVideoRef.current?.pause();
    rotateVideoRef.current = null;
    canvasRef.current = null;

    buildRotatedStream(rawStream, rotation).then((s) => {
      if (!cancelled) setOutboundStream(s);
    });
    return () => { cancelled = true; };
  }, [rawStream, rotation, buildRotatedStream]);

  const startTransmission = async () => {
    setStartError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setRawStream(stream);
      setCameraOn(stream.getVideoTracks().length > 0);
      setMicOn(stream.getAudioTracks().length > 0);
    } catch (e: any) {
      const name = e?.name;
      const message =
        name === "NotAllowedError" ? "Permita o acesso à câmera e ao microfone para conectar ao PC."
        : name === "NotFoundError" ? "Nenhuma câmera ou microfone foi encontrado neste celular."
        : e?.message || "Falha ao iniciar câmera/microfone.";
      setStartError(message);
    } finally {
      setStarting(false);
    }
  };

  // Reacquire the camera when the user switches front/back.
  const switchCamera = async () => {
    if (!rawStream || switching) return;
    const next: "user" | "environment" = facingMode === "user" ? "environment" : "user";
    setSwitching(true);
    setStartError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      setFacingMode(next);
      setRawStream(stream);
    } catch (e: any) {
      setStartError(e?.message || "Não foi possível alternar a câmera.");
    } finally {
      setSwitching(false);
    }
  };

  const rotateCamera = () => {
    setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270);
  };


  const handleExit = () => navigate("/", { replace: true });

  if (!sessionId || !token) {
    return (
      <div className="h-[100dvh] overflow-hidden flex items-center justify-center p-6 text-center">
        <div>
          <p className="mb-4">Sessão de pareamento inválida.</p>
          <Button onClick={() => navigate("/phone-connect")}>Escanear novamente</Button>
        </div>
      </div>
    );
  }

  const statusColor =
    status === "connected" ? "bg-emerald-500"
    : status === "connecting" || status === "waiting" ? "bg-amber-500"
    : "bg-rose-500";

  return (
    <div className="fixed inset-0 h-[100dvh] max-h-[100dvh] overflow-hidden bg-black text-white flex flex-col z-[9999] overscroll-none touch-none">
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 bg-black/60 backdrop-blur-sm">
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
          {rotation !== 0 && <span className="ml-1 rounded bg-white/20 px-1 py-0.5 text-[10px]">↻ {rotation}°</span>}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {battery !== null && (
            <span className="flex items-center gap-1">
              <Battery className="h-3.5 w-3.5" />
              {battery}%
            </span>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={handleExit} title="Desconectar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        {!outboundStream ? (
          <div className="px-5 text-center flex flex-col items-center gap-3 max-h-full max-w-sm">
            <Camera className="h-12 w-12 shrink-0 text-white/70" />
            <div className="space-y-1">
              <h1 className="text-lg font-bold">Celular pronto para conectar</h1>
              <p className="text-sm text-white/70">
                Toque no botão abaixo para liberar câmera e microfone e iniciar a transmissão para o PC.
              </p>
            </div>
            <Button onClick={startTransmission} size="lg" disabled={starting} className="rounded-full px-6">
              {starting ? "Iniciando..." : "Iniciar transmissão"}
            </Button>
            {startError && (
              <div className="flex items-start gap-2 rounded bg-rose-600/90 p-2 text-left text-xs text-white">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{startError}</span>
              </div>
            )}
          </div>
        ) : cameraOn ? (
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
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

      <div className="shrink-0 px-4 py-3 bg-black/70 backdrop-blur-sm flex items-center justify-around">
        <Button variant={cameraOn ? "default" : "secondary"} size="lg" className="rounded-full h-12 w-12 p-0" onClick={() => setCameraOn((v) => !v)} disabled={!outboundStream} title="Ligar/desligar câmera">
          {cameraOn ? <Camera className="h-6 w-6" /> : <CameraOff className="h-6 w-6" />}
        </Button>
        <Button variant="secondary" size="lg" className="rounded-full h-12 w-12 p-0" onClick={() => setFacingMode((f) => (f === "user" ? "environment" : "user"))} disabled={!outboundStream || !cameraOn} title="Alternar câmera">
          <SwitchCamera className="h-6 w-6" />
        </Button>
        <Button variant="secondary" size="lg" className="rounded-full h-12 w-12 p-0" onClick={rotateCamera} disabled={!outboundStream || !cameraOn} title="Girar 90° (horizontal via software)">
          <RotateCw className="h-6 w-6" />
        </Button>
        <Button variant={micOn ? "default" : "secondary"} size="lg" className="rounded-full h-12 w-12 p-0" onClick={() => setMicOn((v) => !v)} disabled={!outboundStream} title="Ligar/desligar microfone">
          {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="secondary" size="lg" className="rounded-full h-12 w-12 p-0" title="Chat global">
              <MessageCircle className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85dvh] p-0 flex flex-col">
            <SheetHeader className="px-4 py-3 border-b">
              <SheetTitle>Chat Global</SheetTitle>
            </SheetHeader>
            <div className="flex-1 min-h-0 overflow-hidden p-3">
              <GlobalChat />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
};

export default PhoneCameraMode;
