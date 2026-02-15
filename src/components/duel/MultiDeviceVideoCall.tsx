import { useEffect, useRef, useState, useCallback } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { Button } from '@/components/ui/button';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  Settings,
  Monitor,
  User
} from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Device {
  deviceId: string;
  label: string;
}

interface MultiDeviceVideoCallProps {
  roomUrl: string;
  username: string;
  userId: string;
  className?: string;
}

export const MultiDeviceVideoCall = ({ 
  roomUrl, 
  username, 
  userId,
  className 
}: MultiDeviceVideoCallProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<any>(null);
  const isInitialized = useRef(false);
  
  const [isJoined, setIsJoined] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  
  const [audioDevices, setAudioDevices] = useState<Device[]>([]);
  const [videoDevices, setVideoDevices] = useState<Device[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('default');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string>('default');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const [participants, setParticipants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const enumerateDevices = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach(track => track.stop());
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audio = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Microfone ${d.deviceId.slice(0, 4)}` }));
      
      const video = devices
        .filter(d => d.kind === 'videoinput')
        .map(d => ({ deviceId: d.deviceId, label: d.label || `Câmera ${d.deviceId.slice(0, 4)}` }));
      
      setAudioDevices(audio);
      setVideoDevices(video);
    } catch (err) {
      console.error('Error enumerating devices:', err);
    }
  }, []);

  const joinCall = useCallback(async () => {
    if (!roomUrl || isInitialized.current) return;

    try {
      setError(null);
      setIsLoading(true);

      if (callRef.current) {
        try {
          await callRef.current.leave();
        } catch (e) {}
        callRef.current.destroy();
        callRef.current = null;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      if (!containerRef.current) {
        console.log('Container not ready');
        return;
      }

      const callObject = DailyIframe.createFrame(containerRef.current, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '8px',
        },
        showLeaveButton: false,
        showFullscreenButton: true,
      });

      callRef.current = callObject;
      isInitialized.current = true;

      callObject.on('joined-meeting', () => {
        setIsJoined(true);
        setIsLoading(false);
        console.log('Joined meeting as:', username);
      });

      callObject.on('left-meeting', () => {
        setIsJoined(false);
        setIsLoading(false);
        console.log('Left meeting');
      });

      callObject.on('error', (evt: any) => {
        console.error('Daily.co error:', evt);
        setError(evt?.errorMsg || 'Erro na chamada');
        setIsLoading(false);
      });

      // Timeout de 15 segundos para evitar loop infinito
      const timeoutId = setTimeout(() => {
        if (!isJoined) {
          console.warn('Timeout ao entrar na sala, usando fallback iframe');
          setUseFallback(true);
          setIsLoading(false);
        }
      }, 15000);

      await callObject.join({
        url: roomUrl,
        userName: username,
      });

      clearTimeout(timeoutId);

    } catch (err: any) {
      console.error('Error joining call:', err);
      setError(err.message || 'Erro ao entrar na chamada');
      setIsLoading(false);
      isInitialized.current = false;
      setUseFallback(true);
    }
  }, [roomUrl, username, isJoined]);

  const leaveCall = useCallback(async () => {
    if (callRef.current) {
      try {
        await callRef.current.leave();
      } catch (e) {}
      callRef.current.destroy();
      callRef.current = null;
      isInitialized.current = false;
    }
    setIsJoined(false);
    setParticipants([]);
  }, []);

  const toggleAudio = useCallback(async () => {
    if (!callRef.current) return;
    
    try {
      if (isAudioEnabled) {
        await callRef.current.setLocalAudio(false);
      } else {
        await callRef.current.setLocalAudio(true);
      }
      setIsAudioEnabled(!isAudioEnabled);
    } catch (err) {
      console.error('Error toggling audio:', err);
    }
  }, [isAudioEnabled]);

  const toggleVideo = useCallback(async () => {
    if (!callRef.current) return;
    
    try {
      if (isVideoEnabled) {
        await callRef.current.setLocalVideo(false);
      } else {
        await callRef.current.setLocalVideo(true);
      }
      setIsVideoEnabled(!isVideoEnabled);
    } catch (err) {
      console.error('Error toggling video:', err);
    }
  }, [isVideoEnabled]);

  const toggleScreenShare = useCallback(async () => {
    if (!callRef.current) return;

    try {
      if (isScreenSharing) {
        await callRef.current.stopScreenShare();
        setIsScreenSharing(false);
      } else {
        await callRef.current.startScreenShare();
        setIsScreenSharing(true);
      }
    } catch (err) {
      console.error('Screen share error:', err);
    }
  }, [isScreenSharing]);

  const changeAudioDevice = useCallback(async (deviceId: string) => {
    setSelectedAudioDevice(deviceId);
    console.log('Audio device selected:', deviceId);
  }, []);

  const changeVideoDevice = useCallback(async (deviceId: string) => {
    setSelectedVideoDevice(deviceId);
    console.log('Video device selected:', deviceId);
  }, []);

  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  useEffect(() => {
    if (!roomUrl) return;

    const timer = setTimeout(() => {
      joinCall();
    }, 500);

    return () => {
      clearTimeout(timer);
      if (callRef.current) {
        callRef.current.leave().catch(() => {});
        callRef.current.destroy();
        callRef.current = null;
        isInitialized.current = false;
      }
    };
  }, [roomUrl]);

  return (
    <div className={cn("relative h-full w-full bg-black rounded-lg overflow-hidden", className)}>
      {(isLoading || (!isJoined && !error)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white">Entrando na sala...</p>
          </div>
        </div>
      )}

      {error && !useFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-center space-y-4 p-4">
            <p className="text-red-400">{error}</p>
            <Button onClick={() => { isInitialized.current = false; joinCall(); }} variant="outline">
              Tentar novamente
            </Button>
          </div>
        </div>
      )}

      {/* Fallback para iframe quando SDK falha */}
      {useFallback && (
        <iframe
          src={roomUrl}
          allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
          className="w-full h-full"
          title="Daily.co Video Call"
        />
      )}

      {!useFallback && <div ref={containerRef} className="w-full h-full" />}

      {isJoined && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 backdrop-blur-sm p-2 rounded-full">
          <Button
            variant={isAudioEnabled ? "default" : "destructive"}
            size="icon"
            className="rounded-full w-10 h-10"
            onClick={toggleAudio}
            title={isAudioEnabled ? "Desativar microfone" : "Ativar microfone"}
          >
            {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>

          <Button
            variant={isVideoEnabled ? "default" : "destructive"}
            size="icon"
            className="rounded-full w-10 h-10"
            onClick={toggleVideo}
            title={isVideoEnabled ? "Desativar câmera" : "Ativar câmera"}
          >
            {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </Button>

          <Button
            variant={isScreenSharing ? "default" : "outline"}
            size="icon"
            className="rounded-full w-10 h-10"
            onClick={toggleScreenShare}
            title={isScreenSharing ? "Parar compartilhamento" : "Compartilhar tela"}
          >
            <Monitor className="h-4 w-4" />
          </Button>

          <Popover open={showSettings} onOpenChange={setShowSettings}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full w-10 h-10"
                title="Configurações"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" side="top">
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Microfone
                  </label>
                  <Select value={selectedAudioDevice} onValueChange={changeAudioDevice}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar microfone" />
                    </SelectTrigger>
                    <SelectContent>
                      {audioDevices.map(device => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Câmera
                  </label>
                  <Select value={selectedVideoDevice} onValueChange={changeVideoDevice}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar câmera" />
                    </SelectTrigger>
                    <SelectContent>
                      {videoDevices.map(device => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="destructive"
            size="icon"
            className="rounded-full w-10 h-10"
            onClick={leaveCall}
            title="Sair da chamada"
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-white flex items-center gap-2">
          <User className="w-3 h-3" />
          {username}
        </div>
        
        {participants.length > 0 && (
          <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-xs text-white">
            {participants.length + 1} participantes
          </div>
        )}
      </div>
    </div>
  );
};
