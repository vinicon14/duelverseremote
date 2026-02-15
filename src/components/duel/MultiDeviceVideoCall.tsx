import { useEffect, useRef, useState, useCallback } from 'react';
import DailyIframe from '@daily-co/daily-js';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    __dailyCallObject: ReturnType<typeof DailyIframe.createCallObject> | null;
    __dailyRoomUrl: string | null;
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [mySessionId, setMySessionId] = useState<string | null>(null);
  
  const [hasOtherDevice, setHasOtherDevice] = useState(false);
  const otherDeviceRef = useRef<DeviceSession | null>(null);
  const hasJoinedRef = useRef(false);

  const sessionId = useRef(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  const callObject = useRef<ReturnType<typeof DailyIframe.createCallObject> | null>(null);

  // Sincronizar estado com outro dispositivo via Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`device-sync-${userId}`)
      .on('broadcast', { event: `device-state-${userId}` }, ({ payload }) => {
        console.log('📡 Device state sync:', payload);
        
        if (payload.sessionId !== sessionId.current) {
          otherDeviceRef.current = payload;
          setHasOtherDevice(true);
          
          if (payload.hasMedia && !isMuted) {
            setIsMuted(true);
            callObject.current?.setLocalAudio(false);
          }
          if (payload.hasMedia && !isVideoOff) {
            setIsVideoOff(true);
            callObject.current?.setLocalVideo(false);
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, isMuted, isVideoOff]);

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

  const toggleMute = useCallback(() => {
    if (!callObject.current) return;
    
    const newMuted = !isMuted;
    callObject.current.setLocalAudio(!newMuted);
    setIsMuted(newMuted);
    broadcastDeviceState({ hasMedia: !newMuted });
  }, [isMuted, broadcastDeviceState]);

  const toggleVideo = useCallback(() => {
    if (!callObject.current) return;
    
    const newVideoOff = !isVideoOff;
    callObject.current.setLocalVideo(!newVideoOff);
    setIsVideoOff(newVideoOff);
    broadcastDeviceState({ hasMedia: !newVideoOff });
  }, [isVideoOff, broadcastDeviceState]);

  const joinCall = useCallback(async () => {
    if (hasJoinedRef.current || !roomUrl || !containerRef.current) return;
    hasJoinedRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

      // Usar instância global ou criar nova
      if (!window.__dailyCallObject || window.__dailyRoomUrl !== roomUrl) {
        if (window.__dailyCallObject) {
          window.__dailyCallObject.destroy();
        }
        window.__dailyCallObject = DailyIframe.createCallObject({
          showLeaveButton: true,
          showFullscreenButton: true,
        });
        window.__dailyRoomUrl = roomUrl;
      }

      callObject.current = window.__dailyCallObject;

      callObject.current.on('joined-meeting', () => {
        console.log('✅ Joined meeting');
        setIsLoading(false);
        setMySessionId(sessionId.current);
        broadcastDeviceState({ hasMedia: true });
      });

      callObject.current.on('left-meeting', () => {
        console.log('👋 Left meeting');
        hasJoinedRef.current = false;
      });

      callObject.current.on('error', (evt: any) => {
        console.error('Daily.co error:', evt);
        setError(evt?.errorMsg || 'Erro na chamada');
        setIsLoading(false);
      });

      const timeoutId = setTimeout(() => {
        if (isLoading) {
          console.warn('Timeout joining meeting');
          setError('Tempo esgotado ao entrar na sala');
          setIsLoading(false);
        }
      }, 15000);

      await callObject.current.join({
        url: roomUrl,
        userName: username,
      });

      clearTimeout(timeoutId);

    } catch (err: any) {
      console.error('Error joining call:', err);
      setError(err.message || 'Erro ao entrar na chamada');
      setIsLoading(false);
      hasJoinedRef.current = false;
    }
  }, [roomUrl, username, isLoading, broadcastDeviceState]);

  useEffect(() => {
    joinCall();

    return () => {
      // Não destruir a instância ao desmontar - outras abas podem estar usando
    };
  }, [joinCall]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="w-full h-full" />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-white">Entrando na sala...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center space-y-4 p-4">
            <p className="text-red-400">{error}</p>
            <button 
              onClick={() => { hasJoinedRef.current = false; joinCall(); }}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

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
