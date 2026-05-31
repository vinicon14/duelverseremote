import { useEffect, useRef } from "react";
import { startBgm, stopBgm } from "@/utils/bgm";
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

export const useImmersiveAudio = (active: boolean, settings: ImmersiveSettings, lastEvent?: DuelEvent | null) => {
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active || settings.musicVolume <= 0) {
      stopBgm();
      return;
    }

    startBgm((settings.musicVolume / 100) * 0.32);
    return () => stopBgm();
  }, [active, settings.musicVolume]);

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
        startBgm((settings.musicVolume / 100) * 0.32);
      }
    };

    if (settings.musicVolume > 0) {
      startBgm((settings.musicVolume / 100) * 0.08);
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
  ]);
};
