/**
 * DuelVerse - Background Music sintetizada (Web Audio API)
 *
 * Loop melódico inspirado em Yu-Gi-Oh! (épico/misterioso),
 * gerado em tempo real — sem assets externos, sem CORS, sem 404.
 */

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
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

// Escala menor harmônica (sensação épica/oriental, à la YGO)
// A3 menor harmônica: A3, B3, C4, D4, E4, F4, G#4, A4
const NOTES: Record<string, number> = {
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  Gs4: 415.3,
  A4: 440.0,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  Gs5: 830.61,
  A5: 880.0,
  A2: 110.0,
  E2: 82.41,
  F2: 87.31,
  D2: 73.42,
};

// Padrão melódico (notas, duração em batidas)
const MELODY: Array<[string, number]> = [
  ["A4", 1], ["C5", 0.5], ["E5", 0.5], ["A5", 1], ["Gs5", 1],
  ["E5", 1], ["F5", 0.5], ["E5", 0.5], ["D5", 1], ["C5", 1],
  ["A4", 1], ["B4" in NOTES ? "B4" : "A4", 0.5], ["C5", 0.5], ["E5", 1], ["D5", 1],
  ["C5", 2], ["A4", 2],
];

// Linha de baixo
const BASS: Array<[string, number]> = [
  ["A2", 2], ["F2", 2], ["E2", 2], ["A2", 2],
  ["A2", 2], ["D2", 2], ["E2", 2], ["A2", 2],
];

const BPM = 84;
const BEAT = 60 / BPM;

const playNote = (
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType = "triangle",
  peak = 0.08
) => {
  if (!ctx || !masterGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  // Envelope ADSR simples
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(peak, startAt + 0.03);
  g.gain.exponentialRampToValueAtTime(peak * 0.6, startAt + duration * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(g);
  g.connect(masterGain);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
};

const scheduleLoop = () => {
  if (!ctx || !playing) return;
  const start = ctx.currentTime + 0.05;

  // Melodia
  let t = 0;
  for (const [note, beats] of MELODY) {
    const freq = NOTES[note] ?? NOTES.A4;
    playNote(freq, start + t * BEAT, beats * BEAT, "triangle", 0.07);
    // Harmonia (oitava acima, mais suave)
    playNote(freq * 2, start + t * BEAT, beats * BEAT, "sine", 0.025);
    t += beats;
  }
  const melodyDur = t * BEAT;

  // Baixo
  let bt = 0;
  for (const [note, beats] of BASS) {
    const freq = NOTES[note] ?? NOTES.A2;
    playNote(freq, start + bt * BEAT, beats * BEAT, "sawtooth", 0.05);
    bt += beats;
  }
  const bassDur = bt * BEAT;

  const totalDur = Math.max(melodyDur, bassDur);
  // Reagenda próximo ciclo
  timeoutId = window.setTimeout(() => {
    if (playing) scheduleLoop();
  }, Math.max(50, (totalDur - 0.1) * 1000));
};

export const startBgm = (volume = 0.35) => {
  const c = getCtx();
  if (!c) return;
  if (playing) {
    if (masterGain) masterGain.gain.value = volume;
    return;
  }
  if (!masterGain) {
    masterGain = c.createGain();
    masterGain.gain.value = volume;
    masterGain.connect(c.destination);
  } else {
    masterGain.gain.value = volume;
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
        ctx.currentTime + 0.4
      );
    } catch {}
  }
};

export const isBgmPlaying = () => playing;
