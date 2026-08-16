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

export class CameraZoomPipeline {
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf: number | null = null;
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

  /** Attach (or reuse) the pipeline for a given source track. */
  async attach(track: MediaStreamTrack): Promise<MediaStreamTrack | null> {
    if (this.source === track && this.outputTrack) return this.outputTrack;
    this.stop();
    this.source = track;

    const videoEl = document.createElement("video");
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.srcObject = new MediaStream([track]);
    this.videoEl = videoEl;
    try {
      await videoEl.play();
    } catch {
      /* ignore */
    }
    await new Promise<void>((resolve) => {
      if (videoEl.videoWidth > 0) return resolve();
      const done = () => resolve();
      videoEl.onloadedmetadata = done;
      setTimeout(done, 1500);
    });

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
      const sw = v.videoWidth || cv.width;
      const sh = v.videoHeight || cv.height;
      const z = this.zoom;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cv.width, cv.height);

      if (sw > 0 && sh > 0) {
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
      }
      this.raf = requestAnimationFrame(draw);
    };
    draw();

    const stream = (canvas as any).captureStream?.(30) as MediaStream | undefined;
    const output = stream?.getVideoTracks()[0] ?? null;
    if (output) {
      output.contentHint = "motion";
      // Mirror the enabled state of the source (camera off toggle)
      output.enabled = track.enabled;
    }
    this.output = output;
    return output;
  }

  syncEnabled() {
    if (this.output && this.source) this.output.enabled = this.source.enabled;
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.output?.stop();
    this.output = null;
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
    }
    this.videoEl = null;
    this.canvas = null;
    this.ctx = null;
    this.source = null;
  }
}
