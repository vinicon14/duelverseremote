/**
 * DuelVerse - Sound Effects (SFX) sintéticos
 *
 * Sons curtos inspirados em Yu-Gi-Oh! gerados com Web Audio API
 * (sem dependência externa, latência zero, ~poucos KBs).
 *
 * Sons disponíveis:
 *   - click       → toques em botões/links (curto "tick" cristalino)
 *   - pageTurn    → mudança de rota / virada de página (whoosh + chime)
 *
 * O usuário pode silenciar via localStorage("duelverse_sfx_muted" = "1").
 * Por padrão os SFX estão ATIVADOS.
 */

const SFX_MUTED_KEY = "duelverse_sfx_muted";
const BGM_MUTED_KEY = "duelverse_bgm_muted";

/**
 * SFX seguem o mute mestre da plataforma (BGM).
 * Se o usuário silenciar o som da plataforma, sons de toque e troca de página
 * também são silenciados. Mantém compat com chave própria de SFX.
 */
export const isSfxMuted = (): boolean => {
  try {
    // Mestre: BGM mute (default = mutado)
    const bgm = localStorage.getItem(BGM_MUTED_KEY);
    const bgmMuted = bgm === null ? true : bgm === "1";
    if (bgmMuted) return true;
    return localStorage.getItem(SFX_MUTED_KEY) === "1";
  } catch {
    return false;
  }
};

export const toggleSfxMuted = () => {
  try {
    const next = !isSfxMuted();
    localStorage.setItem(SFX_MUTED_KEY, next ? "1" : "0");
    window.dispatchEvent(
      new CustomEvent("duelverse:sfx-state", { detail: { muted: next } })
    );
  } catch {}
};

let _ctx: AudioContext | null = null;
const getCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  try {
    if (!_ctx) {
      const Ctor =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      _ctx = new Ctor();
    }
    if (_ctx?.state === "suspended") {
      _ctx.resume().catch(() => {});
    }
    return _ctx;
  } catch {
    return null;
  }
};

const envelope = (
  ctx: AudioContext,
  gain: GainNode,
  attack: number,
  decay: number,
  peak = 0.25
) => {
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
};

/** Toque cristalino curto — botão / interação */
export const playClick = () => {
  if (isSfxMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;

  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    envelope(ctx, gain, 0.005, 0.09, 0.18);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
};

/** Whoosh + chime mágico — virada de página estilo invocação */
export const playPageTurn = () => {
  if (isSfxMuted()) return;
  const ctx = getCtx();
  if (!ctx) return;

  try {
    // 1) Whoosh com noise filtrado
    const bufferSize = ctx.sampleRate * 0.35;
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(
      2400,
      ctx.currentTime + 0.3
    );
    filter.Q.value = 1.2;

    const noiseGain = ctx.createGain();
    envelope(ctx, noiseGain, 0.02, 0.3, 0.16);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + 0.4);

    // 2) Chime mágico (duas notas — quinta perfeita)
    const tones = [880, 1318.5];
    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(g);
      g.connect(ctx.destination);

      const startAt = ctx.currentTime + 0.06 + i * 0.05;
      g.gain.setValueAtTime(0.0001, startAt);
      g.gain.exponentialRampToValueAtTime(0.14, startAt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.45);
      osc.start(startAt);
      osc.stop(startAt + 0.5);
    });
  } catch {}
};
