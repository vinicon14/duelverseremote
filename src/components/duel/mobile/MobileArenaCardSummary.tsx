/**
 * MobileArenaCardSummary
 *
 * Renders a compact strip of card-backs to represent the opponent's hidden
 * hand (or any face-down pile) on the mobile arena layout.
 *
 * Privacy: this component NEVER renders real card faces — only backs.
 * It receives only a count + optional sleeve URL, so private opponent
 * data is never exposed to the renderer.
 */
import { cn } from "@/lib/utils";
import { Hand } from "lucide-react";
import { getCardBackUrl } from "@/components/duel/cardBack";

interface Props {
  count: number;
  sleeveUrl?: string | null;
  /** Cap the visible backs; the badge still shows the true count. */
  maxVisible?: number;
  className?: string;
  label?: string;
}

export const MobileArenaCardSummary = ({
  count,
  sleeveUrl,
  maxVisible = 6,
  className,
  label,
}: Props) => {
  const safeCount = Math.max(0, Math.floor(count || 0));
  const visible = Math.min(safeCount, Math.max(1, maxVisible));
  const backUrl = getCardBackUrl(sleeveUrl);

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 rounded-md bg-black/40 backdrop-blur-sm border border-white/10",
        className
      )}
      aria-label={label ?? "Mão do oponente (oculta)"}
    >
      <Hand className="w-3.5 h-3.5 text-white/80 shrink-0" />
      <span className="text-[11px] font-semibold text-white/90 tabular-nums shrink-0">
        {safeCount}
      </span>
      <div className="relative flex items-center h-8 grow overflow-hidden">
        {safeCount === 0 ? (
          <span className="text-[10px] text-white/60">vazia</span>
        ) : (
          Array.from({ length: visible }).map((_, i) => (
            <img
              key={i}
              src={backUrl}
              alt=""
              aria-hidden
              className="absolute h-8 w-[22px] object-cover rounded-[2px] border border-white/20 shadow"
              style={{ left: `${i * 12}px` }}
              draggable={false}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default MobileArenaCardSummary;
