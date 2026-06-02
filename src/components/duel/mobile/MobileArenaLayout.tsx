import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Heart, Plus } from "lucide-react";
import { DuelRoomAudioControls } from "@/components/duel/DuelRoomAudioControls";

interface Props {
  active: boolean;
  onRequestSplitVideo?: () => void;
  myLp?: number;
  opponentLp?: number;
  focusMode?: boolean;
  onToggleFocusMode?: (value: boolean) => void;
  onQuickDraw?: () => void;
}

export const MobileArenaLayout = ({
  active,
  onRequestSplitVideo,
  myLp,
  opponentLp,
  focusMode = false,
  onToggleFocusMode,
  onQuickDraw,
}: Props) => {
  useEffect(() => {
    if (!active) return;

    onRequestSplitVideo?.();
    document.body.classList.add("mobile-arena-active");

    return () => {
      document.body.classList.remove("mobile-arena-active");
    };
  }, [active, onRequestSplitVideo]);

  if (!active) return null;

  return (
    <div className="fixed top-2 left-2 right-2 z-[70] pointer-events-none flex items-center gap-1">
      <div className="pointer-events-auto h-8 rounded-md bg-black/65 border border-white/10 backdrop-blur-sm px-2 flex items-center gap-1 text-white">
        <Heart className="h-3.5 w-3.5 text-sky-300" />
        <span className="text-[10px] uppercase tracking-wide">Voce</span>
        <span className="text-xs font-bold tabular-nums">{myLp ?? "-"}</span>
      </div>

      <div className="pointer-events-auto h-8 rounded-md bg-black/65 border border-white/10 backdrop-blur-sm px-2 flex items-center gap-1 text-white">
        <Heart className="h-3.5 w-3.5 text-rose-300" />
        <span className="text-[10px] uppercase tracking-wide">Oponente</span>
        <span className="text-xs font-bold tabular-nums">{opponentLp ?? "-"}</span>
      </div>

      <div className="ml-auto pointer-events-auto flex items-center gap-1">
        {onQuickDraw && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onQuickDraw}
            className="h-8 w-8 bg-sky-600/95 hover:bg-sky-700 text-white border-sky-400/40"
            title="Comprar carta"
            aria-label="Comprar carta"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant={focusMode ? "default" : "outline"}
          size="icon"
          onClick={() => onToggleFocusMode?.(!focusMode)}
          className="h-8 w-8 bg-background/90"
          aria-pressed={focusMode}
          title="Modo foco"
        >
          {focusMode ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </Button>
        <DuelRoomAudioControls compact />
      </div>
    </div>
  );
};

export default MobileArenaLayout;
