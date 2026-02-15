import { Smartphone, Monitor, Mic, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DeviceType } from '@/hooks/useMultiDeviceSync';

interface ConnectedDevice {
  deviceType: DeviceType;
  joinedAt: string;
}

interface DeviceSyncPanelProps {
  connectedDevices: ConnectedDevice[];
  preferences: { audioDevice: DeviceType; videoDevice: DeviceType };
  currentDevice: DeviceType;
  onSetAudioDevice: (d: DeviceType) => void;
  onSetVideoDevice: (d: DeviceType) => void;
}

const DeviceIcon = ({ type, className }: { type: DeviceType; className?: string }) =>
  type === 'mobile' ? <Smartphone className={className} /> : <Monitor className={className} />;

const deviceLabel = (type: DeviceType) => (type === 'mobile' ? 'Celular' : 'Computador');

export const DeviceSyncPanel = ({
  connectedDevices,
  preferences,
  currentDevice,
  onSetAudioDevice,
  onSetVideoDevice,
}: DeviceSyncPanelProps) => {
  if (connectedDevices.length < 2) return null;

  return (
    <div className="absolute top-4 left-4 z-20 bg-black/80 backdrop-blur-sm rounded-lg p-3 space-y-3 max-w-[220px]">
      <p className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
        📱💻 Multi-Dispositivo Ativo
      </p>

      {/* Connected devices */}
      <div className="flex gap-1.5">
        {connectedDevices.map(d => (
          <div
            key={d.deviceType}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xs',
              d.deviceType === currentDevice
                ? 'bg-primary/30 text-primary-foreground border border-primary/50'
                : 'bg-white/10 text-white/70'
            )}
          >
            <DeviceIcon type={d.deviceType} className="w-3 h-3" />
            <span>{deviceLabel(d.deviceType)}</span>
            {d.deviceType === currentDevice && <span className="text-[10px]">(este)</span>}
          </div>
        ))}
      </div>

      {/* Audio source selector */}
      <div className="space-y-1">
        <p className="text-[10px] text-white/60 uppercase tracking-wider flex items-center gap-1">
          <Mic className="w-3 h-3" /> Microfone
        </p>
        <div className="flex gap-1">
          {connectedDevices.map(d => (
            <Button
              key={d.deviceType}
              size="sm"
              variant={preferences.audioDevice === d.deviceType ? 'default' : 'outline'}
              className={cn(
                'h-7 text-xs gap-1 flex-1',
                preferences.audioDevice === d.deviceType
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
              )}
              onClick={() => onSetAudioDevice(d.deviceType)}
            >
              <DeviceIcon type={d.deviceType} className="w-3 h-3" />
              {deviceLabel(d.deviceType)}
            </Button>
          ))}
        </div>
      </div>

      {/* Video source selector */}
      <div className="space-y-1">
        <p className="text-[10px] text-white/60 uppercase tracking-wider flex items-center gap-1">
          <Video className="w-3 h-3" /> Câmera
        </p>
        <div className="flex gap-1">
          {connectedDevices.map(d => (
            <Button
              key={d.deviceType}
              size="sm"
              variant={preferences.videoDevice === d.deviceType ? 'default' : 'outline'}
              className={cn(
                'h-7 text-xs gap-1 flex-1',
                preferences.videoDevice === d.deviceType
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/20'
              )}
              onClick={() => onSetVideoDevice(d.deviceType)}
            >
              <DeviceIcon type={d.deviceType} className="w-3 h-3" />
              {deviceLabel(d.deviceType)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
