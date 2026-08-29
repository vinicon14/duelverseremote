/**
 * Real camera zoom.
 *
 * 1) If the capture device exposes a native `zoom` capability (most phones),
 *    the zoom is applied directly to the MediaStreamTrack via applyConstraints,
 *    so every remote peer receives the zoomed frames.
 * 2) Otherwise (most webcams / virtual cameras) we run a canvas pipeline that
 *    crops (zoom in) or shrinks (zoom out) the frames and produce a NEW video
 *    track through canvas.captureStream(). That processed track is what gets
 *    sent to the peers, so the opponent also sees the zoom.
 *
 * The pipeline is defensive on purpose: if anything fails (no frames, no
 * canvas support, hidden tab throttling) it reports failure and the caller
 * keeps sending the raw camera track instead of a black/green canvas.
 */

export const getNativeZoomRange = (track?: MediaStreamTrack | null) => {
  if (!track || typeof track.getCapabilities !== "function") return null;
  try {
    const caps: any = track.getCapabilities();
    if (!caps || typeof caps.zoom !== "object") return null;
    const min = Number(caps.zoom.min ?? 1);
    const max = Number(caps.zoom.max ?? 1);
    if (!isFinite(min) || !isFinite(max) || max <= min) return null;
    return { min, max, step: Number(caps.zoom.step ?? 0.1) };
  } catch {
    return null;
  }
};

export const applyNativeZoom = async (track: MediaStreamTrack, zoom: number) => {
  const range = getNativeZoomRange(track);
  if (!range) return false;
  const clamped = Math.min(Math.max(zoom, range.min), range.max);
  try {
    await track.applyConstraints({ advanced: [{ zoom: clamped } as any] } as any);
    return true;
  } catch {
    return false;
  }
};

/**
 * Converts the UI zoom factor (1 = no zoom, 2 = twice as close, ...) into the
 * device's own zoom unit.
 *
 * Mapping the UI range linearly onto the whole device range is wrong: cameras
 * that report huge maximums (e.g. 1..800 in "percent" units) jump straight to
 * an extreme zoom on the very first step. The device minimum is the neutral
 * "1x" value, so we simply scale it by the requested factor.
 */
export const nativeZoomTargetForFactor = (
  range: { min: number; max: number; step?: number },
  factor: number,
) => {
  const baseline = range.min > 0 ? range.min : 1;
  const target = baseline * Math.max(factor, 1);
  return Math.min(Math.max(target, range.min), range.max);
};

const currentNativeZoom = (track: MediaStreamTrack, fallback: number) => {
  try {
    const value = Number((track.getSettings?.() as any)?.zoom);
    return isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
};

/**
 * Applies the native zoom gradually so cameras with a wide zoom range don't
 * snap instantly from one level to another.
 */
export const applyNativeZoomSmooth = async (
  track: MediaStreamTrack,
  factor: number,
  options?: { durationMs?: number; shouldCancel?: () => boolean },
) => {
  const range = getNativeZoomRange(track);
  if (!range) return false;
  const target = nativeZoomTargetForFactor(range, factor);
  const from = currentNativeZoom(track, range.min);
  const durationMs = options?.durationMs ?? 220;
  const steps = Math.min(10, Math.max(1, Math.round(Math.abs(target - from) / Math.max(range.step || 0.1, (range.max - range.min) / 60))));

  if (steps <= 1) return applyNativeZoom(track, target);

  for (let i = 1; i <= steps; i++) {
    if (options?.shouldCancel?.()) return true;
    const value = from + ((target - from) * i) / steps;
    const ok = await applyNativeZoom(track, value);
    if (!ok) return false;
    if (i < steps) await new Promise((r) => setTimeout(r, durationMs / steps));
  }
  return true;
};


export class CameraZoomPipeline {
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private timer: number | null = null;
  private source: MediaStreamTrack | null = null;
  private output: MediaStreamTrack | null = null;
  private zoom = 1;
  private pan = { x: 0, y: 0 };

  get outputTrack() {
    return this.output && this.output.readyState === "live" ? this.output : null;
  }

  get sourceTrack() {
    return this.source;
  }

  setZoom(zoom: number, pan: { x: number; y: number }) {
    this.zoom = zoom;
    this.pan = pan;
  }

  /**
   * Attach (or reuse) the pipeline for a given source track.
   * Returns null when the processed track could not be produced — the caller
   * must then keep using the raw camera track.
   */
  async attach(track: MediaStreamTrack): Promise<MediaStreamTrack | null> {
    if (this.source === track && this.outputTrack) return this.outputTrack;
    this.stop();

    if (track.readyState !== "live") return null;
    this.source = track;

    const videoEl = document.createElement("video");
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;
    // Keep it in the DOM (invisible): detached elements can be paused/throttled
    // by the browser, which freezes the canvas and produces black frames.
    videoEl.style.cssText =
      "position:fixed;left:-10000px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;";
    document.body.appendChild(videoEl);
    videoEl.srcObject = new MediaStream([track]);
    this.videoEl = videoEl;
    try {
      await videoEl.play();
    } catch {
      /* ignore */
    }

    // Wait for real frames; bail out if the source never produces any.
    const ready = await new Promise<boolean>((resolve) => {
      if (videoEl.videoWidth > 0) return resolve(true);
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        resolve(ok);
      };
      videoEl.onloadedmetadata = () => finish(videoEl.videoWidth > 0);
      const poll = window.setInterval(() => {
        if (videoEl.videoWidth > 0) {
          window.clearInterval(poll);
          finish(true);
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(poll);
        finish(videoEl.videoWidth > 0);
      }, 2500);
    });

    if (!ready || this.videoEl !== videoEl) {
      this.stop();
      return null;
    }

    const settings = track.getSettings?.() ?? {};
    const width = videoEl.videoWidth || Number(settings.width) || 1280;
    const height = videoEl.videoHeight || Number(settings.height) || 720;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) {
      this.stop();
      return null;
    }

    const draw = () => {
      const ctx = this.ctx;
      const cv = this.canvas;
      const v = this.videoEl;
      if (!ctx || !cv || !v) return;
      if (v.paused) v.play?.().catch(() => {});
      const sw = v.videoWidth || cv.width;
      const sh = v.videoHeight || cv.height;
      const z = this.zoom;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cv.width, cv.height);

      if (sw > 0 && sh > 0) {
        try {
          if (z >= 1) {
            const cropW = sw / z;
            const cropH = sh / z;
            const maxOffX = (sw - cropW) / 2;
            const maxOffY = (sh - cropH) / 2;
            const offX = Math.max(-maxOffX, Math.min(maxOffX, (this.pan.x / z) * (sw / cv.width)));
            const offY = Math.max(-maxOffY, Math.min(maxOffY, (-this.pan.y / z) * (sh / cv.height)));
            ctx.drawImage(
              v,
              (sw - cropW) / 2 + offX,
              (sh - cropH) / 2 + offY,
              cropW,
              cropH,
              0,
              0,
              cv.width,
              cv.height,
            );
          } else {
            // Zoom out: shrink the frame inside the canvas (pillarbox/letterbox)
            const dw = cv.width * z;
            const dh = cv.height * z;
            ctx.drawImage(v, 0, 0, sw, sh, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh);
          }
        } catch {
          /* frame not ready yet */
        }
      }
    };

    draw();
    // setInterval instead of rAF: rAF is suspended when the tab is hidden,
    // which would freeze the outgoing track for the opponent.
    this.timer = window.setInterval(draw, 1000 / 30);

    const stream = (canvas as any).captureStream?.(30) as MediaStream | undefined;
    const output = stream?.getVideoTracks()[0] ?? null;
    if (!output || output.readyState !== "live") {
      this.stop();
      return null;
    }
    output.contentHint = "motion";
    // Mirror the enabled state of the source (camera off toggle)
    output.enabled = track.enabled;
    this.output = output;
    return output;
  }

  syncEnabled() {
    if (this.output && this.source) this.output.enabled = this.source.enabled;
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.output?.stop();
    this.output = null;
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl.remove();
    }
    this.videoEl = null;
    this.canvas = null;
    this.ctx = null;
    this.source = null;
  }
}
