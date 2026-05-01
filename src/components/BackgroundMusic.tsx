/**
 * DuelVerse - Background Music Player
 *
 * Toca o ringtone do YGO Advanced em loop como trilha de fundo da plataforma.
 * - Sem botão flutuante. O toggle agora vive no menu do avatar (Navbar),
 *   entre o item "Perfil" e "Sair".
 * - Volume baixo por padrão (0.18).
 * - Não toca em /duel/:id, /pro/*, /discord-activity, /share/*.
 * - Persiste preferência em localStorage.
 *
 * API global:
 *   - window.dispatchEvent(new CustomEvent('duelverse:bgm-toggle'))
 *   - getBgmMuted() / subscribeBgm(cb)
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "duelverse_bgm_muted";
const VOLUME = 0.18;
// Fallback caso o ringtone não esteja configurado
const FALLBACK_TRACK =
  "https://xxttwzewtqxvpgefggah.supabase.co/storage/v1/object/public/ringtones/ygo/ringtone.mp3";

const isBlockedRoute = (pathname: string) => {
  if (pathname.startsWith("/duel/")) return true;
  if (pathname.startsWith("/pro")) return true;
  if (pathname.startsWith("/discord-activity")) return true;
  if (pathname.startsWith("/share/")) return true;
  return false;
};

// Helpers para o resto do app
export const getBgmMuted = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export const toggleBgm = () => {
  window.dispatchEvent(new CustomEvent("duelverse:bgm-toggle"));
};

export const BackgroundMusic = () => {
  const location = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [trackUrl, setTrackUrl] = useState<string>(FALLBACK_TRACK);
  const [muted, setMuted] = useState<boolean>(() => getBgmMuted());
  const [ready, setReady] = useState(false);

  // Busca a URL do ringtone YGO configurado pelo admin
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "ringtone_ygo")
          .maybeSingle();
        if (!cancelled && data?.value) {
          // Remove cache-buster ?t=... para reutilização do cache do navegador
          const clean = String(data.value).split("?t=")[0];
          setTrackUrl(clean);
        }
      } catch {
        // mantém fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Recria o elemento audio quando a URL muda
  useEffect(() => {
    const audio = new Audio(trackUrl);
    audio.loop = true;
    audio.volume = VOLUME;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [trackUrl]);

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
        // autoplay bloqueado — usuário precisa interagir mais uma vez
      });
    }
  }, [location.pathname, muted, ready, trackUrl]);

  return null;
};
