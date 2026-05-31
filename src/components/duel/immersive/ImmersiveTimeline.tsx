import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Clock3, Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
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

export const ImmersiveTimeline = ({ events, isSpectator }: Props) => {
  const [mode, setMode] = useState<"history" | "replay">("history");
  const [replayIndex, setReplayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

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

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 top-24 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col rounded-lg border border-primary/25 bg-background/85 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase">Duel Log</span>
          {isSpectator && <Badge variant="outline" className="h-5 text-[10px]">Espectador</Badge>}
        </div>
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
