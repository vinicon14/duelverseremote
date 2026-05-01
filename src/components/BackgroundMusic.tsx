/**
 * DuelVerse - Background Music Player
 *
 * Trilha sonora da plataforma:
 * - Se o admin configurar `system_settings.bgm_video_url` (URL de vídeo MP4 ou áudio),
 *   tocamos a faixa de áudio diretamente em loop via elemento <audio> (o navegador
 *   extrai o áudio do contêiner MP4/WebM automaticamente — sem precisar do vídeo).
 * - Caso contrário, usamos o sintetizador interno (src/utils/bgm.ts).
 *
 * Comportamento:
 * - Silenciada por padrão (usuário ativa pelo menu do avatar).
 * - O mute também silencia os SFX (toques/troca de página) — som unificado.
 * - Não toca em /duel/:id, /pro/*, /discord-activity, /share/*.
 *
 * API global:
 *   - window.dispatchEvent(new CustomEvent('duelverse:bgm-toggle'))
 *   - getBgmMuted()
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { startBgm, stopBgm } from "@/utils/bgm";
import { supabase } from "@/integrations/supabase/client";

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

const isYouTubeUrl = (url: string) =>
  /(?:youtube\.com|youtu\.be)/i.test(url);

export const BackgroundMusic = () => {
  const location = useLocation();
  const [muted, setMuted] = useState<boolean>(() => getBgmMuted());
  const [ready, setReady] = useState(false);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Aguarda primeira interação para destravar áudio
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

  // Busca URL configurada pelo admin + escuta mudanças via evento custom
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "bgm_video_url")
          .maybeSingle();
        const url = (data?.value || "").trim();
        // YouTube embeds não tocam diretamente em <audio> — ignoramos e caímos no sintetizador.
        if (url && !isYouTubeUrl(url)) setTrackUrl(url);
        else setTrackUrl(null);
      } catch {
        setTrackUrl(null);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener("duelverse:bgm-url-updated", handler);
    return () => window.removeEventListener("duelverse:bgm-url-updated", handler);
  }, []);

  // Listener para toggle global (mute/unmute mestre)
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
        // Notifica SFX também (já leem localStorage, mas avisamos para UIs reativas)
        window.dispatchEvent(
          new CustomEvent("duelverse:sfx-state", { detail: { muted: next } })
        );
        return next;
      });
    };
    window.addEventListener("duelverse:bgm-toggle", handler);
    return () => window.removeEventListener("duelverse:bgm-toggle", handler);
  }, []);

  // Controla play/stop conforme rota, mute, ready e fonte
  useEffect(() => {
    const blocked = isBlockedRoute(location.pathname);
    const shouldPlay = !muted && !blocked && ready;

    // Sempre limpa a fonte alternativa quando troca de modo
    if (!shouldPlay) {
      stopBgm();
      if (audioRef.current) {
        audioRef.current.pause();
      }
      return;
    }

    if (trackUrl) {
      // Modo: arquivo (vídeo/áudio) configurado pelo admin
      stopBgm();
      let el = audioRef.current;
      if (!el) {
        el = new Audio();
        el.loop = true;
        el.preload = "auto";
        el.volume = 0.32;
        el.crossOrigin = "anonymous";
        audioRef.current = el;
      }
      if (el.src !== trackUrl) {
        el.src = trackUrl;
      }
      el.play().catch(() => {
        // fallback ao sintetizador se a URL falhar (CORS, formato, etc.)
        startBgm(0.32);
      });
    } else {
      // Modo: sintetizador
      if (audioRef.current) audioRef.current.pause();
      startBgm(0.32);
    }
  }, [location.pathname, muted, ready, trackUrl]);

  // Para tudo ao desmontar
  useEffect(() => {
    return () => {
      stopBgm();
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  return null;
};
