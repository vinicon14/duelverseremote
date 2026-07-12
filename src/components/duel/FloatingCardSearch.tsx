import { useState, useRef, useEffect, useCallback } from "react";
import { useYugiohCards, YugiohCard } from "@/hooks/useYugiohCards";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  X,
  Maximize2,
  Minimize2,
  GripVertical,
  BookOpen,
  ArrowLeft,
  Loader2,
  Star,
  Swords,
  Shield,
  Layers,
} from "lucide-react";

const STORAGE_KEY = "duelverse.floating-card-search";
const DEBOUNCE_MS = 400;

interface Persisted {
  x: number;
  y: number;
  w: number;
  h: number;
  minimized: boolean;
  open: boolean;
}

const defaultState = (): Persisted => ({
  x: 20,
  y: 20,
  w: 360,
  h: 480,
  minimized: false,
  open: false,
});

const loadState = (): Persisted => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return { ...defaultState(), ...JSON.parse(raw) };
  } catch {
    return defaultState();
  }
};

/**
 * Floating "Card Search" window for use during a Duelverse match.
 * Desktop-only. Reuses the same YGO card API as the Deck Builder.
 * Purely for lookup — never touches LP, chat, camera, timers or the simulator.
 */
export const FloatingCardSearch = () => {
  const [state, setState] = useState<Persisted>(() => loadState());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<YugiohCard | null>(null);
  const [history, setHistory] = useState<YugiohCard[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOff = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const { cards, loading, searchCards } = useYugiohCards();

  // Persist window state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // Debounced search
  useEffect(() => {
    if (!state.open) return;
    const q = query.trim();
    if (q.length < 2) return;
    const t = setTimeout(() => {
      searchCards({ name: q }, "pt");
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, searchCards, state.open]);

  // Dragging
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      setState((s) => ({
        ...s,
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOff.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOff.current.y)),
      }));
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging]);

  // Resizing
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      setState((s) => ({
        ...s,
        w: Math.max(300, Math.min(720, resizeStart.current.w + dx)),
        h: Math.max(320, Math.min(window.innerHeight - 40, resizeStart.current.h + dy)),
      }));
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, input")) return;
      dragOff.current = { x: e.clientX - state.x, y: e.clientY - state.y };
      setIsDragging(true);
    },
    [state.x, state.y],
  );

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      resizeStart.current = { x: e.clientX, y: e.clientY, w: state.w, h: state.h };
      setIsResizing(true);
    },
    [state.w, state.h],
  );

  const openCard = (card: YugiohCard) => {
    setSelected(card);
    setHistory((h) => (h[h.length - 1]?.id === card.id ? h : [...h, card]));
  };

  const goBack = () => {
    setHistory((h) => {
      const next = h.slice(0, -1);
      setSelected(next[next.length - 1] ?? null);
      return next;
    });
  };

  const toggleOpen = () => setState((s) => ({ ...s, open: !s.open }));
  const toggleMin = () => setState((s) => ({ ...s, minimized: !s.minimized }));

  // Trigger button when closed
  if (!state.open) {
    return (
      <Button
        onClick={toggleOpen}
        variant="secondary"
        size="sm"
        className="fixed bottom-4 left-4 z-[999] shadow-lg gap-2 backdrop-blur bg-card/80 border border-primary/30"
        title="Buscar Cartas"
      >
        <BookOpen className="h-4 w-4" />
        Buscar Cartas
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Busca de Cartas"
      style={{
        position: "fixed",
        left: state.x,
        top: state.y,
        width: state.w,
        height: state.minimized ? undefined : state.h,
        zIndex: 1001, // acima do FloatingCalculator (1000)
        cursor: isDragging ? "grabbing" : undefined,
      }}
      className="select-none rounded-xl border-2 border-primary/30 bg-card/85 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-2 py-1.5 border-b border-primary/20 bg-primary/10 cursor-grab active:cursor-grabbing"
        onMouseDown={startDrag}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
          <BookOpen className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-semibold text-gradient-mystic truncate">
            Busca de Cartas
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={toggleMin} title={state.minimized ? "Expandir" : "Minimizar"}>
            {state.minimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={toggleOpen} title="Fechar">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {!state.minimized && (
        <>
          {/* Search */}
          <div className="p-2 border-b border-primary/10">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(null);
                  setHistory([]);
                }}
                placeholder="Nome da carta..."
                className="h-8 pl-7 text-sm bg-background/60"
              />
              {loading && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 relative">
            {selected ? (
              <CardDetail
                card={selected}
                canGoBack={history.length > 1}
                onBack={goBack}
                onClearSelection={() => {
                  setSelected(null);
                  setHistory([]);
                }}
              />
            ) : (
              <ScrollArea className="h-full">
                <div className="p-2">
                  {query.trim().length < 2 && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Digite ao menos 2 letras para buscar
                    </p>
                  )}
                  {query.trim().length >= 2 && !loading && cards.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Nenhuma carta encontrada
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-1.5">
                    {cards.slice(0, 60).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => openCard(c)}
                        className="relative group rounded overflow-hidden hover:ring-2 hover:ring-primary transition"
                        title={c.name}
                      >
                        <img
                          src={c.card_images[0]?.image_url_small}
                          alt={c.name}
                          loading="lazy"
                          className="w-full aspect-[59/86] object-cover"
                        />
                        <div className="absolute inset-x-0 bottom-0 bg-black/70 opacity-0 group-hover:opacity-100 transition p-1">
                          <span className="text-[10px] text-white line-clamp-2 font-medium">
                            {c.name}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={startResize}
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-60 hover:opacity-100"
            style={{
              background:
                "linear-gradient(135deg, transparent 50%, hsl(var(--primary) / 0.6) 50%)",
            }}
            title="Redimensionar"
          />
        </>
      )}
    </div>
  );
};

const CardDetail = ({
  card,
  canGoBack,
  onBack,
  onClearSelection,
}: {
  card: YugiohCard;
  canGoBack: boolean;
  onBack: () => void;
  onClearSelection: () => void;
}) => {
  const isMonster = !card.type.includes("Spell") && !card.type.includes("Trap");
  const isLink = card.type.includes("Link");
  const isXyz = card.type.includes("XYZ");
  const isPendulum = card.type.includes("Pendulum");

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {canGoBack && (
              <Button size="sm" variant="ghost" onClick={onBack} className="h-7 gap-1 text-xs">
                <ArrowLeft className="w-3 h-3" />
                Voltar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onClearSelection} className="h-7 text-xs">
              Resultados
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <img
            src={card.card_images[0]?.image_url}
            alt={card.name}
            className="w-32 rounded shadow-md shrink-0"
          />
          <div className="min-w-0 space-y-2">
            <h3 className="font-bold text-sm leading-tight">{card.name}</h3>
            <div className="flex flex-wrap gap-1">
              <Badge variant="secondary" className="text-[10px]">{card.type}</Badge>
              {card.attribute && (
                <Badge variant="outline" className="text-[10px]">{card.attribute}</Badge>
              )}
              <Badge variant="outline" className="text-[10px]">{card.race}</Badge>
              {card.archetype && (
                <Badge className="text-[10px] bg-primary/20">{card.archetype}</Badge>
              )}
            </div>
            {isMonster && (
              <div className="flex flex-wrap gap-2 text-xs">
                {!isLink && card.level !== undefined && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500" />
                    {isXyz ? "Rank" : "Nv"}: {card.level}
                  </span>
                )}
                {isLink && card.linkval !== undefined && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-blue-400" />
                    Link: {card.linkval}
                  </span>
                )}
                {isPendulum && card.scale !== undefined && (
                  <span className="text-purple-400 font-semibold">Escala: {card.scale}</span>
                )}
                <span className="flex items-center gap-1">
                  <Swords className="w-3 h-3 text-red-500" />
                  ATK: {card.atk ?? "?"}
                </span>
                {!isLink && (
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3 text-blue-500" />
                    DEF: {card.def ?? "?"}
                  </span>
                )}
              </div>
            )}
            {isLink && card.linkmarkers && (
              <p className="text-[10px] text-muted-foreground">
                Markers: {card.linkmarkers.join(", ")}
              </p>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold mb-1 text-primary">Efeito</h4>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {card.desc}
          </p>
        </div>
      </div>
    </ScrollArea>
  );
};

export default FloatingCardSearch;
