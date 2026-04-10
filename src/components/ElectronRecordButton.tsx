import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Video, Square, Loader2, Mic, MicOff } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface DesktopSource {
  id: string;
  name: string;
  thumbnail: string;
}

type AudioSource = "system" | "mic" | "both";

/**
 * Recording button exclusively for the Electron (native PC) version.
 * Uses desktopCapturer sources + getDisplayMedia via setDisplayMediaRequestHandler.
 * Falls back to saving locally via system dialog if Supabase upload isn't needed.
 */
export const ElectronRecordButton = ({ duelId }: { duelId: string }) => {
  const { toast } = useToast();
  const { isPro, loading: accountLoading } = useAccountType();

  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [audioSource, setAudioSource] = useState<AudioSource>("both");
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [selectedId, setSelectedId] = useState("");

  const [hasMic, setHasMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const electronAPI = (window as any).electronAPI;
  const isElectron = !!electronAPI?.isElectron;

  const loadSources = useCallback(async () => {
    if (!electronAPI?.getDesktopSources) return;
    try {
      const s = await electronAPI.getDesktopSources();
      setSources(s || []);
      if (s?.length && !selectedId) setSelectedId(s[0].id);
    } catch (e) {
      console.warn("[ElectronRecord] Failed to load sources:", e);
    }
  }, [electronAPI, selectedId]);

  const startMicMonitor = useCallback((stream: MediaStream) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyserRef.current = analyser;
    analyser.fftSize = 256;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(buf);
      const avg = buf.reduce((a, b) => a + b) / buf.length;
      setMicLevel(Math.min(100, (avg / 128) * 100));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const stopMicMonitor = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
    analyserRef.current = null;
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    setMicLevel(0);
    setHasMic(false);
  }, []);

  useEffect(() => {
    return () => {
      document.body.classList.remove("recording-active");
      if (recorderRef.current?.state === "recording") {
        try { recorderRef.current.stop(); } catch {}
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      stopMicMonitor();
    };
  }, [stopMicMonitor]);

  // Don't render at all if not Electron
  if (!isElectron) return null;

  const startRecording = async (src: AudioSource) => {
    if (!isPro) {
      toast({ title: "Recurso PRO", description: "Apenas usuários PRO podem gravar.", variant: "destructive" });
      return;
    }

    // Tell main process which source we picked
    if (selectedId) electronAPI.setSelectedSource(selectedId);

    stopMicMonitor();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    try {
      // getDisplayMedia triggers setDisplayMediaRequestHandler in main process
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: src !== "mic",
      });

      // Mic
      let micStream: MediaStream | null = null;
      if (src === "mic" || src === "both") {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
          micStreamRef.current = micStream;
        } catch (e) {
          console.warn("[ElectronRecord] Mic unavailable:", e);
          if (src === "mic") {
            displayStream.getTracks().forEach((t) => t.stop());
            toast({ title: "Microfone bloqueado", description: "Permita o acesso ao microfone.", variant: "destructive" });
            return;
          }
        }
      }

      // Mix audio
      const mixCtx = new AudioContext();
      if (mixCtx.state === "suspended") await mixCtx.resume();
      const dest = mixCtx.createMediaStreamDestination();

      const displayAudio = displayStream.getAudioTracks();
      if (src !== "mic" && displayAudio.length > 0) {
        const s = mixCtx.createMediaStreamSource(new MediaStream(displayAudio));
        s.connect(dest);
      }

      const micTrack = micStream?.getAudioTracks()?.[0];
      if (micTrack?.readyState === "live") {
        const s = mixCtx.createMediaStreamSource(micStream!);
        s.connect(dest);
        setHasMic(true);
        startMicMonitor(micStream!);
      }

      const combined = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find((m) => MediaRecorder.isTypeSupported(m));

      const recorder = new MediaRecorder(combined, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2500000,
      });

      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
        combined.getTracks().forEach((t) => t.stop());
        displayStream.getTracks().forEach((t) => t.stop());
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        try { await mixCtx.close(); } catch {}
        stopMicMonitor();
        document.body.classList.remove("recording-active");

        // Save locally via Electron dialog
        await saveLocally(blob);
      };

      displayStream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (isRecordingRef.current) stopRecording();
      });

      recorder.start();
      isRecordingRef.current = true;
      setIsRecording(true);
      document.body.classList.add("recording-active");
      toast({ title: "🔴 Gravação iniciada", description: "Gravando sua tela..." });
    } catch (error: any) {
      console.error("[ElectronRecord] Error:", error);
      let msg = "Não foi possível iniciar a gravação.";
      if (error?.name === "NotAllowedError") msg = "Permissão de captura de tela negada.";
      else if (error?.message) msg = error.message;
      toast({ title: "Erro ao gravar", description: msg, variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop();
      isRecordingRef.current = false;
      setIsRecording(false);
      stopMicMonitor();
    }
  };

  const saveLocally = async (blob: Blob) => {
    setIsSaving(true);
    try {
      const now = new Date();
      const defaultName = `DuelVerse_${now.toISOString().slice(0, 10)}_${now.getHours()}h${String(now.getMinutes()).padStart(2, "0")}.webm`;

      const arrayBuffer = await blob.arrayBuffer();
      const result = await electronAPI.saveFileLocally(arrayBuffer, defaultName);

      if (result?.success) {
        toast({ title: "✅ Gravação salva!", description: `Salva em: ${result.filePath}` });
      } else if (result?.reason === "canceled") {
        toast({ title: "Gravação descartada", description: "Você cancelou o salvamento." });
      } else {
        toast({ title: "Erro ao salvar", description: result?.reason || "Erro desconhecido", variant: "destructive" });
      }
    } catch (e: any) {
      console.error("[ElectronRecord] Save error:", e);
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (accountLoading) return null;

  if (!isPro) {
    return (
      <Button variant="outline" size="sm" disabled title="Recurso exclusivo PRO">
        <Video className="w-4 h-4 mr-1" />
        <span className="hidden sm:inline">Gravar (PRO)</span>
      </Button>
    );
  }

  return (
    <>
      {!isRecording ? (
        <Button
          onClick={() => { loadSources(); setShowSetup(true); }}
          variant="outline"
          size="sm"
          disabled={isSaving}
          className="gap-1"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
          <span className="hidden sm:inline">{isSaving ? "Salvando..." : "Gravar"}</span>
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-background/80 rounded-md border">
            {hasMic ? (
              <>
                <Mic className="w-3.5 h-3.5 text-primary" />
                <div className="flex items-end gap-0.5 h-4">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        micLevel >= (i + 1) * 20
                          ? micLevel > 70 ? "bg-destructive" : micLevel > 35 ? "bg-accent" : "bg-primary"
                          : "bg-muted-foreground/30"
                      }`}
                      style={{ height: `${(i + 1) * 3 + 4}px` }}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Sem mic</span>
              </>
            )}
          </div>
          <Button onClick={stopRecording} variant="destructive" size="sm" className="gap-1 animate-pulse">
            <Square className="w-4 h-4 fill-current" />
            <span className="hidden sm:inline">Parar</span>
          </Button>
        </div>
      )}

      <Dialog open={showSetup} onOpenChange={setShowSetup}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gravar Tela (Desktop)</DialogTitle>
            <DialogDescription>
              Escolha a janela/tela e a fonte de áudio. A gravação será salva no seu computador.
            </DialogDescription>
          </DialogHeader>

          {sources.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Fonte de captura</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {sources.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`cursor-pointer rounded-lg border-2 p-1.5 transition-colors ${
                      selectedId === s.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <img src={s.thumbnail} alt={s.name} className="w-full h-20 object-contain rounded bg-black" />
                    <p className="text-[10px] text-center mt-1 truncate text-foreground">{s.name}</p>
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={loadSources}>
                🔄 Atualizar fontes
              </Button>
            </div>
          )}

          <RadioGroup value={audioSource} onValueChange={(v) => setAudioSource(v as AudioSource)}>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem id="el-audio-system" value="system" className="mt-1" />
              <div className="grid gap-1">
                <Label htmlFor="el-audio-system">Som do sistema</Label>
                <p className="text-xs text-muted-foreground">Grava o áudio do sistema (loopback).</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem id="el-audio-mic" value="mic" className="mt-1" />
              <div className="grid gap-1">
                <Label htmlFor="el-audio-mic">Microfone</Label>
                <p className="text-xs text-muted-foreground">Grava sua voz pelo microfone.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem id="el-audio-both" value="both" className="mt-1" />
              <div className="grid gap-1">
                <Label htmlFor="el-audio-both">Ambos</Label>
                <p className="text-xs text-muted-foreground">Sistema + microfone juntos.</p>
              </div>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetup(false)}>Cancelar</Button>
            <Button onClick={() => { setShowSetup(false); startRecording(audioSource); }}>
              Iniciar gravação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
