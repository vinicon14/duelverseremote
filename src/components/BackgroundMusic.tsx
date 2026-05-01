/**
 * DuelVerse - Background Music Player
 *
 * Toca uma trilha sonora ambiente em loop pela plataforma.
 * - Botão flutuante (canto inferior direito) para mute/unmute.
 * - Volume baixo por padrão (0.18) para não atrapalhar.
 * - Não toca em /duel/:id (sala de duelo) e /pro/* (modo pro).
 * - Persiste preferência de mute em localStorage.
 * - Aguarda primeira interação do usuário (autoplay policy).
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Music, VolumeX } from "lucide-react";

const STORAGE_KEY = "duelverse_bgm_muted";
const VOLUME = 0.18;

// Trilha ambiente CC0 (free.serv.audio / Pixabay-style mirror via CDN público)
// Usamos uma trilha lo-fi/calm com loop via CDN do projeto archive.org.
const TRACK_URL =
  "https://cdn.pixabay.com/download/audio/2022/03/15/audio_1718e49bdb.mp3?filename=lofi-study-112191.mp3";

const isBlockedRoute = (pathname: string) => {
  if (pathname.startsWith("/duel/")) return true;
  if (pathname.startsWith("/pro")) return true;
  if (pathname.startsWith("/discord-activity")) return true;
  if (pathname.startsWith("/share/")) return true;
  return false;
};

export const BackgroundMusic = () => {
  const location = useLocation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [ready, setReady] = useState(false);

  // Inicializa o elemento audio uma única vez
  useEffect(() => {
    const audio = new Audio(TRACK_URL);
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
  }, [location.pathname, muted, ready]);

  const toggleMute = () => {
    setMuted(prev => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  // Esconder botão em rotas bloqueadas
  if (isBlockedRoute(location.pathname)) return null;

  return (
    <button
      type="button"
      onClick={toggleMute}
      aria-label={muted ? "Ativar música de fundo" : "Silenciar música de fundo"}
      title={muted ? "Ativar música de fundo" : "Silenciar música de fundo"}
      className="fixed bottom-4 left-4 z-[60] flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-background/70 text-primary shadow-lg shadow-primary/20 backdrop-blur transition-all hover:scale-110 hover:bg-primary/20 active:scale-95"
    >
      {muted ? (
        <VolumeX className="h-5 w-5" />
      ) : (
        <Music className="h-5 w-5 animate-pulse" />
      )}
    </button>
  );
};
