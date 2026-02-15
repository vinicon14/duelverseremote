import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type DeviceType = 'desktop' | 'mobile';

interface DevicePreferences {
  audioDevice: DeviceType;
  videoDevice: DeviceType;
}

interface ConnectedDevice {
  deviceType: DeviceType;
  joinedAt: string;
}

const detectDeviceType = (): DeviceType => {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
};

export const useMultiDeviceSync = (roomUrl: string, userId: string) => {
  const deviceType = useRef<DeviceType>(detectDeviceType());
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [preferences, setPreferences] = useState<DevicePreferences>({
    audioDevice: deviceType.current,
    videoDevice: deviceType.current,
  });
  const [isMultiDevice, setIsMultiDevice] = useState(false);
  const channelRef = useRef<any>(null);

  const channelName = `multi-device:${userId}:${roomUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(-30)}`;

  const broadcastPreferences = useCallback((newPrefs: DevicePreferences) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'device-prefs',
        payload: newPrefs,
      });
    }
  }, []);

  const setAudioDevice = useCallback((device: DeviceType) => {
    setPreferences(prev => {
      const updated = { ...prev, audioDevice: device };
      broadcastPreferences(updated);
      return updated;
    });
  }, [broadcastPreferences]);

  const setVideoDevice = useCallback((device: DeviceType) => {
    setPreferences(prev => {
      const updated = { ...prev, videoDevice: device };
      broadcastPreferences(updated);
      return updated;
    });
  }, [broadcastPreferences]);

  // Should this device have its audio/video enabled?
  const isAudioActive = preferences.audioDevice === deviceType.current;
  const isVideoActive = preferences.videoDevice === deviceType.current;

  useEffect(() => {
    if (!roomUrl || !userId) return;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: `${userId}_${deviceType.current}` } },
    });

    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const devices: ConnectedDevice[] = [];
        Object.entries(state).forEach(([key, presences]) => {
          if (key.startsWith(`${userId}_`)) {
            const dType = key.replace(`${userId}_`, '') as DeviceType;
            devices.push({ deviceType: dType, joinedAt: (presences as any)[0]?.joined_at || '' });
          }
        });
        setConnectedDevices(devices);
        setIsMultiDevice(devices.length > 1);
      })
      .on('broadcast', { event: 'device-prefs' }, ({ payload }) => {
        if (payload) {
          setPreferences(payload as DevicePreferences);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            device_type: deviceType.current,
            joined_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomUrl, userId, channelName]);

  return {
    deviceType: deviceType.current,
    connectedDevices,
    isMultiDevice,
    preferences,
    isAudioActive,
    isVideoActive,
    setAudioDevice,
    setVideoDevice,
  };
};
