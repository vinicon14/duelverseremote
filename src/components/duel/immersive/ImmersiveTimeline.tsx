import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Clock3, Maximize2, Minimize2, Move, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import type { DuelEvent } from "@/hooks/useDuelEvents";

type Props = {
  events: DuelEvent[];
  isSpectator?: boolean;
};

const IMPORTANT_EVENTS = new Set([
  "mode_started",
  "lp_change",
  "lp_set",
  "summon",
  "duel_finished",
  "deck_search",
  "deck_shuffle",
]);

const eventTone = (eventType: string) => {
  if (eventType.includes("summon")) return "text-primary";
  if (eventType.includes("lp")) return "text-emerald-400";
  if (eventType.includes("finish")) return "text-destructive";
  return "text-muted-foreground";
};

const STORAGE_KEY = "duelverse_immersive_timeline_layout_v1";
const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 440;
const MINI_WIDTH = 172;
const MINI_HEIGHT = 44;
const EDGE_PADDING = 12;

type TimelineLayout = {
  x: number;
  y: number;
  minimized: boolean;
};

const defaultLayout = (): TimelineLayout => ({
  x: EDGE_PADDING,
  y: Math.min(96, Math.max(EDGE_PADDING, window.innerHeight - PANEL_HEIGHT - EDGE_PADDING)),
  minimized: false,
});

const clampLayout = (layout: TimelineLayout): TimelineLayout => {
  const width = layout.minimized ? MINI_WIDTH : PANEL_WIDTH;
  const height = layout.minimized ? MINI_HEIGHT : PANEL_HEIGHT;
  const maxX = Math.max(EDGE_PADDING, window.innerWidth - width - EDGE_PADDING);
  const maxY = Math.max(EDGE_PADDING, window.innerHeight - height - EDGE_PADDING);

  return {
    ...layout,
    x: Math.min(Math.max(layout.x, EDGE_PADDING), maxX),
    y: Math.min(Math.max(layout.y, EDGE_PADDING), maxY),
  };
};

export const ImmersiveTimeline = ({ events, isSpectator }: Props) => {
  const [mode, setMode] = useState<"history" | "replay">("history");
  const [replayIndex, setReplayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [layout, setLayout] = useState<TimelineLayout>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return clampLayout({ ...defaultLayout(), ...JSON.parse(saved) });
    } catch (error) {
      console.warn("[immersive] timeline layout load skipped:", error);
    }
    return defaultLayout();
  });
  const [dragging, setDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const visibleEvents = useMemo(() => events.slice(-40), [events]);
  const selectedEvent = events[replayIndex] || events[events.length - 1] || null;

  useEffect(() => {
    if (!events.length) {
      setReplayIndex(0);
      return;
    }
    if (mode === "history") {
      setReplayIndex(events.length - 1);
    }
  }, [events.length, mode]);

  useEffect(() => {
    if (!playing || mode !== "replay" || events.length === 0) return;
    const timer = window.setInterval(() => {
      setReplayIndex((prev) => {
        if (prev >= events.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [playing, mode, events.length]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch (error) {
      console.warn("[immersive] timeline layout save skipped:", error);
    }
  }, [layout]);

  useEffect(() => {
    const handleResize = () => setLayout((current) => clampLayout(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (event: PointerEvent) => {
      setLayout((current) =>
        clampLayout({
          ...current,
          x: event.clientX - dragOffsetRef.current.x,
          y: event.clientY - dragOffsetRef.current.y,
        })
      );
    };

    const handleUp = () => setDragging(false);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
    window.addEventListener("pointercancel", handleUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [dragging]);

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragOffsetRef.current = {
        x: event.clientX - layout.x,
        y: event.clientY - layout.y,
      };
      setDragging(true);
    },
    [layout.x, layout.y]
  );

  const toggleMinimized = () => {
    setLayout((current) => clampLayout({ ...current, minimized: !current.minimized }));
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (layout.minimized) {
    return (
      <div
        className="pointer-events-auto absolute z-10 flex h-11 w-[172px] items-center gap-2 rounded-full border border-primary/35 bg-background/85 px-2 shadow-xl backdrop-blur-md"
        style={{ left: layout.x, top: layout.y }}
      >
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 cursor-move items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
            dragging && "bg-muted text-foreground"
          )}
          onPointerDown={startDrag}
          aria-label="Mover log do duelo"
          title="Mover"
        >
          <Move className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={toggleMinimized}
          aria-label="Restaurar log do duelo"
          title="Restaurar"
        >
          <Clock3 className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-xs font-semibold uppercase">Duel Log</span>
          <Badge variant="outline" className="ml-auto h-5 px-1.5 text-[10px]">
            {events.length}
          </Badge>
        </button>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={toggleMinimized}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto absolute z-10 flex h-[min(27.5rem,calc(100vh-7rem))] w-[min(20rem,calc(100vw-1.5rem))] flex-col rounded-lg border border-primary/25 bg-background/85 shadow-xl backdrop-blur-md"
      style={{ left: layout.x, top: layout.y }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-2">
        <div
          className={cn(
            "flex min-w-0 flex-1 cursor-move items-center gap-2 rounded-md px-1 py-1",
            dragging && "bg-muted/60"
          )}
          onPointerDown={startDrag}
          title="Arrastar log do duelo"
        >
          <Move className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Clock3 className="h-4 w-4 text-primary" />
          <span className="truncate text-xs font-semibold uppercase">Duel Log</span>
          {isSpectator && <Badge variant="outline" className="h-5 text-[10px]">Espectador</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex rounded-md border border-border/60 p-0.5">
            <Button
              type="button"
              size="sm"
              variant={mode === "history" ? "secondary" : "ghost"}
              className="h-6 px-2 text-[10px]"
              onClick={() => setMode("history")}
            >
              Histórico
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "replay" ? "secondary" : "ghost"}
              className="h-6 px-2 text-[10px]"
              onClick={() => setMode("replay")}
            >
              Replay
            </Button>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={toggleMinimized}
            aria-label="Minimizar log do duelo"
            title="Minimizar"
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {mode === "history" ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            {visibleEvents.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Aguardando eventos públicos.</p>
            ) : (
              visibleEvents.map((event) => (
                <div
                  key={event.id}
                  className={cn(
                    "rounded-md border border-border/50 bg-background/45 p-2",
                    IMPORTANT_EVENTS.has(event.event_type) && "border-primary/30"
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={cn("text-[10px] font-semibold uppercase", eventTone(event.event_type))}>
                      {event.event_type.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{formatTime(event.created_at)}</span>
                  </div>
                  <p className="text-xs leading-snug">{event.message}</p>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          <div className="rounded-md border border-border/60 bg-background/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Badge variant="outline" className="text-[10px]">
                {events.length ? `${replayIndex + 1}/${events.length}` : "0/0"}
              </Badge>
              {selectedEvent && (
                <span className="font-mono text-[10px] text-muted-foreground">{formatTime(selectedEvent.created_at)}</span>
              )}
            </div>
            <p className="min-h-10 text-sm leading-snug">
              {selectedEvent?.message || "Sem snapshots públicos para replay."}
            </p>
          </div>

          <div className="flex items-center justify-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setReplayIndex(0)}
              disabled={!events.length}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setReplayIndex((prev) => Math.max(0, prev - 1))}
              disabled={!events.length}
            >
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="h-8 w-8"
              onClick={() => setPlaying((prev) => !prev)}
              disabled={!events.length}
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              onClick={() => setReplayIndex((prev) => Math.min(events.length - 1, prev + 1))}
              disabled={!events.length}
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
