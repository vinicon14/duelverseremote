/**
 * DuelVerse - Sound Effects Provider
 *
 * Anexa listeners globais para tocar SFX estilo Yu-Gi-Oh!:
 *   - "click" em botões/links/elementos role="button"
 *   - "pageTurn" em mudança de rota
 *
 * Usa src/utils/sfx.ts (Web Audio API sintético, sem assets externos).
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { playClick, playPageTurn, isSfxMuted } from "@/utils/sfx";

const isInteractive = (el: Element | null): boolean => {
  if (!el) return false;
  const node = el as HTMLElement;
  if (node.closest("[data-no-sfx]")) return false;
  if (
    node.closest(
      'button, a, [role="button"], [role="menuitem"], [role="tab"], [role="option"], summary, label[for], input[type="checkbox"], input[type="radio"], input[type="submit"], input[type="button"]'
    )
  ) {
    return true;
  }
  return false;
};

export const SoundEffectsProvider = () => {
  const location = useLocation();
  const lastPathRef = useRef(location.pathname);
  const mountedAtRef = useRef(Date.now());

  // Click SFX global
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (isSfxMuted()) return;
      const target = e.target as Element | null;
      if (isInteractive(target)) {
        playClick();
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  // Page turn SFX em mudança de rota
  useEffect(() => {
    if (location.pathname === lastPathRef.current) return;
    lastPathRef.current = location.pathname;
    // Evita tocar no primeiríssimo carregamento
    if (Date.now() - mountedAtRef.current < 500) return;
    playPageTurn();
  }, [location.pathname]);

  return null;
};
