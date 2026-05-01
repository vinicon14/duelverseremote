/**
 * DuelVerse - Background Music Player
 *
 * Trilha sonora ambiente sintetizada (Web Audio API) inspirada em Yu-Gi-Oh!.
 * - Silenciada por padrão (usuário ativa pelo menu do avatar).
 * - Não toca em /duel/:id, /pro/*, /discord-activity, /share/*.
 * - Persiste preferência em localStorage.
 *
 * API global:
 *   - window.dispatchEvent(new CustomEvent('duelverse:bgm-toggle'))
 *   - getBgmMuted()
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { startBgm, stopBgm } from "@/utils/bgm";

const STORAGE_KEY = "duelverse_bgm_muted";

const isBlockedRoute = (pathname: string) => {
  if (pathname.startsWith("/duel/")) return true;
  if (pathname.startsWith("/pro")) return true;
  if (pathname.startsWith("/discord-activity")) return true;
  if (pathname.startsWith("/share/")) return true;
  return false;
};

export const getBgmMuted = (): boolean => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true; // mutado por padrão
    return v === "1";
  } catch {
    return true;
  }
};

export const toggleBgm = () => {
  window.dispatchEvent(new CustomEvent("duelverse:bgm-toggle"));
};

export const BackgroundMusic = () => {
  const location = useLocation();
  const [muted, setMuted] = useState<boolean>(() => getBgmMuted());
  const [ready, setReady] = useState(false);

  // Aguarda primeira interação para destravar AudioContext
  useEffect(() => {
    const unlock = () => {
      setReady(true);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  // Listener para toggle global
  useEffect(() => {
    const handler = () => {
      setMuted((prev) => {
        const next = !prev;
        try {
          localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {}
        window.dispatchEvent(
          new CustomEvent("duelverse:bgm-state", { detail: { muted: next } })
        );
        return next;
      });
    };
    window.addEventListener("duelverse:bgm-toggle", handler);
    return () => window.removeEventListener("duelverse:bgm-toggle", handler);
  }, []);

  // Controla play/stop conforme rota, mute e ready
  useEffect(() => {
    const blocked = isBlockedRoute(location.pathname);
    if (muted || blocked || !ready) {
      stopBgm();
      return;
    }
    startBgm(0.32);
  }, [location.pathname, muted, ready]);

  // Para tudo ao desmontar
  useEffect(() => {
    return () => stopBgm();
  }, []);

  return null;
};
