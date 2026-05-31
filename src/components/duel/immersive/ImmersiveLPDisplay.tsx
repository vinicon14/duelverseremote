/**
 * LP animado do Modo Imersivo.
 *
 * - Contador rolando suavemente entre o valor anterior e o novo.
 * - Badge flutuante "−1500" / "+500" ao detectar mudança.
 * - Pulse vermelho quando LP < 2000 ("Situação de Perigo").
 *
 * É puramente visual; recebe o valor atual via props e mantém o anterior internamente.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useImmersiveMode } from "./ImmersiveModeProvider";

type Props = {
  label: string;
  lp: number;
  align?: "left" | "right";
};

export const ImmersiveLPDisplay = ({ label, lp, align = "left" }: Props) => {
  const { settings } = useImmersiveMode();
  const [displayLp, setDisplayLp] = useState(lp);
  const [delta, setDelta] = useState<number | null>(null);
  const prevLpRef = useRef(lp);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevLpRef.current;
    const to = lp;
    if (from === to) return;

    const diff = to - from;
    setDelta(diff);
    const t = window.setTimeout(() => setDelta(null), 1800);

    const startTs = performance.now();
    const duration = settings.animationsEnabled ? 700 / Math.max(0.5, settings.animationSpeed) : 0;

    const step = (now: number) => {
      const elapsed = now - startTs;
      const p = Math.min(1, duration === 0 ? 1 : elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayLp(Math.round(from + (to - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    prevLpRef.current = to;

    return () => {
      window.clearTimeout(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [lp, settings.animationsEnabled, settings.animationSpeed]);

  const danger = lp > 0 && lp < 2000;
  const dead = lp <= 0;

  return (
    <div
      className={cn(
        "pointer-events-none relative flex flex-col rounded-lg border border-primary/40 bg-background/80 px-3 py-2 backdrop-blur-md shadow-lg",
        align === "right" ? "items-end" : "items-start"
      )}
      style={{ transform: `scale(${settings.lpScale})`, transformOrigin: align === "right" ? "right" : "left" }}
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-2xl font-bold tabular-nums leading-none",
          dead && "text-destructive",
          !dead && danger && "text-destructive animate-pulse",
          !dead && !danger && "text-foreground"
        )}
      >
        {displayLp.toLocaleString("pt-BR")}
      </span>
      {delta !== null && settings.animationsEnabled && (
        <span
          key={delta + "-" + Date.now()}
          className={cn(
            "absolute -top-3 right-2 animate-[fade-in_0.2s_ease-out] font-mono text-sm font-bold drop-shadow-lg",
            delta < 0 ? "text-destructive" : "text-emerald-400"
          )}
          style={{
            animation: `immersive-float-up ${1.6 / Math.max(0.5, settings.animationSpeed)}s ease-out forwards`,
          }}
        >
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </div>
  );
};
