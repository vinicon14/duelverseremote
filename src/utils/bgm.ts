/**
 * DuelVerse - Background Music sintetizada (Web Audio API)
 *
 * Trilha épica/cinematográfica inspirada em Yu-Gi-Oh!:
 * - Progressão harmônica em Lá menor com pads orquestrais
 * - Melodia em escala menor harmônica (toque oriental/místico)
 * - Linha de baixo pulsante
 * - Percussão sintetizada (kick + hi-hat) para dar groove
 * - Reverb/delay simulado por camadas
 *
 * Tudo gerado em tempo real — sem assets externos.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let convolver: ConvolverNode | null = null;
let wetGain: GainNode | null = null;
let dryGain: GainNode | null = null;
let timeoutId: number | null = null;
let playing = false;

const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
};

// Cria um impulse response sintético para reverb (sala média)
const buildReverbIR = (audioCtx: AudioContext, seconds = 2.2, decay = 2.5) => {
  const rate = audioCtx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = audioCtx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
};

// === Frequências (Hz) ===
const N: Record<string, number> = {
  // Bass
  A1: 55.0, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, C3: 130.81, D3: 146.83, E3: 164.81,
  // Mid / Pad
  A3: 220.0, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, Gs4: 415.3, A4: 440.0,
  // Lead
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, Gs5: 830.61, A5: 880.0, B5: 987.77, C6: 1046.5,
};

// Progressão (8 compassos, 4 batidas cada): Am - F - C - G - Am - Dm - E - Am
const CHORDS: Array<[number, number, number]> = [
  [N.A3, N.C4, N.E4],   // Am
  [N.F4 / 2, N.A3, N.C4], // F (raiz F3)
  [N.C4, N.E4, N.G2 * 2], // C
  [N.G2 * 2, N.B3, N.D4], // G
  [N.A3, N.C4, N.E4],   // Am
  [N.D3 * 2, N.F4, N.A3], // Dm
  [N.E3 * 2, N.Gs4, N.B3], // E (dominante)
  [N.A3, N.C4, N.E4],   // Am
];

// Melodia (notas, batidas) — 32 batidas no total
const MELODY: Array<[string, number]> = [
  ["A4", 1], ["C5", 0.5], ["E5", 0.5], ["A5", 1], ["Gs5", 1],
  ["F5", 1.5], ["E5", 0.5], ["D5", 1], ["C5", 1],
  ["E5", 1], ["G2", 0.5], ["C5", 0.5], ["E5", 1], ["D5", 1],
  ["B3", 0.5], ["D5", 0.5], ["F5", 1], ["E5", 2],
  ["A4", 1], ["E5", 1], ["F5", 1], ["E5", 1],
  ["D5", 1.5], ["C5", 0.5], ["B3", 1], ["A4", 1],
  ["Gs4", 2], ["B3", 1], ["E5", 1],
  ["A5", 2], ["E5", 2],
];

// Baixo pulsante (1 nota por batida = 32 notas)
const BASS_PATTERN: number[] = [
  N.A1, N.A1, N.E2, N.A1,
  N.F2, N.F2, N.C3, N.F2,
  N.C3, N.C3, N.G2, N.C3,
  N.G2, N.G2, N.D3, N.G2,
  N.A1, N.A1, N.E2, N.A1,
  N.D3, N.D3, N.A1, N.D3,
  N.E2, N.E2, N.B3 / 2, N.E2,
  N.A1, N.E2, N.A1, N.E2,
];

const BPM = 92;
const BEAT = 60 / BPM;
const TOTAL_BEATS = 32;

// === Helpers de síntese ===

const playNote = (
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType = "triangle",
  peak = 0.08,
  destination?: AudioNode
) => {
  if (!ctx) return;
  const dest = destination ?? masterGain!;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  // Leve detune para encorpar
  osc.detune.value = (Math.random() - 0.5) * 6;

  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(peak, startAt + 0.025);
  g.gain.exponentialRampToValueAtTime(peak * 0.55, startAt + duration * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(g);
  g.connect(dest);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
};

// Pad orquestral (acordes sustentados, dois osciladores levemente desafinados)
const playPad = (freqs: number[], startAt: number, duration: number) => {
  if (!ctx || !masterGain) return;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(800, startAt);
  filter.frequency.linearRampToValueAtTime(1800, startAt + duration * 0.5);
  filter.frequency.linearRampToValueAtTime(900, startAt + duration);
  filter.Q.value = 2;

  const padGain = ctx.createGain();
  padGain.gain.setValueAtTime(0.0001, startAt);
  padGain.gain.exponentialRampToValueAtTime(0.06, startAt + 0.6);
  padGain.gain.exponentialRampToValueAtTime(0.04, startAt + duration * 0.7);
  padGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  filter.connect(padGain);
  padGain.connect(dryGain ?? masterGain);
  if (wetGain) padGain.connect(wetGain);

  for (const f of freqs) {
    for (const detune of [-7, 0, 7]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(filter);
      o.start(startAt);
      o.stop(startAt + duration + 0.1);
    }
  }
};

// Kick drum sintetizado
const playKick = (startAt: number) => {
  if (!ctx || !masterGain) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(120, startAt);
  o.frequency.exponentialRampToValueAtTime(40, startAt + 0.15);
  g.gain.setValueAtTime(0.35, startAt);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + 0.25);
  o.connect(g);
  g.connect(masterGain);
  o.start(startAt);
  o.stop(startAt + 0.3);
};

// Hi-hat (ruído filtrado)
const playHat = (startAt: number, accent = false) => {
  if (!ctx || !masterGain) return;
  const bufSize = Math.floor(ctx.sampleRate * 0.05);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(accent ? 0.12 : 0.05, startAt);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + 0.05);
  src.connect(hp);
  hp.connect(g);
  g.connect(masterGain);
  src.start(startAt);
  src.stop(startAt + 0.06);
};

// === Loop principal ===
const scheduleLoop = () => {
  if (!ctx || !playing) return;
  const start = ctx.currentTime + 0.1;

  // Pads (1 acorde a cada 4 batidas)
  for (let i = 0; i < CHORDS.length; i++) {
    playPad(CHORDS[i], start + i * 4 * BEAT, 4 * BEAT);
  }

  // Melodia
  let t = 0;
  for (const [note, beats] of MELODY) {
    const freq = N[note] ?? N.A4;
    // Lead principal
    playNote(freq, start + t * BEAT, beats * BEAT, "triangle", 0.09, dryGain ?? masterGain!);
    // Camada doce uma oitava acima
    playNote(freq * 2, start + t * BEAT, beats * BEAT, "sine", 0.025, wetGain ?? masterGain!);
    t += beats;
  }

  // Baixo (1 nota por batida)
  for (let b = 0; b < BASS_PATTERN.length; b++) {
    playNote(BASS_PATTERN[b], start + b * BEAT, BEAT * 0.9, "sawtooth", 0.07, dryGain ?? masterGain!);
    // Sub
    playNote(BASS_PATTERN[b] / 2, start + b * BEAT, BEAT * 0.9, "sine", 0.05, masterGain!);
  }

  // Percussão
  for (let b = 0; b < TOTAL_BEATS; b++) {
    // Kick nas batidas 1 e 3 de cada compasso (cada compasso = 4 batidas)
    const inBar = b % 4;
    if (inBar === 0 || inBar === 2) playKick(start + b * BEAT);
    // Hi-hat em colcheias
    playHat(start + b * BEAT, inBar === 0);
    playHat(start + (b + 0.5) * BEAT, false);
  }

  const totalDur = TOTAL_BEATS * BEAT;
  timeoutId = window.setTimeout(() => {
    if (playing) scheduleLoop();
  }, Math.max(50, (totalDur - 0.15) * 1000));
};

export const startBgm = (volume = 0.32) => {
  const c = getCtx();
  if (!c) return;
  if (playing) {
    if (masterGain) masterGain.gain.value = volume;
    return;
  }

  // Cadeia: dry + wet(reverb) -> master -> destination
  if (!masterGain) {
    masterGain = c.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(c.destination);
  } else {
    masterGain.gain.value = volume;
  }

  if (!convolver) {
    convolver = c.createConvolver();
    convolver.buffer = buildReverbIR(c, 2.4, 2.8);
    wetGain = c.createGain();
    wetGain.gain.value = 0.35;
    dryGain = c.createGain();
    dryGain.gain.value = 0.85;
    wetGain.connect(convolver);
    convolver.connect(masterGain);
    dryGain.connect(masterGain);
  }

  playing = true;
  scheduleLoop();
};

export const stopBgm = () => {
  playing = false;
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  if (masterGain && ctx) {
    try {
      masterGain.gain.cancelScheduledValues(ctx.currentTime);
      masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
      masterGain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + 0.5
      );
    } catch {}
  }
};

export const isBgmPlaying = () => playing;
