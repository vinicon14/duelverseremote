/**
 * DuelRoomAudioControls
 *
 * Floating audio controls available in the Duel Room.
 * - Toggles the global background music on/off (uses the same BGM that
 *   plays elsewhere in the platform).
 * - Lets the user adjust volume; the choice is persisted to localStorage
 *   via `setBgmVolume`.
 * - Does NOT force autoplay; the global <BackgroundMusic> mounter waits
 *   for the first user gesture before starting.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Volume2, VolumeX, Music2 } from "lucide-react";
import { getBgmMuted, toggleBgm } from "@/components/BackgroundMusic";
import { getBgmVolume, setBgmVolume } from "@/utils/bgm";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Compact mode: smaller button, fits inside a control bar. */
  compact?: boolean;
}

export const DuelRoomAudioControls = ({ className, compact }: Props) => {
  const [muted, setMuted] = useState<boolean>(() => getBgmMuted());
  const [volume, setVolume] = useState<number>(() => getBgmVolume());

  useEffect(() => {
    const onState = (e: Event) => {
      const m = (e as CustomEvent).detail?.muted;
      if (typeof m === "boolean") setMuted(m);
    };
    window.addEventListener("duelverse:bgm-state", onState);
    return () => window.removeEventListener("duelverse:bgm-state", onState);
  }, []);

  const handleToggle = () => {
    toggleBgm();
  };

  const handleVolume = (v: number[]) => {
    const next = Math.max(0, Math.min(1, (v[0] ?? 0) / 100));
    setVolume(next);
    setBgmVolume(next);
  };

  const size = compact ? "sm" : "default";

  return (
    <div className={cn("flex items-center", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size={size}
            aria-label="Música de fundo"
            className={cn(
              "bg-card/95 backdrop-blur-sm",
              compact ? "h-11 w-11 min-h-[44px] min-w-[44px] p-0" : "min-h-[44px]"
            )}
            title="Música de fundo"
          >
            <Music2 className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-64 p-3 z-[100]"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">Música de fundo</span>
            <Button
              type="button"
              size="sm"
              variant={muted ? "outline" : "default"}
              onClick={handleToggle}
              className="min-h-[36px]"
            >
              {muted ? (
                <>
                  <VolumeX className="w-4 h-4 mr-1" /> Ligar
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 mr-1" /> Desligar
                </>
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 text-muted-foreground shrink-0" />
            <Slider
              value={[Math.round(volume * 100)]}
              min={0}
              max={100}
              step={1}
              onValueChange={handleVolume}
              aria-label="Volume da música"
            />
            <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {muted
              ? "A música está silenciada. Toque em Ligar para ativar."
              : `Volume: ${Math.round(volume * 100)}%`}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DuelRoomAudioControls;
