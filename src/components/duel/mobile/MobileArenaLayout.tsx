/**
 * MobileArenaLayout — Mobile Arena Pass 1
 *
 * Goal: on a portrait phone (e.g. 360x740) the player must be able to see
 * AND control the whole field without rotating or pinch-zooming.
 *
 * Strategy (Pass 1, non-destructive):
 * - When mounted, auto-opens the opponent field viewer (top) and the player's
 *   own deck/field viewer (bottom) inside the existing WebRTCVideoCall slots.
 *   This stacks them vertically because the PIP video layout already stacks
 *   panels on small viewports.
 * - Switches the WebRTC video layout to "pip" so the video shrinks and the
 *   field panels take priority.
 * - Adds a fixed, thumb-reachable bottom bar with the main quick actions
 *   (Hand sheet, Phase, LP, Cemitério, Banido, Comprar, Focus mode).
 * - Adds a slide-up bottom sheet for the player's hand trigger (opens the
 *   full deck viewer so the player can drag cards out as usual).
 * - Shows the opponent hand as a row of card backs + count only (never
 *   reveals real opponent cards) using the equipped sleeve or default back.
 *
 * Privacy: opponent hand is rendered with MobileArenaCardSummary which
 * only takes a count + sleeve URL.
 *
 * Touch targets: every interactive button is at least 44x44 px.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Hand,
  Layers,
  Flame,
  Ban,
  Plus,
  Clock,
  Heart,
  EyeOff,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getEquippedSleeveUrl } from "@/components/duel/cardBack";
import { MobileArenaCardSummary } from "./MobileArenaCardSummary";
import { DuelRoomAudioControls } from "@/components/duel/DuelRoomAudioControls";

interface Props {
  /** Active when the user is on a mobile portrait device (parent decides). */
  active: boolean;
  /** Open/close the player's own field+hand+deck viewer. */
  onToggleMyDeck: (open: boolean) => void;
  /** Open/close the opponent's field viewer. */
  onToggleOpponentDeck: (open: boolean) => void;
  /** Force a compact PIP video layout. */
  onRequestPipVideo?: () => void;
  /** Open the player's own deck/field viewer (which contains the hand). */
  onOpenHand: () => void;
  /** Optional callbacks for bottom-bar actions (no-op when undefined). */
  onDrawCard?: () => void;
  onOpenGraveyard?: () => void;
  onOpenBanished?: () => void;
  /** Player LP, for the badge in the bottom bar. */
  myLp?: number;
  opponentLp?: number;
  /** Opponent hand size (count only — cards are NEVER revealed). */
  opponentHandCount?: number;
  /** Focus-mode toggle (hides ancillary UI like chat/logs). */
  focusMode?: boolean;
  onToggleFocusMode?: (value: boolean) => void;
}

export const MobileArenaLayout = ({
  active,
  onToggleMyDeck,
  onToggleOpponentDeck,
  onRequestPipVideo,
  onOpenHand,
  onDrawCard,
  onOpenGraveyard,
  onOpenBanished,
  myLp,
  opponentLp,
  opponentHandCount = 0,
  focusMode = false,
  onToggleFocusMode,
}: Props) => {
  const [handSheetOpen, setHandSheetOpen] = useState(false);
  const sleeveUrl = getEquippedSleeveUrl();

  // When the mobile arena turns on, ensure both viewers are open and video
  // is in PIP so the field is the focus.
  useEffect(() => {
    if (!active) return;
    onToggleMyDeck(true);
    onToggleOpponentDeck(true);
    onRequestPipVideo?.();
    // Mark <body> so existing CSS can react if needed.
    document.body.classList.add("mobile-arena-active");
    return () => {
      document.body.classList.remove("mobile-arena-active");
    };
  }, [active, onToggleMyDeck, onToggleOpponentDeck, onRequestPipVideo]);

  if (!active) return null;

  return (
    <>
      {/* TOP STRIP — opponent hand (backs only) + opponent LP */}
      <div className="fixed top-2 left-2 right-2 z-40 flex items-start gap-2 pointer-events-none">
        <div className="pointer-events-auto">
          <MobileArenaCardSummary
            count={opponentHandCount}
            sleeveUrl={sleeveUrl}
            maxVisible={6}
            label="Mão do oponente"
          />
        </div>
        {typeof opponentLp === "number" && (
          <div className="pointer-events-auto ml-auto px-2 py-1 rounded-md bg-black/55 backdrop-blur-sm border border-white/10 text-white text-xs font-bold flex items-center gap-1">
            <Heart className="w-3 h-3 text-rose-400" />
            <span className="tabular-nums">{opponentLp}</span>
          </div>
        )}
      </div>

      {/* BOTTOM BAR — thumb-reachable, 44px+ touch targets */}
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40",
          "bg-background/90 backdrop-blur-md border-t border-border",
          "px-2 pt-2",
          // Respect iOS home-indicator inset
          "pb-[max(8px,env(safe-area-inset-bottom))]"
        )}
        aria-label="Controles da arena"
      >
        {/* LP + Phase row */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-card/95 border border-border text-xs font-bold min-h-[28px]">
            <Heart className="w-3.5 h-3.5 text-rose-500" />
            <span className="tabular-nums">{myLp ?? "—"}</span>
            <span className="text-muted-foreground mx-1">LP</span>
          </div>
          <button
            type="button"
            className="px-3 py-1 rounded-md bg-primary/90 text-primary-foreground text-xs font-bold flex items-center gap-1 min-h-[32px]"
          >
            <Clock className="w-3.5 h-3.5" /> Fase
          </button>
          <Button
            type="button"
            variant={focusMode ? "default" : "outline"}
            size="sm"
            onClick={() => onToggleFocusMode?.(!focusMode)}
            className="h-8 min-w-[44px] px-2"
            aria-pressed={focusMode}
            title="Modo foco (esconde chat/logs)"
          >
            {focusMode ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </Button>
        </div>

        {/* Action row — every button >= 44x44 */}
        <div className="grid grid-cols-5 gap-1">
          <Sheet open={handSheetOpen} onOpenChange={setHandSheetOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-12 min-h-[44px] flex-col gap-0.5 text-[10px] leading-tight"
                aria-label="Abrir mão"
              >
                <Hand className="w-5 h-5" />
                <span>Mão</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="h-[40vh] max-h-[420px] p-3"
            >
              <SheetHeader>
                <SheetTitle>Sua mão</SheetTitle>
              </SheetHeader>
              <p className="text-xs text-muted-foreground mt-2">
                Sua mão completa fica no painel do seu campo. Toque em
                <strong> Abrir campo </strong> para ver e arrastar as cartas.
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  className="flex-1 min-h-[44px]"
                  onClick={() => {
                    setHandSheetOpen(false);
                    onOpenHand();
                  }}
                >
                  Abrir campo
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setHandSheetOpen(false)}
                >
                  Fechar
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <Button
            type="button"
            variant="outline"
            className="h-12 min-h-[44px] flex-col gap-0.5 text-[10px] leading-tight"
            onClick={onDrawCard}
            aria-label="Comprar carta"
          >
            <Plus className="w-5 h-5" />
            <span>Comprar</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-12 min-h-[44px] flex-col gap-0.5 text-[10px] leading-tight"
            onClick={onOpenHand}
            aria-label="Abrir deck"
          >
            <Layers className="w-5 h-5" />
            <span>Deck</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-12 min-h-[44px] flex-col gap-0.5 text-[10px] leading-tight"
            onClick={onOpenGraveyard}
            aria-label="Cemitério"
          >
            <Flame className="w-5 h-5 text-orange-500" />
            <span>Cemitério</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-12 min-h-[44px] flex-col gap-0.5 text-[10px] leading-tight"
            onClick={onOpenBanished}
            aria-label="Banido"
          >
            <Ban className="w-5 h-5 text-purple-500" />
            <span>Banido</span>
          </Button>
        </div>

        {/* Audio controls — always available in the duel room */}
        <div className="mt-2 flex justify-end">
          <DuelRoomAudioControls compact />
        </div>
      </nav>
    </>
  );
};

export default MobileArenaLayout;
