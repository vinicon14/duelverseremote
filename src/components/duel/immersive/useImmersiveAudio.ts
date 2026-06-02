import { useEffect, useRef, useState } from "react";
import { startBgm, stopBgm } from "@/utils/bgm";
import { supabase } from "@/integrations/supabase/client";
import type { DuelEvent } from "@/hooks/useDuelEvents";
import type { ImmersiveSettings } from "./ImmersiveModeProvider";

let cueCtx: AudioContext | null = null;

const getCueContext = () => {
  if (typeof window === "undefined") return null;
  try {
    if (!cueCtx) {
      const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
      const Ctor = audioWindow.AudioContext || audioWindow.webkitAudioContext;
      if (!Ctor) return null;
      cueCtx = new Ctor();
    }
    if (cueCtx.state === "suspended") cueCtx.resume().catch(() => {});
    return cueCtx;
  } catch {
    return null;
  }
};

const playCue = (eventType: string, volume: number) => {
  if (volume <= 0) return;
  const ctx = getCueContext();
  if (!ctx) return;

  const freq =
    eventType.includes("summon") ? 620 :
    eventType.includes("lp") ? 330 :
    eventType.includes("shuffle") ? 520 :
    eventType.includes("finish") ? 180 :
    440;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const now = ctx.currentTime;

  osc.type = eventType.includes("finish") ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 1.35, now + 0.12);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2200, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.01, volume * 0.18), now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.4);
};

const shouldNarrate = (event: DuelEvent, settings: ImmersiveSettings) => {
  if (!settings.narrationEnabled || settings.narrationFrequency === "off") return false;
  if (settings.narrationFrequency === "all") return true;
  return ["mode_started", "lp_change", "lp_set", "summon", "duel_finished"].includes(event.event_type);
};

const isYouTubeUrl = (url: string) =>
  /(?:youtube\.com|youtu\.be)/i.test(url);

export const useImmersiveAudio = (active: boolean, settings: ImmersiveSettings, lastEvent?: DuelEvent | null) => {
  const lastEventIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadTrackUrl = async () => {
      try {
        const { data } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "bgm_video_url")
          .maybeSingle();
        const url = (data?.value || "").trim();
        setTrackUrl(url && !isYouTubeUrl(url) ? url : null);
      } catch {
        setTrackUrl(null);
      }
    };

    loadTrackUrl();
    window.addEventListener("duelverse:bgm-url-updated", loadTrackUrl);
    return () => window.removeEventListener("duelverse:bgm-url-updated", loadTrackUrl);
  }, []);

  useEffect(() => {
    const volume = (settings.musicVolume / 100) * 0.32;

    if (!active || settings.musicVolume <= 0) {
      stopBgm();
      audioRef.current?.pause();
      return;
    }

    if (trackUrl) {
      stopBgm();
      let audio = audioRef.current;
      if (!audio) {
        audio = new Audio();
        audio.loop = true;
        audio.preload = "auto";
        audio.crossOrigin = "anonymous";
        audioRef.current = audio;
      }
      if (audio.src !== trackUrl) {
        audio.src = trackUrl;
      }
      audio.volume = volume;
      audio.play().catch(() => startBgm(volume));

      return () => {
        audio.pause();
        stopBgm();
      };
    }

    audioRef.current?.pause();
    startBgm(volume);
    return () => stopBgm();
  }, [active, settings.musicVolume, trackUrl]);

  useEffect(() => {
    if (!active || !lastEvent || lastEventIdRef.current === lastEvent.id) return;
    lastEventIdRef.current = lastEvent.id;

    playCue(lastEvent.event_type, settings.sfxVolume / 100);

    if (!shouldNarrate(lastEvent, settings) || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(lastEvent.message);
    utterance.lang = settings.narrationLanguage;
    utterance.volume = Math.max(0, Math.min(1, settings.narrationVolume / 100));
    utterance.rate = 1;

    const restoreVolume = () => {
      if (active && settings.musicVolume > 0) {
        if (trackUrl && audioRef.current) {
          audioRef.current.volume = (settings.musicVolume / 100) * 0.32;
        } else {
          startBgm((settings.musicVolume / 100) * 0.32);
        }
      }
    };

    if (settings.musicVolume > 0) {
      if (trackUrl && audioRef.current) {
        audioRef.current.volume = (settings.musicVolume / 100) * 0.08;
      } else {
        startBgm((settings.musicVolume / 100) * 0.08);
      }
    }
    utterance.onend = restoreVolume;
    utterance.onerror = restoreVolume;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [
    active,
    lastEvent,
    settings.sfxVolume,
    settings.narrationEnabled,
    settings.narrationFrequency,
    settings.narrationLanguage,
    settings.narrationVolume,
    settings.musicVolume,
    settings,
    trackUrl,
  ]);
};
