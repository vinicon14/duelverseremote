/**
 * DuelVerse - Background Music Player
 *
 * Trilha sonora ambiente inspirada em Yu-Gi-Oh!.
 * - Silenciada por padrão (usuário ativa pelo menu do avatar).
 * - Não toca em /duel/:id, /pro/*, /discord-activity, /share/*.
 * - Persiste preferência em localStorage.
 *
 * API global:
 *   - window.dispatchEvent(new CustomEvent('duelverse:bgm-toggle'))
 *   - getBgmMuted()
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "duelverse_bgm_muted";
const VOLUME = 0.22;

// Trilha inspirada em Yu-Gi-Oh! (tema épico/dramático estilo duelo).
// Hospedada no Internet Archive (domínio público / fan upload).
const YGO_THEME_TRACK =
  "https://archive.org/download/yu-gi-oh-duel-monsters-ost/01%20-%20Yu-Gi-Oh%21%20Duel%20Monsters%20Theme.mp3";

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
    // Default: mutado (true) se nunca configurado
    if (v === null) return true;
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState<boolean>(() => getBgmMuted());
  const [ready, setReady] = useState(false);

  // Cria o elemento audio uma vez
  useEffect(() => {
    const audio = new Audio(YGO_THEME_TRACK);
    audio.loop = true;
    audio.volume = VOLUME;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Aguarda primeira interação para destravar autoplay
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

  // Controla play/pause conforme rota, mute e ready
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const blocked = isBlockedRoute(location.pathname);

    if (muted || blocked || !ready) {
      audio.pause();
      return;
    }

    audio.volume = VOLUME;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // autoplay bloqueado
      });
    }
  }, [location.pathname, muted, ready]);

  return null;
};
