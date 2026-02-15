import { useEffect, useRef, useState, useCallback } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    DailyIframe: typeof DailyIframe;
  }
}

interface MultiDeviceVideoCallProps {
  roomUrl: string;
  username: string;
  userId: string;
  className?: string;
}

interface DeviceSession {
  sessionId: string;
  isPrimary: boolean;
  hasMedia: boolean;
}

export const MultiDeviceVideoCall = ({ 
  roomUrl, 
  username, 
  userId,
  className 
}: MultiDeviceVideoCallProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const callObjectRef = useRef<ReturnType<typeof DailyIframe.createCallObject> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  
  // Estado para multi-device
  const [hasOtherDevice, setHasOtherDevice] = useState(false);
  const otherDeviceRef = useRef<DeviceSession | null>(null);

  // Gerar ID único para esta sessão
  const sessionId = useRef(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  // Sincronizar estado com outro dispositivo via Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`device-sync-${userId}`)
      .on('broadcast', { event: `device-state-${userId}` }, ({ payload }) => {
        console.log('📡 Device state sync:', payload);
        
        if (payload.sessionId !== sessionId.current) {
          // Outro dispositivo
          otherDeviceRef.current = payload;
          setHasOtherDevice(true);
          
          // Se outro dispositivo tem mídia ativa, desabilitar controls localmente
          if (payload.hasMedia && !isMuted) {
            setIsMuted(true);
            callObjectRef.current?.setLocalAudio(false);
          }
          if (payload.hasMedia && !isVideoOff) {
            setIsVideoOff(true);
            callObjectRef.current?.setLocalVideo(false);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Função para broadcast do estado atual
  const broadcastDeviceState = useCallback(async (state: Partial<DeviceSession>) => {
    const channel = supabase.channel(`device-sync-${userId}`);
    await channel.send({
      type: 'broadcast',
      event: `device-state-${userId}`,
      payload: {
        sessionId: sessionId.current,
        ...state,
        isPrimary: !hasOtherDevice,
      }
    });
  }, [userId, hasOtherDevice]);

  const joinCall = useCallback(async () => {
    if (!roomUrl || !containerRef.current) return;

    try {
      setIsLoading(true);
      setError(null);

      // Criar call object
      const callObject = DailyIframe.createCallObject({
        showLeaveButton: true,
        showFullscreenButton: true,
      });

      callObjectRef.current = callObject;

      // Eventos
      callObject.on('joined-meeting', () => {
        console.log('✅ Joined meeting');
        setIsLoading(false);
        setMySessionId(sessionId.current);
        
        // Broadcast que entrou
        broadcastDeviceState({ hasMedia: true });
      });

      callObject.on('left-meeting', () => {
        console.log('👋 Left meeting');
        callObject.destroy();
        callObjectRef.current = null;
      });

      callObject.on('participant-joined', (evt) => {
        console.log('👤 Participant joined:', evt);
        setParticipants((prev) => [...prev, evt.participant]);
      });

      callObject.on('participant-left', (evt) => {
        console.log('👤 Participant left:', evt);
        setParticipants((prev) => prev.filter(p => p.session_id !== evt.participant.session_id));
      });

      callObject.on('error', (evt) => {
        console.error('Daily.co error:', evt);
        setError(evt?.errorMsg || 'Erro na chamada');
        setIsLoading(false);
      });

      // Timeout de 15 segundos
      const timeoutId = setTimeout(() => {
        if (isLoading) {
          console.warn('Timeout joining meeting');
          setError('Tempo esgotado ao entrar na sala');
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
    }
  }, [roomUrl, username, isLoading, broadcastDeviceState]);

  // Controlar microfone
  const toggleMute = useCallback(() => {
    if (!callObjectRef.current) return;
    
    const newMuted = !isMuted;
    callObjectRef.current.setLocalAudio(!newMuted);
    setIsMuted(newMuted);
    
    // Sync com outro dispositivo
    broadcastDeviceState({ hasMedia: !newMuted });
  }, [isMuted, broadcastDeviceState]);

  // Controlar câmera
  const toggleVideo = useCallback(() => {
    if (!callObjectRef.current) return;
    
    const newVideoOff = !isVideoOff;
    callObjectRef.current.setLocalVideo(!newVideoOff);
    setIsVideoOff(newVideoOff);
    
    // Sync com outro dispositivo
    broadcastDeviceState({ hasMedia: !newVideoOff });
  }, [isVideoOff, broadcastDeviceState]);

  useEffect(() => {
    joinCall();

    return () => {
      if (callObjectRef.current) {
        callObjectRef.current.leave();
        callObjectRef.current.destroy();
      }
    };
  }, [joinCall]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Video Container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Loading */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white">Entrando na sala...</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center space-y-4 p-4">
            <p className="text-red-400">{error}</p>
            <button 
              onClick={joinCall}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Controls */}
      {mySessionId && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full ${isMuted ? 'bg-red-500' : 'bg-gray-700'} text-white`}
            title={isMuted ? "Ativar microfone" : "Desativar microfone"}
          >
            {isMuted ? "🔇" : "🎤"}
          </button>
          
          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full ${isVideoOff ? 'bg-red-500' : 'bg-gray-700'} text-white`}
            title={isVideoOff ? "Ativar câmera" : "Desativar câmera"}
          >
            {isVideoOff ? "📵" : "📹"}
          </button>

          {hasOtherDevice && (
            <div className="px-3 py-2 bg-yellow-600 rounded-full text-white text-sm flex items-center gap-1">
              <span>📱</span>
              <span>Sincronizado</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
